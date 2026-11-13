/**
 * ADR-032 passo 1 — a conta nasce provisória e a faixa só some com uma saída soberana de verdade.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "./setup.js";
import * as accountExit from "../client/js/account-exit.js";
import * as localAccount from "../client/js/local-account.js";
import * as keyLock from "../client/js/key-lock.js";
import { exportAccountBundle } from "../client/js/account-backup.js";
import * as inboxBackup from "../client/js/inbox-backup.js";
import * as oauthVault from "../client/js/oauth-vault.js";

const SENHA = "senha soberana de teste 2026";
const DAY = 24 * 60 * 60 * 1000;

async function freshAccount() {
  localStorage.clear();
  for (const store of mockStores.values()) store.map?.clear();
  keyLock.__resetKeyLockForTests?.();
  return (await localAccount.ensureLocalAccount()).routeId;
}

async function withFetch(fake, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("ADR-032: conta nova não tem saída; registrar uma saída conhecida muda isso", async () => {
  const me = await freshAccount();
  assert.equal(await accountExit.hasSovereignExit(me), false);
  assert.equal(accountExit.markAccountExit("passkey", me), false, "atalho não é saída");
  assert.equal(await accountExit.hasSovereignExit(me), false);
  assert.equal(accountExit.markAccountExit("arquivo", me, 123), true);
  assert.deepEqual(accountExit.getAccountExits(me), { arquivo: 123 });
  assert.equal(await accountExit.hasSovereignExit(me), true);
});

test("ADR-032: faixa sem saída aparece; \"Agora não\" vale 7 dias ou 10 posts", () => {
  const routeId = "vx_faixa_teste";
  localStorage.clear();
  const now = 1_000_000_000;
  assert.equal(accountExit.shouldShowExitBanner({ routeId, hasExit: false, ownPosts: 0, now }), true);
  assert.equal(accountExit.shouldShowExitBanner({ routeId, hasExit: true, ownPosts: 0, now }), false);
  accountExit.snoozeExitBanner(3, routeId, now);
  assert.equal(accountExit.shouldShowExitBanner({ routeId, hasExit: false, ownPosts: 12, now: now + DAY }), false);
  assert.equal(accountExit.shouldShowExitBanner({ routeId, hasExit: false, ownPosts: 13, now: now + DAY }), true, "10 posts depois");
  assert.equal(accountExit.shouldShowExitBanner({ routeId, hasExit: false, ownPosts: 3, now: now + 7 * DAY }), true, "7 dias depois");
});

test("ADR-032: arquivo cifrado baixado é saída; o mesmo export por dentro do backup no e-mail não é", async () => {
  const me = await freshAccount();
  await accountExit.hasSovereignExit(me);
  await exportAccountBundle(SENHA);
  assert.equal(await accountExit.hasSovereignExit(me), false, "travar a conta sozinho não é saída");
  await exportAccountBundle(SENHA, { asFile: true });
  assert.ok(accountExit.getAccountExits(me).arquivo);
});

test("ADR-032: backup no e-mail vira saída quando é mandado, não quando é ligado", async () => {
  const me = await freshAccount();
  await accountExit.hasSovereignExit(me);
  await inboxBackup.enableInboxBackup(SENHA);
  assert.equal(await accountExit.hasSovereignExit(me), false);
  inboxBackup.markInboxBackupSent("mes", Date.now());
  assert.ok(accountExit.getAccountExits(me).email);
});

test("ADR-032: cofre só conta quando um servidor de memória aceitou", async () => {
  const me = await freshAccount();
  await accountExit.hasSovereignExit(me);
  const nobody = await withFetch(async () => { throw new Error("offline"); }, () => oauthVault.savePassphraseVault(SENHA));
  assert.equal(nobody.ok, true);
  assert.equal(nobody.remote, 0);
  assert.equal(await accountExit.hasSovereignExit(me), false, "cofre só neste navegador não é saída");
  const saved = await withFetch(async () => ({ ok: true, json: async () => ({}) }), () => oauthVault.savePassphraseVault(SENHA));
  assert.ok(saved.remote > 0);
  assert.ok(accountExit.getAccountExits(me).cofre);
});

test("ADR-032: conta já travada antes do registro existir conta como saída (backup anterior)", async () => {
  const me = await freshAccount();
  await exportAccountBundle(SENHA);
  assert.equal(await accountExit.hasSovereignExit(me), true);
  assert.ok(accountExit.getAccountExits(me).anterior);
});

test("ADR-032: conta os posts da própria conta", async () => {
  const store = { getWirePosts: async () => [{ author: "vx_a" }, { owner: "vx_a" }, { author: "vx_b" }] };
  assert.equal(await accountExit.countOwnPosts("vx_a", store), 2);
  assert.equal(await accountExit.countOwnPosts("", store), 0);
});
