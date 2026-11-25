/**
 * @file PM-100 — Testes de runtime, faixa UI persistente e bloqueio anti-vazamento nas 3 saídas de rede.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  REHEARSAL_STORAGE_KEY,
  REHEARSAL_DATA_PREFIX,
  REHEARSAL_BANNER_ID,
  REHEARSAL_WIPE_BTN_ID,
  REHEARSAL_EVENT_NAME,
  isRehearsalMode,
  isRehearsalPayload,
  enableRehearsalMode,
  disableRehearsalMode,
  wipeRehearsalData,
  renderRehearsalBannerHtml,
  refreshRehearsalBanner,
  startRehearsalBanner,
} from "../client/js/rehearsal-mode.js";
import {
  setBroadcastChannel,
  postBroadcastChannel,
  relayToMesh,
  broadcastToMesh,
  sendDirectMessageTransport,
} from "../client/js/peers-transport.js";
import {
  broadcastGossip,
  broadcastGossipUpdate,
  broadcastGossipDelete,
} from "../client/js/peers-gossip.js";
import {
  setCentralMemoryAutoPush,
  notifyCentralMemory,
  pushEventToCentralMemory,
  syncWithCentralMemory,
} from "../client/js/central-memory.js";
import { uploadToTurbo, postData, postBinary } from "../client/js/upload.js";
import { waitUntil } from "./helpers/wait-until.js";

/** Cria par (banner, botão) para o mock mínimo de DOM. */
function makeBannerNodes(html, byId, onRemove) {
  const listeners = new Map();
  const btn = {
    id: REHEARSAL_WIPE_BTN_ID,
    addEventListener: (ev, fn) => listeners.set(ev, fn),
    click: () => listeners.get("click")?.(),
  };
  const el = {
    id: REHEARSAL_BANNER_ID,
    html,
    removed: false,
    remove() {
      this.removed = true;
      byId.delete(REHEARSAL_BANNER_ID);
      byId.delete(REHEARSAL_WIPE_BTN_ID);
      onRemove(this);
    },
  };
  return { el, btn };
}

/** Cria um Document mínimo em memória para testar montagem, remoção e clique da faixa UI. */
function createFakeDom() {
  const byId = new Map();
  let bannerNode = null;
  return {
    body: {
      prepend(node) {
        bannerNode = node;
        byId.set(REHEARSAL_BANNER_ID, node);
      },
    },
    createElement() {
      let parsed = null;
      return {
        set innerHTML(html) {
          parsed = makeBannerNodes(html, byId, (el) => {
            if (bannerNode === el) bannerNode = null;
          });
          byId.set(REHEARSAL_WIPE_BTN_ID, parsed.btn);
        },
        get firstElementChild() {
          return parsed?.el || null;
        },
      };
    },
    getElementById: (id) => byId.get(id) || null,
    getBanner: () => bannerNode,
  };
}

/** Cria um Storage simples em memória para testes isolados. */
function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("PM-100: liga/desliga estado local, persiste e faz fallback sem storage", () => {
  localStorage.clear();
  disableRehearsalMode();
  assert.equal(isRehearsalMode(), false);

  assert.equal(enableRehearsalMode(), true);
  assert.equal(isRehearsalMode(), true);
  assert.equal(localStorage.getItem(REHEARSAL_STORAGE_KEY), "1");

  assert.equal(disableRehearsalMode(), false);
  assert.equal(isRehearsalMode(), false);
  assert.equal(localStorage.getItem(REHEARSAL_STORAGE_KEY), null);

  const brokenStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };
  enableRehearsalMode({ storage: brokenStorage, doc: null, win: null });
  assert.equal(isRehearsalMode(brokenStorage), true);
  disableRehearsalMode({ storage: brokenStorage, doc: null, win: null });
  assert.equal(isRehearsalMode(brokenStorage), false);
});

test("PM-100: isRehearsalPayload detecta flags, modos, canais e prefixo rehearsal_", () => {
  assert.equal(isRehearsalPayload(null), false);
  assert.equal(isRehearsalPayload({ id: "p1", author: "usr_normal" }), false);
  assert.equal(isRehearsalPayload({ rehearsal: true }), true);
  assert.equal(isRehearsalPayload({ mode: "rehearsal" }), true);
  assert.equal(isRehearsalPayload({ channel: "rehearsal" }), true);
  assert.equal(isRehearsalPayload({ author: "rehearsal_alice" }), true);
  assert.equal(isRehearsalPayload({ type: "GOSSIP", item: { author: "rehearsal_bob" } }), true);
});

