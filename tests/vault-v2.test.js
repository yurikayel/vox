/**
 * PM-90 — cofre v2: só a Senha Soberana abre; login social não é chave; cofres v1 abrem uma última vez,
 * migram e são revogados.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as oauthVault from "../client/js/oauth-vault.js";
import * as vaultCrypto from "../client/js/vault-crypto.js";
import * as vaultLegacy from "../client/js/vault-legacy.js";

const PASS = "frase longa de teste soberana";

/** Servidor de memória falso: guarda o último POST por endereço. */
function installMemoryServer() {
  const origFetch = globalThis.fetch;
  const store = new Map();
  const posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const key = String(url).split("/memory/vault/")[1];
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    if (opts.method === "POST") {
      const { record, ownerToken } = JSON.parse(opts.body);
      store.set(key, record);
      posts.push({ key, record, ownerToken });
      return { ok: true, json: async () => ({ status: "saved" }) };
    }
    const record = store.get(key);
    return record ? { ok: true, json: async () => ({ status: "ok", record }) } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { store, posts, restore: () => (globalThis.fetch = origFetch) };
}

/** Monta um cofre no formato v1 (como versões anteriores gravavam). */
async function legacyRecord(bundle, secret, provider) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultCrypto.deriveLegacyKey(secret, provider);
  const plain = new TextEncoder().encode(JSON.stringify(bundle));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: vaultCrypto.bufferToHex(iv), ciphertext: vaultCrypto.bufferToHex(ct), updatedAt: Date.now() };
}

function freshDevice() {
  localStorage.clear();
  localAccount.wipeLocalAccount();
}

test("vault v2 - envelope com sal aleatório, 600 mil iterações e sem dado de login", async () => {
  const bundle = { routeId: "vx_a", publicJwk: {}, privateJwk: {} };
  const a = await vaultCrypto.encryptVaultV2(bundle, PASS);
  const b = await vaultCrypto.encryptVaultV2(bundle, PASS);
  assert.equal(a.v, 2);
  assert.equal(a.iter, vaultCrypto.VAULT_V2_ITERATIONS);
  assert.ok(vaultCrypto.VAULT_V2_ITERATIONS >= 600_000);
  assert.notEqual(a.salt, b.salt, "cada cofre tem o seu sal");
  assert.deepEqual(await vaultCrypto.decryptVaultRecord(a, PASS), bundle);
  await assert.rejects(() => vaultCrypto.decryptVaultRecord(a, "outra frase qualquer"));
});

test("vault v2 - endereço não é o hash rápido do formato antigo", async () => {
  const address = await vaultCrypto.deriveVaultAddress(PASS);
  assert.match(address, /^[0-9a-f]{64}$/);
  assert.notEqual(address, await vaultCrypto.legacyLookupKey(PASS, "passphrase"));
  assert.equal(address, await vaultCrypto.deriveVaultAddress(PASS), "mesma senha acha o mesmo cofre");
});

test("vault v2 - link de sincronização leva sal e iterações; iteração fora da faixa é recusada", async () => {
  const rec = await vaultCrypto.encryptVaultV2({ routeId: "vx_b", publicJwk: {}, privateJwk: {} }, PASS);
  const back = vaultCrypto.decodeVaultBundleFromUrl(vaultCrypto.encodeVaultBundleForUrl(rec));
  assert.equal(back.v, 2);
  assert.equal(back.salt, rec.salt);
  assert.equal(back.iter, rec.iter);
  const tampered = btoa(["2", "10", rec.salt, rec.iv, rec.ciphertext].join(":"));
  assert.equal(vaultCrypto.decodeVaultBundleFromUrl(tampered), null);
  const legacyLink = vaultCrypto.decodeVaultBundleFromUrl(btoa("aa:bb"));
  assert.equal(legacyLink.v, undefined, "link v1 continua legível");
});

test("vault v2 - cofre revogado não abre", async () => {
  assert.equal(vaultCrypto.isRevokedRecord({ revoked: true }), true);
  assert.equal(await vaultCrypto.decryptVaultRecord({ revoked: true, iv: "00", ciphertext: "00" }, PASS), null);
});

test("PM-90 - login social sozinho não cria cofre nem envia nada ao servidor", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    const acc = await localAccount.ensureLocalAccount();
    const res = await oauthVault.restoreOrBindGoogleIdentity({ sub: "g_1", email: "a@b.c", name: "Ana", picture: "" });
    assert.equal(res.routeId, acc.routeId);
    assert.equal(res.restored, false);
    assert.equal(server.posts.length, 0);
    const names = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    assert.deepEqual(names.filter((k) => k.startsWith("vox-vault-v2:") || k.startsWith("vox-oauth-vault-v1:")), []);
    assert.equal(localAccount.getProfileEnrichment().oauthSub, "g_1", "o login ainda enriquece o perfil");
  } finally {
    server.restore();
  }
});

