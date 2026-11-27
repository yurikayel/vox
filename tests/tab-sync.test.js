/**
 * S30-S5: outra aba trocou conta ou rota — esta aba recarrega sem criar conta duplicada.
 */
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { drainMicrotasks } from "./helpers/wait-until.js";
import "./setup.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import * as localAccount from "../client/js/identity/local-account.js";

const ACCOUNT_KEY = "vox-local-account-v1";

async function tabSync() {
  return import("../client/js/identity/tab-sync.js");
}

test("LT-06a: withLocalAccountCreationLock serializa trabalho concorrente", async () => {
  const { withLocalAccountCreationLock } = await tabSync();
  let depth = 0;
  let maxDepth = 0;
  const work = () =>
    withLocalAccountCreationLock(async () => {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      await drainMicrotasks(50);
      depth -= 1;
    });
  await Promise.all([work(), work()]);
  assert.equal(maxDepth, 1);
});

test("tab-sync: precache do SW lista tab-sync.js (RED na base)", () => {
  const sw = fs.readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"./js/identity/tab-sync.js"'), "SHELL_ASSETS deve precachear tab-sync");
});

test("tab-sync: readStoredRouteId lê só o que está no storage", async () => {
  const { readStoredRouteId } = await tabSync();
  localStorage.clear();
  assert.equal(readStoredRouteId(), "");
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ routeId: "vx_test_1" }));
  assert.equal(readStoredRouteId(), "vx_test_1");
});

test("tab-sync: reloadIdentityFromStorage não cria conta nova se o storage já tem conta", async () => {
  const { readStoredRouteId, reloadIdentityFromStorage } = await tabSync();
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
  const { reloadIdentityFromStorage } = await tabSync();
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

test("tab-sync: BroadcastChannel propaga hash de rota entre abas", async () => {
  const { startTabSync, TAB_SYNC_CHANNEL } = await tabSync();
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

test("tab-sync (LT-06b): conta apagada em outra aba não fica viva em cachedAccount nem ressuscita no vault", async () => {
  const { reloadIdentityFromStorage } = await tabSync();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  const born = await localAccount.ensureLocalAccount();
  assert.equal(localAccount.getCachedRouteIdSync(), born.routeId);

  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem("vox-accounts-vault-v1");

  assert.equal(localAccount.getCachedRouteIdSync(), "", "cache síncrono invalida quando storage foi apagado");
  localAccount.setDisplayName("Fantasma");
  assert.deepEqual(localAccount.listVaultAccountsSync(), [], "conta apagada não ressuscita no cofre local");
  const res = await reloadIdentityFromStorage({ localAccount });
  assert.deepEqual(res, { adopted: false, routeId: "" });
});

test("local-account: JSON não-objeto em vault, enrichment ou pix não derruba nem vaza itens falsos", async () => {
  localStorage.clear();
  for (const bad of ["null", "[1,2,3]", "123", '"texto"', "{quebrado"]) {
    localStorage.setItem("vox-accounts-vault-v1", bad);
    localStorage.setItem("vox-profile-enrichment-v1", bad);
    localStorage.setItem("vox-pix-key-v1", bad);
    assert.deepEqual(localAccount.listVaultAccountsSync(), []);
    assert.equal(localAccount.getProfileEnrichment(), null);
    assert.equal(localAccount.getPixKey(), null);
  }
  localStorage.setItem("vox-accounts-vault-v1", '{"vx_a":null,"vx_b":[1],"vx_c":"x"}');
  assert.deepEqual(localAccount.listVaultAccountsSync(), []);
});