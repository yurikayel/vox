/**
 * S30-S5: outra aba trocou conta ou rota — esta aba recarrega sem criar conta duplicada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import * as localAccount from "../client/js/identity/local-account.js";
import {
  readStoredRouteId,
  reloadIdentityFromStorage,
  startTabSync,
  TAB_SYNC_CHANNEL,
} from "../client/js/identity/tab-sync.js";

const ACCOUNT_KEY = "vox-local-account-v1";

test("tab-sync: readStoredRouteId lê só o que está no storage", () => {
  localStorage.clear();
  assert.equal(readStoredRouteId(), "");
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ routeId: "vx_test_1" }));
  assert.equal(readStoredRouteId(), "vx_test_1");
});

test("tab-sync: reloadIdentityFromStorage não cria conta nova se o storage já tem conta", async () => {
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  const born = await localAccount.ensureLocalAccount();
  const snapshot = localStorage.getItem(ACCOUNT_KEY);
  await localAccount.wipeLocalAccount();
  localStorage.setItem(ACCOUNT_KEY, snapshot);
  const first = await reloadIdentityFromStorage({ localAccount });
  assert.equal(first.routeId, born.routeId);
  assert.equal(readStoredRouteId(), born.routeId);
  const second = await reloadIdentityFromStorage({ localAccount });
  assert.equal(second.routeId, born.routeId);
});

test("tab-sync: outra aba trocou a conta ativa — cache em memória alinha ao storage", async () => {
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  const first = await localAccount.ensureLocalAccount();
  const second = await localAccount.createAdditionalAccount({ displayName: "Tab B" });
  assert.notEqual(first.routeId, second.routeId);
  assert.equal(localAccount.getCachedRouteIdSync(), second.routeId);

  const vaultRaw = localStorage.getItem("vox-accounts-vault-v1");
  const vault = JSON.parse(vaultRaw);
  const firstEntry = vault[first.routeId];
  localStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({
      routeId: first.routeId,
      publicJwk: firstEntry.publicJwk,
      privateJwk: firstEntry.privateJwk,
      createdAt: firstEntry.createdAt,
    }),
  );
  assert.equal(localAccount.getCachedRouteIdSync(), second.routeId, "cache ainda na conta antiga");

  const res = await reloadIdentityFromStorage({ localAccount });
  assert.equal(res.routeId, first.routeId);
  assert.equal(localAccount.getCachedRouteIdSync(), first.routeId);
});

test("tab-sync: BroadcastChannel propaga hash de rota entre abas", () => {
  globalThis.BroadcastChannel.channels.clear();
  const reloaded = [];
  const win = {
    addEventListener: () => {},
    location: { hash: "#/" },
    BroadcastChannel: globalThis.BroadcastChannel,
  };
  startTabSync({
    onReload: (ctx) => reloaded.push(ctx.reason),
    win,
  });
  const peer = new BroadcastChannel(TAB_SYNC_CHANNEL);
  peer.postMessage({ v: 1, kind: "route", tabId: "outra-aba", hash: "#/perfil" });
  assert.equal(win.location.hash, "#/perfil");
  assert.deepEqual(reloaded, ["route"]);
  peer.close();
});