for (const provider of ["google", "meta"]) {
  test(`PM-90 - cofre v1 de ${provider} abre uma última vez e é revogado`, async () => {
    const server = installMemoryServer();
    try {
      freshDevice();
      const original = await localAccount.exportLocalAccountBundle();
      const sub = `${provider}_sub_7`;
      const key = await vaultCrypto.legacyLookupKey(sub, provider);
      server.store.set(key, await legacyRecord(original, sub, provider));

      freshDevice();
      const res = await oauthVault.restoreOrBindOAuthIdentity({ provider, sub, email: "", name: "Bia", picture: "" });
      assert.equal(res.restored, true);
      assert.equal(res.legacyVault, true);
      assert.equal(localAccount.getCachedRouteIdSync(), original.routeId);
      assert.equal(server.store.get(key).revoked, true, "endereço v1 recebeu a marca de revogado");
      assert.equal(server.store.get(key).ciphertext, undefined);
      assert.equal(vaultLegacy.consumeLegacyRevokedNotice(), true, "a pessoa é avisada para criar a senha");

      freshDevice();
      const again = await oauthVault.restoreOrBindOAuthIdentity({ provider, sub, email: "", name: "Bia", picture: "" });
      assert.equal(again.restored, false);
      assert.notEqual(again.routeId, original.routeId);
    } finally {
      server.restore();
    }
  });
}

test("PM-90 - cofre v1 de senha abre, é cifrado de novo em v2 e o v1 é revogado", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    const original = await localAccount.exportLocalAccountBundle();
    const legacyKey = await vaultCrypto.legacyLookupKey(PASS, "passphrase");
    server.store.set(legacyKey, await legacyRecord(original, PASS, "passphrase"));

    freshDevice();
    const res = await oauthVault.restoreFromPassphraseVault(PASS);
    assert.equal(res.ok, true);
    assert.equal(res.upgraded, true);
    assert.equal(res.routeId, original.routeId);
    assert.equal(server.store.get(legacyKey).revoked, true);
    const v2 = server.store.get(await vaultCrypto.deriveVaultAddress(PASS));
    assert.equal(v2.v, 2);

    freshDevice();
    const again = await oauthVault.restoreFromPassphraseVault(PASS);
    assert.equal(again.ok, true);
    assert.equal(again.upgraded, false, "segunda vez já abre o v2");
    assert.equal(again.routeId, original.routeId);
  } finally {
    server.restore();
  }
});

test("PM-90 - migração da abertura revoga v1 locais e o do login vinculado, avisa uma vez", async () => {
  freshDevice();
  const storage = globalThis.localStorage;
  storage.setItem(`${vaultLegacy.LEGACY_VAULT_PREFIX}aaaa`, "{}");
  const sent = [];
  const saveRemote = (key, record) => sent.push({ key, record });
  const enrichment = { oauthProvider: "google", oauthSub: "g_9" };

  const n = await vaultLegacy.migrateLegacyVaults({ enrichment, saveRemote, serverMarker: "srv-a", storage });
  assert.equal(n, 1);
  assert.equal(storage.getItem(`${vaultLegacy.LEGACY_VAULT_PREFIX}aaaa`), null);
  const loginKey = await vaultCrypto.legacyLookupKey("g_9", "google");
  assert.deepEqual(sent.map((s) => s.key).sort(), ["aaaa", loginKey].sort());
  assert.ok(sent.every((s) => s.record.revoked === true));
  assert.equal(vaultLegacy.consumeLegacyRevokedNotice(storage), true);
  assert.equal(vaultLegacy.consumeLegacyRevokedNotice(storage), false);

  sent.length = 0;
  await vaultLegacy.migrateLegacyVaults({ enrichment, saveRemote, serverMarker: "srv-a", storage });
  assert.equal(sent.length, 0, "não repete para o mesmo servidor");
  await vaultLegacy.migrateLegacyVaults({ enrichment, saveRemote, serverMarker: "srv-b", storage });
  assert.deepEqual(sent.map((s) => s.key), [loginKey], "servidor novo também recebe a revogação");
});

test("PM-90 - salvar a Senha Soberana de novo apaga o aviso pendente", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    await localAccount.ensureLocalAccount();
    vaultLegacy.markLegacyRevokedNotice();
    const saved = await oauthVault.savePassphraseVault(PASS);
    assert.equal(saved.ok, true);
    assert.equal(saved.bundle.v, 2);
    assert.equal(vaultLegacy.consumeLegacyRevokedNotice(), false);
  } finally {
    server.restore();
  }
});

test("PM-94 - o cofre v2 vai com a prova do dono, que sai da senha e não do endereço", async () => {
  const server = installMemoryServer();
  try {
    freshDevice();
    await localAccount.ensureLocalAccount();
    assert.equal((await oauthVault.savePassphraseVault(PASS)).ok, true);
    const address = await vaultCrypto.deriveVaultAddress(PASS);
    const sent = server.posts.find((p) => p.key === address);
    assert.match(sent.ownerToken, /^[0-9a-f]{64}$/);
    assert.equal(sent.ownerToken, await vaultCrypto.deriveVaultOwnerToken(PASS), "a mesma senha dá a mesma prova");
    assert.notEqual(sent.ownerToken, address);
    assert.notEqual(await vaultCrypto.deriveVaultOwnerToken("outra senha bem longa"), sent.ownerToken);
  } finally {
    server.restore();
  }
});
