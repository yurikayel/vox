import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/identity/local-account.js";

const ACCOUNT_KEY = "vox-local-account-v1";
const SEED_KEY = "vox-identity-seed-v1";

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

test("LT-06c: outra aba grava conta durante a criação em voo — adota a conta da outra aba sem sobrescrever", async () => {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  const realSet = localStorage.setItem.bind(localStorage);
  let intercepted = false;
  const tabBAccount = {
    routeId: "vx_tab_b_vencedora",
    publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    privateJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
    createdAt: 1000,
  };
  let discardedRouteId = "";
  localStorage.setItem = (k, v) => {
    realSet(k, v);
    if (k === SEED_KEY && !intercepted) {
      intercepted = true;
      discardedRouteId = Object.keys(JSON.parse(v) || {})[0] || "";
      realSet(ACCOUNT_KEY, JSON.stringify(tabBAccount));
    }
  };
  try {
    const acc = await localAccount.ensureLocalAccount();
    assert.equal(acc.routeId, tabBAccount.routeId, "adota a conta que a outra aba já gravou");
    assert.equal(JSON.parse(localStorage.getItem(ACCOUNT_KEY)).routeId, tabBAccount.routeId);
    const seeds = JSON.parse(localStorage.getItem(SEED_KEY) || "{}");
    assert.equal(seeds[discardedRouteId], undefined, "semente descartada não fica órfã");
  } finally {
    localStorage.setItem = realSet;
  }
});