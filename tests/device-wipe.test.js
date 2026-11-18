/**
 * "Apagar conta local" (T27): integração via `wipeLocalDevice` — sem importar nomes novos de `local-wipe.js` (PM-111: falha por asserção na base; só `import * as`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as onboarding from "../client/js/app/onboarding.js";
import * as keystore from "../client/js/identity/keystore.js";
import * as wipe from "../client/js/identity/local-wipe.js";

const EXPECTED_DATABASES = ["vox-cache-db", "vox-keystore", "vox-store-db"];
const PERSONAL_LOCAL = [
  "vox-vault-v2:endereco",
  "vox-vault-v2:dono",
  "vox-oauth-vault-v1:bsky",
  "vox-local-account-bundle",
  "vox-vault-v1-migrated-for",
  "vox-bsky-oauth-session",
  "vox-bsky-subs-v1",
  "vox-bsky-cached-posts-v1",
  "vox-posse-webhooks",
  "vox-replication-webhook",
  "vox-linked-accounts-v1",
  "vox-wallet-jwk",
  "vox-wallet-encrypted",
  "vox_voxel_receipts_vx_a",
  "vox-profile-cards-v1",
  "vox-profile-notes-v1",
  "vox-profile-readme",
  "vox-profile-github",
  "vox-contacts-v1",
  "vox-added-by-v1",
  "vox-dm-outbox-v1",
  "vox-dm-read-ts-v1",
  "vox-dm-pins-v1",
  "vox-known-dm-pubs",
  "vox-moderation-blocked-v1",
  "vox-moderation-muted-v1",
  "vox-quarantine-posts-v1",
  "vox-reports-v1",
  "vox-report-review-v1",
  "vox-liked-posts",
  "vox-saved-posts",
  "vox-account-exits-v1:vx_a",
  "vox-guardians-v1:vx_a",
  "vox-phrase-in-email-v1:vx_a",
  "vox-inbox-backup-v1:vx_a",
  "vox-pact-accepted",
  "vox-age-18-v1",
  "vox-custom-turn-config",
  "vox-handles-cache",
  "vox-app-feedback-v1",
];
const PERSONAL_SESSION = ["vox-bsky-oauth-flow", "vox-social-oauth-flow", "vox-oauth-callback", "vox-guardian-return-v1"];
const NEUTRAL = [
  "vox-color-mode",
  "vox-central-memory-chosen-v2",
  "vox-demo-seeded-v12",
  "vox-pwa-v7.141",
];

class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
}

/** Banco com conexões abertas: como no navegador, `deleteDatabase` só termina depois que elas fecham. */
function withHeldIndexedDb(events, { honorsVersionChange }) {
  const prev = globalThis.indexedDB;
  const live = new Set();
  globalThis.indexedDB = {
    open() {
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: () => ({ objectStore: () => ({ get: () => { const r = { result: null }; queueMicrotask(() => r.onsuccess?.()); return r; } }) }),
        close() { live.delete(db); events.push("close"); },
      };
      live.add(db);
      const req = { result: db };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
    deleteDatabase(name) {
      const req = {};
      queueMicrotask(() => {
        if (honorsVersionChange) for (const db of [...live]) db.onversionchange?.();
        if (live.size > 0) return req.onblocked?.();
        events.push(`delete:${name}`);
        req.onsuccess?.();
      });
      return req;
    },
  };
  return () => { globalThis.indexedDB = prev; };
}

function withIndexedDb(deleted, behavior = "success") {
  const prev = globalThis.indexedDB;
  globalThis.indexedDB = {
    deleteDatabase(name) {
      deleted.push(name);
      const req = {};
      queueMicrotask(() => {
        if (behavior === "throw-first" && deleted.length === 1) return req.onerror?.();
        if (behavior === "blocked") return req.onblocked?.();
        req.onsuccess?.();
      });
      if (behavior === "throw-first" && deleted.length === 1) throw new Error("recusado");
      return req;
    },
  };
  return () => { globalThis.indexedDB = prev; };
}

