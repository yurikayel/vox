/**
 * LT-06a: storage cheio ou bloqueado na criação — conta só em memória e aviso visível.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import {
  ACCOUNT_NOT_PERSISTED_WARN,
  warnIfAccountNotPersisted,
} from "../client/js/app/onboarding-oauth-ui.js";

const ACCOUNT_KEY = "vox-local-account-v1";

function oauthErrorDom() {
  const errorEl = { textContent: "", hidden: true, focusCalls: 0 };
  const doc = {
    getElementById: (id) => (id === "oauth-enrich-error" ? errorEl : null),
  };
  return { errorEl, doc };
}

test("LT-06a: QuotaExceeded — getAccountStorageIssue e aviso em #oauth-enrich-error", async () => {
  const localAccount = await import("../client/js/identity/local-account.js");
  const { errorEl, doc } = oauthErrorDom();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, val) => {
    if (key === ACCOUNT_KEY) throw new DOMException("quota", "QuotaExceededError");
    return orig(key, val);
  };
  try {
    localStorage.clear();
    await localAccount.wipeLocalAccount();
    const acc = await localAccount.ensureLocalAccount();
    assert.ok(acc.routeId);
    assert.equal(localStorage.getItem(ACCOUNT_KEY), null);
    assert.equal(localAccount.getAccountStorageIssue()?.reason, "QuotaExceededError");
    warnIfAccountNotPersisted();
    assert.equal(errorEl.hidden, false);
    assert.equal(errorEl.textContent, ACCOUNT_NOT_PERSISTED_WARN);
  } finally {
    localStorage.setItem = orig;
    globalThis.document = prevDoc;
  }
});

test("LT-06a: SecurityError ao gravar conta — issue storage_blocked e aviso", async () => {
  const localAccount = await import("../client/js/identity/local-account.js");
  const { errorEl, doc } = oauthErrorDom();
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, val) => {
    if (key === ACCOUNT_KEY) throw new DOMException("denied", "SecurityError");
    return orig(key, val);
  };
  try {
    localStorage.clear();
    await localAccount.wipeLocalAccount();
    await localAccount.ensureLocalAccount();
    assert.equal(localAccount.getAccountStorageIssue()?.reason, "SecurityError");
    warnIfAccountNotPersisted();
    assert.match(errorEl.textContent, /armazenamento cheio ou bloqueado/);
  } finally {
    localStorage.setItem = orig;
    globalThis.document = prevDoc;
  }
});

test("LT-06a: regravação limpa issue e esconde necessidade de novo aviso", async () => {
  const localAccount = await import("../client/js/identity/local-account.js");
  localStorage.clear();
  await localAccount.wipeLocalAccount();
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, val) => {
    if (key === ACCOUNT_KEY) throw new DOMException("quota", "QuotaExceededError");
    return orig(key, val);
  };
  try {
    const acc = await localAccount.ensureLocalAccount();
    assert.equal(localAccount.getAccountStorageIssue()?.reason, "QuotaExceededError");
    localStorage.setItem = orig;
    localAccount.storeActiveAccount(acc);
    assert.equal(localAccount.getAccountStorageIssue(), null);
    assert.ok(localStorage.getItem(ACCOUNT_KEY));
  } finally {
    localStorage.setItem = orig;
  }
});