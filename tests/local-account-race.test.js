import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/identity/local-account.js";

const ACCOUNT_KEY = "vox-local-account-v1";

test("ensureLocalAccount - duas chamadas simultâneas na mesma conta nova", async () => {
  localStorage.clear();
  const [a, b] = await Promise.all([
    localAccount.ensureLocalAccount(),
    localAccount.ensureLocalAccount(),
  ]);
  assert.equal(a.routeId, b.routeId);
  const stored = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
  assert.equal(stored.routeId, a.routeId);
});