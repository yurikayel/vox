/**
 * S19 — `identity/local-wipe.js`: confirmação dupla e política de chaves pessoais vs neutras (livre).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_WIPE_NOTICE,
  DEVICE_KEEP_KEYS,
  confirmLocalWipe,
  isPersonalStorageKey,
  dropStorageKeys,
  dropPersonalStorage,
  dropSessionPassphrase,
  deleteDatabase,
  DEVICE_DATABASES,
} from "../client/js/identity/local-wipe.js";

test("local-wipe - confirmLocalWipe exige duas respostas afirmativas com o aviso fixo", () => {
  assert.equal(confirmLocalWipe(() => true), true);
  assert.equal(confirmLocalWipe(() => false), false);
  let step = 0;
  assert.equal(
    confirmLocalWipe((msg) => {
      assert.equal(msg, LOCAL_WIPE_NOTICE);
      step += 1;
      return step === 1;
    }),
    false
  );
  assert.equal(step, 2);
});

test("local-wipe - isPersonalStorageKey separa neutro de dado pessoal", () => {
  assert.equal(isPersonalStorageKey("vox-color-mode"), false);
  assert.equal(isPersonalStorageKey(DEVICE_KEEP_KEYS[0]), false);
  assert.equal(isPersonalStorageKey("vox-central-memory-chosen-v2"), false);
  assert.equal(isPersonalStorageKey("vox-local-account-bundle"), true);
  assert.equal(isPersonalStorageKey("vox-vault-v2:addr"), true);
  assert.equal(isPersonalStorageKey("not-vox"), false);
});

function mockSessionStorage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key(i) {
      return [...m.keys()][i] ?? null;
    },
    getItem(k) {
      return m.has(k) ? m.get(k) : null;
    },
    setItem(k, v) {
      m.set(k, String(v));
    },
    removeItem(k) {
      m.delete(k);
    },
    clear() {
      m.clear();
    },
  };
}

test("local-wipe - dropPersonalStorage e sessão só removem chaves pessoais", () => {
  localStorage.clear();
  globalThis.sessionStorage = mockSessionStorage();
  sessionStorage.clear();
  localStorage.setItem("vox-color-mode", "dark");
  localStorage.setItem("vox-wallet-jwk", "{}");
  sessionStorage.setItem("vox-sovereignty-passphrase", "x");
  sessionStorage.setItem("vox-bsky-oauth-flow", "1");
  dropPersonalStorage(localStorage);
  dropSessionPassphrase();
  dropStorageKeys(sessionStorage, ["vox-bsky-oauth-flow"]);
  assert.equal(localStorage.getItem("vox-color-mode"), "dark");
  assert.equal(localStorage.getItem("vox-wallet-jwk"), null);
  assert.equal(sessionStorage.getItem("vox-sovereignty-passphrase"), null);
  assert.equal(sessionStorage.getItem("vox-bsky-oauth-flow"), null);
});

test("local-wipe - deleteDatabase termina mesmo sem indexedDB", async () => {
  const prev = globalThis.indexedDB;
  delete globalThis.indexedDB;
  await deleteDatabase(DEVICE_DATABASES[0]);
  globalThis.indexedDB = prev;
  assert.ok(true);
});