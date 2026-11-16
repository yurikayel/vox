/**
 * Cofre do Perfil: trocar a Senha Soberana com a conta travada (campo "Senha atual") e, ao gravar com e-mail,
 * tirar do ar o cofre só-senha anterior (ADR-032 §6.3).
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as oauthVault from "../client/js/oauth-vault.js";
import * as vaultCrypto from "../client/js/vault-crypto.js";
import { profileVaultOptions } from "../client/js/app/profile-vault-sync.js";
import { renderSovereigntyCard } from "../client/js/render/profile-sovereignty.js";

const PASS = "minha senha inicial ok";
const NEW_PASS = "nova senha soberana ok";

/** Servidor de memória falso: guarda o último POST por endereço. */
function installMemoryServer() {
  const origFetch = globalThis.fetch;
  const store = new Map();
  globalThis.fetch = async (url, opts = {}) => {
    const key = String(url).split("/memory/vault/")[1];
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    if (opts.method === "POST") {
      store.set(key, JSON.parse(opts.body).record);
      return { ok: true, json: async () => ({ status: "saved" }) };
    }
    const record = store.get(key);
    return record ? { ok: true, json: async () => ({ status: "ok", record }) } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { store, restore: () => (globalThis.fetch = origFetch) };
}

function freshDevice() {
  localStorage.clear();
  localAccount.wipeLocalAccount();
}

test("Perfil - o cartão tem o campo Senha atual e as opções levam a senha antiga só quando preenchida", () => {
  assert.match(renderSovereigntyCard("vx_a"), /id="input-sovereignty-prev-passphrase"[^>]*autocomplete="current-password"/);
  assert.equal(profileVaultOptions("ana@exemplo.br", ""), "ana@exemplo.br");
  assert.deepEqual(profileVaultOptions("ana@exemplo.br", PASS), { email: "ana@exemplo.br", prevPassphrase: PASS });
});

test("Perfil - conta travada troca a senha com a senha atual e o endereço antigo é revogado", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    const acc = await localAccount.ensureLocalAccount();
    assert.equal((await oauthVault.savePassphraseVault(PASS, "")).ok, true);
    const blocked = await oauthVault.savePassphraseVault(NEW_PASS, profileVaultOptions("", ""));
    assert.equal(blocked.ok, false, "sem a senha atual a conta travada não abre");
    const changed = await oauthVault.savePassphraseVault(NEW_PASS, profileVaultOptions("", PASS));
    assert.equal(changed.ok, true);
    assert.equal(server.store.get(await vaultCrypto.deriveVaultAddress(PASS, "")).revoked, true);
    freshDevice();
    const res = await oauthVault.restoreFromPassphraseVault(NEW_PASS);
    assert.equal(res.routeId, acc.routeId);
  } finally {
    server.restore();
  }
});

test("Perfil - gravar com e-mail tira do ar o cofre só-senha anterior", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    await localAccount.ensureLocalAccount();
    assert.equal((await oauthVault.savePassphraseVault(PASS, "")).ok, true);
    const passOnly = await vaultCrypto.deriveVaultAddress(PASS, "");
    assert.equal((await oauthVault.savePassphraseVault(PASS, "ana@exemplo.br")).ok, true);
    assert.equal(server.store.get(passOnly).revoked, true);
    assert.equal(localStorage.getItem(`vox-vault-v2:${passOnly}`), null);
    freshDevice();
    const withoutEmail = await oauthVault.restoreFromPassphraseVault(PASS);
    assert.equal(withoutEmail.ok, false, "só a senha não abre mais o cofre antigo");
  } finally {
    server.restore();
  }
});

test("Perfil - gravar com e-mail sem cofre só-senha anterior não marca endereço nenhum como revogado", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    await localAccount.ensureLocalAccount();
    assert.equal((await oauthVault.savePassphraseVault(PASS, "ana@exemplo.br")).ok, true);
    assert.equal(server.store.has(await vaultCrypto.deriveVaultAddress(PASS, "")), false);
    assert.equal([...server.store.values()].filter((r) => r.revoked).length, 0);
  } finally {
    server.restore();
  }
});