test("apagar conta local remove cada categoria de dado pessoal de localStorage e sessionStorage", async () => {
  globalThis.sessionStorage = new MemoryStorage();
  for (const k of PERSONAL_LOCAL) localStorage.setItem(k, "x");
  for (const k of PERSONAL_SESSION) sessionStorage.setItem(k, "x");
  for (const k of NEUTRAL) localStorage.setItem(k, "x");
  const restore = withIndexedDb([]);
  try {
    await onboarding.wipeLocalDevice();
  } finally {
    restore();
  }
  for (const k of PERSONAL_LOCAL) assert.equal(localStorage.getItem(k), null, `${k} deveria sair`);
  for (const k of PERSONAL_SESSION) assert.equal(sessionStorage.getItem(k), null, `${k} deveria sair`);
  for (const k of NEUTRAL) assert.equal(localStorage.getItem(k), "x", `${k} deveria ficar`);
  delete globalThis.sessionStorage;
});

test("apagar conta local pede a remoção dos bancos IndexedDB do cliente", async () => {
  const deleted = [];
  const restore = withIndexedDb(deleted);
  try {
    await onboarding.wipeLocalDevice();
  } finally {
    restore();
  }
  assert.deepEqual([...deleted].sort(), [...EXPECTED_DATABASES].sort());
});

test("apagar conta local tira a credencial TURN própria e o cache de apelidos, mas mantém o servidor de sinalização", async () => {
  localStorage.setItem("vox-custom-turn-config", JSON.stringify({ urls: "turn:x", username: "u", credential: "segredo" }));
  localStorage.setItem("vox-handles-cache", JSON.stringify({ bySlug: { ana: "addr" }, byAddress: { addr: "ana" } }));
  localStorage.setItem("vox-custom-signaling-url", "wss://sinal.exemplo");
  const restore = withIndexedDb([]);
  try {
    await onboarding.wipeLocalDevice();
  } finally {
    restore();
  }
  assert.equal(localStorage.getItem("vox-custom-turn-config"), null);
  assert.equal(localStorage.getItem("vox-handles-cache"), null);
  assert.equal(localStorage.getItem("vox-custom-signaling-url"), "wss://sinal.exemplo");
});

test("apagar conta local fecha as conexões do cofre de chaves antes de pedir a remoção do banco", async () => {
  const events = [];
  const restore = withHeldIndexedDb(events, { honorsVersionChange: false });
  try {
    await keystore.loadKey("alguma-chave"); // aba aberta com o cofre em uso
    const outcome = await onboarding.wipeLocalDevice();
    assert.deepEqual(outcome, { complete: true, pending: [] });
  } finally {
    restore();
  }
  assert.ok(events.includes("delete:vox-keystore"), "o cofre de chaves deveria ter sido apagado");
});

test("conexão do cofre que recebe o aviso de versão se solta sozinha (outra aba apagando)", async () => {
  const events = [];
  const restore = withHeldIndexedDb(events, { honorsVersionChange: true });
  try {
    const pending = await wipe.dropDatabases(["vox-keystore"], 20);
    assert.deepEqual(pending, []);
  } finally {
    restore();
  }
});

test("banco que o navegador bloqueia NÃO conta como apagado: a limpeza informa o que ficou", async () => {
  const deleted = [];
  const restore = withIndexedDb(deleted, "blocked");
  try {
    const start = Date.now();
    const outcome = await onboarding.wipeLocalDevice();
    assert.equal(outcome.complete, false);
    assert.deepEqual([...outcome.pending].sort(), [...EXPECTED_DATABASES].sort());
    assert.ok(Date.now() - start < 6000, "a espera por banco bloqueado tem teto");
  } finally {
    restore();
  }
});

test("a mensagem da limpeza só diz 'apagadas' quando tudo foi apagado", () => {
  assert.equal(typeof onboarding.describeWipeOutcome, "function");
  const ok = onboarding.describeWipeOutcome({ complete: true, pending: [] });
  assert.equal(ok.kind, "info");
  assert.match(ok.message, /apagadas/);
  const partial = onboarding.describeWipeOutcome({ complete: false, pending: ["vox-keystore"] });
  assert.equal(partial.kind, "error");
  assert.doesNotMatch(partial.message, /^Chaves deste navegador apagadas/);
  assert.match(partial.message, /outra aba/);
  assert.equal(onboarding.describeWipeOutcome(undefined).kind, "error");
});
