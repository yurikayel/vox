import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createNostrTransport, encryptFor, decryptFrom } from "../client/js/nostr-transport.js";
import { generateSecretKey, getPublicKey, bytesToHex } from "../client/js/nostr-event.js";

/** Relay Nostr em memória: repassa EVENT aos assinantes cujo filtro #t casa (efêmero, não guarda). */
function createFakeRelay() {
  const sockets = new Set();
  const published = [];
  class FakeWS {
    constructor() {
      this.readyState = 0;
      this.subs = new Map();
      sockets.add(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(frame) {
      const msg = JSON.parse(frame);
      if (msg[0] === "REQ") this.subs.set(msg[1], msg[2]);
      if (msg[0] !== "EVENT") return;
      published.push(msg[1]);
      for (const s of sockets) {
        for (const [subId, f] of s.subs) {
          const t = msg[1].tags.find((x) => x[0] === "t")?.[1];
          if (f.kinds.includes(msg[1].kind) && f["#t"].includes(t)) queueMicrotask(() => s.onmessage?.({ data: JSON.stringify(["EVENT", subId, msg[1]]) }));
        }
      }
    }
    close() {
      sockets.delete(this);
    }
  }
  return { FakeWS, published };
}

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

/** Espera a condição em vez de um tempo fixo: com a suíte inteira no mesmo processo, a cripto em JS puro fica lenta. */
async function waitFor(cond, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) return false;
    await settle(20);
  }
  return true;
}

test("nostr-transport - REV-09: cifra/decifra só entre os dois pares", async () => {
  const a = generateSecretKey();
  const b = generateSecretKey();
  const c = generateSecretKey();
  const ct = await encryptFor(a, bytesToHex(getPublicKey(b)), { type: "offer", sdp: "v=0" });
  assert.deepEqual(await decryptFrom(b, bytesToHex(getPublicKey(a)), ct), { type: "offer", sdp: "v=0" });
  await assert.rejects(() => decryptFrom(c, bytesToHex(getPublicKey(a)), ct));
});

test("nostr-transport - dois pares se descobrem, trocam identidade e oferta/resposta cifradas", async () => {
  const relay = createFakeRelay();
  const gotA = [];
  const gotB = [];
  const mk = (peerId, address, sink) =>
    createNostrTransport({ relays: ["wss://fake"], peerId, getIdentity: () => ({ address, dmPub: { k: address } }), onMessage: (m) => sink.push(m), WebSocketImpl: relay.FakeWS });
  const A = mk("peer_a", "vx_alice", gotA);
  const B = mk("peer_b", "vx_bob", gotB);
  // stop() no finally: se uma asserção falhar, o setInterval do hello não pode segurar o processo.
  try {
    A.start();
    await settle(150);
    B.start();
    const joined = (got, peerId, address) => got.some((m) => m.type === "peer-joined" && m.peerId === peerId && m.address === address);
    await waitFor(() => joined(gotA, "peer_b", "vx_bob") && joined(gotB, "peer_a", "vx_alice"));

    assert.ok(joined(gotA, "peer_b", "vx_bob"));
    assert.ok(joined(gotB, "peer_a", "vx_alice"));

    assert.equal(A.send({ type: "offer", to: "peer_b", sdp: { type: "offer", sdp: "v=0 A" } }), true);
    await waitFor(() => gotB.some((m) => m.type === "offer"));
    const offer = gotB.find((m) => m.type === "offer");
    assert.equal(offer.from, "peer_a");
    assert.equal(offer.sdp.sdp, "v=0 A");
    assert.equal("to" in offer, false);

    B.send({ type: "answer", to: "peer_a", sdp: { type: "answer", sdp: "v=0 B" } });
    await waitFor(() => gotA.some((m) => m.type === "answer"));
    assert.equal(gotA.find((m) => m.type === "answer")?.sdp.sdp, "v=0 B");

    for (const ev of relay.published) {
      assert.ok(!ev.content.includes("vx_alice") && !ev.content.includes("vx_bob"), "endereço nunca vai em claro");
      assert.ok(!ev.content.includes("v=0"), "SDP nunca vai em claro");
    }
    assert.equal(A.send({ type: "offer", to: "peer_desconhecido" }), false);
  } finally {
    A.stop();
    B.stop();
  }
});

