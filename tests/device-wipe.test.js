/**
 * "Apagar conta local" (T27): integração via `wipeLocalDevice` — sem importar `local-wipe.js` (PM-111: falha por asserção na base).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wipeLocalDevice } from "../client/js/app/onboarding.js";

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
    await wipeLocalDevice();
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
    await wipeLocalDevice();
  } finally {
    restore();
  }
  assert.deepEqual([...deleted].sort(), [...EXPECTED_DATABASES].sort());
});