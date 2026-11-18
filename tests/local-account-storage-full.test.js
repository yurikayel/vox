import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";

const ACCOUNT_KEY = "vox-local-account-v1";

function patchAccountQuota() {
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, val) => {
    if (key === ACCOUNT_KEY) throw new DOMException("quota", "QuotaExceededError");
    return orig(key, val);
  };
  return orig;
}

test("expõe getAccountStorageIssue (RED na base)", async () => {
  const mod = await import("../client/js/identity/local-account.js");
  assert.equal(typeof mod.getAccountStorageIssue, "function");
});

test("QuotaExceeded — conta em memória, issue e regravação", async () => {
  const localAccount = await import("../client/js/identity/local-account.js");
  localStorage.clear();
  await localAccount.wipeLocalAccount();
  const orig = patchAccountQuota();
  try {
    const acc = await localAccount.ensureLocalAccount();
    assert.ok(acc.routeId);
    assert.equal(localStorage.getItem(ACCOUNT_KEY), null);
    assert.ok(localAccount.getAccountStorageIssue());
    assert.equal(localAccount.isActiveAccountPersisted(), false);
    localStorage.setItem = orig;
    localAccount.storeActiveAccount(acc);
    assert.equal(localAccount.getAccountStorageIssue(), null);
    assert.equal(localAccount.isActiveAccountPersisted(), true);
  } finally {
    localStorage.setItem = orig;
  }
});