test("nostr-transport - ignora evento de outra sala e mensagens próprias", async () => {
  const got = [];
  const T = createNostrTransport({ relays: [], peerId: "peer_x", onMessage: (m) => got.push(m) });
  await T._handleEvent({ id: "1", pubkey: "f".repeat(64), tags: [["t", "outra-sala"]], content: JSON.stringify({ type: "hello", from: "peer_y" }) });
  await T._handleEvent({ id: "2", pubkey: T.publicKey, tags: [["t", "vox-brasil-v1"]], content: JSON.stringify({ type: "hello", from: "peer_x" }) });
  assert.deepEqual(got, []);
  assert.equal(T.knows("peer_y"), false);
});

test("nostr-transport - LAN-21: conta relays abertos e abrindo; stop zera sem avisar", async () => {
  const sockets = [];
  class ScriptedWS {
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    send() {}
    close() {
      this.onclose?.();
    }
  }
  const seen = [];
  const t = createNostrTransport({
    relays: ["wss://a", "wss://b"],
    peerId: "p1",
    onMessage: () => {},
    onStatus: (st) => seen.push(st),
    WebSocketImpl: ScriptedWS,
  });
  t.start();
  try {
    assert.deepEqual(t.status(), { open: 0, pending: 2 });
    sockets[0].onopen();
    assert.deepEqual(t.status(), { open: 1, pending: 1 });
    sockets[1].onclose();
    sockets[1].onclose();
    assert.deepEqual(t.status(), { open: 1, pending: 0 }, "fechar duas vezes não conta duas");
    sockets[0].onclose();
    assert.deepEqual(t.status(), { open: 0, pending: 0 });
    assert.deepEqual(seen.at(-1), { open: 0, pending: 0 });
  } finally {
    const before = seen.length;
    t.stop();
    assert.equal(seen.length, before, "stop não dispara aviso");
    assert.deepEqual(t.status(), { open: 0, pending: 0 });
  }
});

/** WebSocket falso controlável: `failing` nunca abre; os demais abrem e podem cair com `drop()`. */
function createFlakyNet(failing = new Set()) {
  const opened = [];
  const created = [];
  class FlakyWS {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      created.push(url);
      setTimeout(() => {
        if (failing.has(url)) {
          this.readyState = 3;
          this.onclose?.();
          return;
        }
        this.readyState = 1;
        opened.push(this);
        this.onopen?.();
      }, 1);
    }
    send() {}
    drop() {
      this.readyState = 3;
      this.onclose?.();
    }
    close() {
      this.readyState = 3;
    }
  }
  return { FlakyWS, opened, created };
}

test("nostr-transport - PM-17: relay que cai depois de abrir reconecta sozinho", async () => {
  const net = createFlakyNet();
  const T = createNostrTransport({ relays: ["wss://a"], peerId: "p1", onMessage: () => {}, WebSocketImpl: net.FlakyWS, reconnectBaseMs: 5 });
  T.start();
  try {
    assert.ok(await waitFor(() => T.status().open === 1));
    net.opened[0].drop();
    assert.equal(T.status().open, 0);
    assert.ok(await waitFor(() => T.status().open === 1), "não reconectou");
    assert.deepEqual(net.created, ["wss://a", "wss://a"]);
  } finally {
    T.stop();
  }
});

test("nostr-transport - PM-17: relay que nunca abre é trocado por outro do pool", async () => {
  const net = createFlakyNet(new Set(["wss://morto"]));
  const T = createNostrTransport({
    relays: ["wss://morto", "wss://reserva"],
    maxRelays: 1,
    peerId: "p1",
    onMessage: () => {},
    WebSocketImpl: net.FlakyWS,
    reconnectBaseMs: 2,
  });
  T.start();
  try {
    assert.ok(await waitFor(() => T.status().open === 1), "não trocou de relay");
    assert.deepEqual(T.relays(), ["wss://reserva"]);
    assert.equal(net.created.filter((u) => u === "wss://morto").length, 3);
  } finally {
    T.stop();
  }
});

test("nostr-transport - PM-17: stop() cancela a reconexão agendada", async () => {
  const net = createFlakyNet(new Set(["wss://morto"]));
  const T = createNostrTransport({ relays: ["wss://morto"], peerId: "p1", onMessage: () => {}, WebSocketImpl: net.FlakyWS, reconnectBaseMs: 30 });
  T.start();
  await waitFor(() => net.created.length === 1);
  await settle(10);
  T.stop();
  const count = net.created.length;
  await settle(120);
  assert.equal(net.created.length, count);
});