test("PM-100: renderRehearsalBannerHtml escapa HTML e inclui role='status' e textos canônicos", () => {
  const html = renderRehearsalBannerHtml();
  assert.match(html, /role="status"/);
  assert.match(html, /Modo Ensaio — nada sai deste aparelho/);
  assert.match(html, /Apagar ensaio e sair/);

  const xss = renderRehearsalBannerHtml({
    text: '<img src=x onerror="alert(1)">',
    buttonLabel: '<b>"sair"</b>',
  });
  assert.doesNotMatch(xss, /<img/);
  assert.doesNotMatch(xss, /<b>/);
  assert.match(xss, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(xss, /&lt;b&gt;&quot;sair&quot;&lt;\/b&gt;/);
});

test("PM-100: faixa UI monta, não duplica, reage a eventos e apaga tudo ao clicar", async () => {
  localStorage.clear();
  const doc = createFakeDom();
  const storage = createMemoryStorage({
    [`${REHEARSAL_DATA_PREFIX}draft`]: "rascunho",
    "vox-regular-pref": "manter",
  });
  const session = createMemoryStorage({ [`${REHEARSAL_DATA_PREFIX}tmp`]: "1" });
  const winListeners = new Map();
  const win = {
    addEventListener: (ev, fn) => winListeners.set(ev, fn),
    dispatchEvent: (ev) => winListeners.get(ev.type)?.(ev),
  };
  let cacheCleared = false;
  const onWipe = async () => {
    cacheCleared = true;
  };

  assert.equal(startRehearsalBanner({ doc, win, storage, session, onWipe }), false);
  assert.equal(doc.getBanner(), null);

  enableRehearsalMode({ storage, doc, win });
  assert.equal(refreshRehearsalBanner({ doc, storage, session, win, onWipe }), true);
  assert.ok(doc.getBanner());

  doc.getElementById(REHEARSAL_WIPE_BTN_ID).click();
  await waitUntil(() => !isRehearsalMode(storage) && cacheCleared);

  assert.equal(isRehearsalMode(storage), false);
  assert.equal(cacheCleared, true);
  assert.equal(storage.getItem(`${REHEARSAL_DATA_PREFIX}draft`), null);
  assert.equal(storage.getItem("vox-regular-pref"), "manter");
  assert.equal(session.getItem(`${REHEARSAL_DATA_PREFIX}tmp`), null);
  assert.equal(doc.getBanner(), null);

  storage.setItem(REHEARSAL_STORAGE_KEY, "1");
  winListeners.get("storage")?.({ key: REHEARSAL_STORAGE_KEY });
  assert.ok(doc.getBanner());
  await wipeRehearsalData({ storage, session, doc, win });
  assert.equal(doc.getBanner(), null);
  assert.equal(REHEARSAL_EVENT_NAME, "vox:rehearsal-mode-change");
});

test("PM-100 anti-vazamento: saída #1 (gossip/malha P2P/DM) não envia nada em Modo Ensaio", () => {
  localStorage.clear();
  const sent = [];
  setBroadcastChannel({ postMessage: (msg) => sent.push(msg) });
  try {
    enableRehearsalMode();
    postBroadcastChannel({ type: "PING" });
    relayToMesh({ type: "GOSSIP", item: { id: "g1" } }, "rtc");
    broadcastToMesh({ type: "GOSSIP", item: { id: "g2" } });
    broadcastGossip({ id: "g3", text: "ensaio" });
    broadcastGossipUpdate({ id: "g3", text: "editado" });
    broadcastGossipDelete({ id: "g3" });
    const dmPath = sendDirectMessageTransport("dest1", { id: "dm1" });

    assert.equal(dmPath, null);
    assert.deepEqual(sent, []);

    disableRehearsalMode();
    broadcastToMesh({ type: "GOSSIP", item: { id: "g4", rehearsal: true } });
    assert.deepEqual(sent, []);
  } finally {
    disableRehearsalMode();
    setBroadcastChannel(null);
  }
});

test("PM-100 anti-vazamento: saída #2 (memória central) não dispara fetch em Modo Ensaio", async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    return { ok: true, status: 200, json: async () => ({ status: "ok" }), text: async () => '{"status":"ok"}' };
  };
  try {
    setCentralMemoryAutoPush(true);
    enableRehearsalMode();

    notifyCentralMemory({ type: "POST", item: { id: "cm1" } });
    const pushRes = await pushEventToCentralMemory({ type: "POST", item: { id: "cm2" } });
    const syncRes = await syncWithCentralMemory();

    assert.equal(pushRes, null);
    assert.equal(syncRes.ok, false);
    assert.equal(syncRes.skipped, true);
    assert.equal(syncRes.rehearsal, true);
    assert.deepEqual(fetchCalls, []);
  } finally {
    disableRehearsalMode();
    setCentralMemoryAutoPush(false);
    globalThis.fetch = originalFetch;
  }
});

test("PM-100 anti-vazamento: saída #3 (Arweave Turbo/L1) não dispara fetch em Modo Ensaio", async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    return { ok: true, status: 200, json: async () => ({ id: "tx1" }), text: async () => '{"id":"tx1"}' };
  };
  try {
    enableRehearsalMode();
    const turboRes = await uploadToTurbo(new Uint8Array([1, 2, 3]));
    const dataRes = await postData({ title: "ensaio" }, [], { jwk: { kty: "RSA" } });
    const binRes = await postBinary(new Uint8Array([4, 5, 6]), [], { jwk: { kty: "RSA" } });

    assert.equal(turboRes.ok, false);
    assert.equal(turboRes.blocked, true);
    assert.equal(turboRes.rehearsal, true);
    assert.equal(dataRes.success, false);
    assert.equal(dataRes.blocked, true);
    assert.equal(dataRes.via, "rehearsal");
    assert.equal(binRes.success, false);
    assert.equal(binRes.blocked, true);
    assert.equal(binRes.via, "rehearsal");
    assert.deepEqual(fetchCalls, []);

    disableRehearsalMode();
    const taggedRes = await postData({ title: "vazaria", rehearsal: true }, [], { jwk: { kty: "RSA" } });
    assert.equal(taggedRes.blocked, true);
    assert.deepEqual(fetchCalls, []);
  } finally {
    disableRehearsalMode();
    globalThis.fetch = originalFetch;
  }
});

test("PM-100: wipeRehearsalData limpa chaves mesmo em storage sem enumeração e desliga modo", async () => {
  const removed = [];
  const minimalStorage = {
    removeItem: (k) => removed.push(k),
  };
  enableRehearsalMode({ storage: null, doc: null, win: null });
  const res = await wipeRehearsalData({ storage: minimalStorage, session: null, doc: null, win: null });
  assert.equal(res.ok, true);
  assert.deepEqual(res.removedKeys, [REHEARSAL_STORAGE_KEY]);
  assert.ok(removed.includes(REHEARSAL_STORAGE_KEY));
  assert.equal(isRehearsalMode(null), false);
});
