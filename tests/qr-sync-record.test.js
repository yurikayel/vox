/**
 * QR do cofre: o QR do Perfil leva um cofre mínimo (conta, semente e o nome se couber) que cabe no QR versão 11,
 * abre só com a Senha Soberana e restaura a mesma conta no outro aparelho.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as oauthVault from "../client/js/vault/index.js";
import * as vaultCrypto from "../client/js/vault/vault-crypto.js";
import * as identitySeed from "../client/js/identity-seed.js";
import * as qr from "../client/js/qr-url.js";
import { QR_MAX_BYTES } from "../client/js/qr-url-codec.js";
import { buildSyncUrl } from "../client/js/app/profile-vault-sync.js";

const PASS = "frase longa de teste soberana";
const LOC = { origin: "https://yurikayel.github.io", pathname: "/vox/" };

function freshDevice() {
  localStorage.clear();
  localAccount.wipeLocalAccount();
}

/** Sem servidor de memória: o QR não depende dele. */
function offline() {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  return () => (globalThis.fetch = orig);
}

function qrBudget() {
  return QR_MAX_BYTES - buildSyncUrl(null, () => "", LOC).length;
}

test("vault-crypto - compactV2PlainBudget bate com o tamanho real do cofre compacto", async () => {
  for (const chars of [120, 200, 277]) {
    const budget = vaultCrypto.compactV2PlainBudget(chars);
    const plain = { p: "x".repeat(budget - 8) };
    assert.equal(new TextEncoder().encode(JSON.stringify(plain)).length, budget);
    const encoded = vaultCrypto.encodeVaultBundleForUrl(await vaultCrypto.encryptVaultV2(plain, PASS));
    assert.ok(encoded.length <= chars, `${encoded.length} > ${chars}`);
    assert.ok(encoded.length > chars - 4, "o orçamento não desperdiça mais que um bloco de base64");
  }
});

test("QR do cofre - cabe no QR, decodifica e restaura a mesma conta com semente e nome", async () => {
  const restoreFetch = offline();
  try {
    freshDevice();
    const acc = await localAccount.ensureLocalAccount();
    localAccount.setDisplayName("Ana Silva");
    const built = await oauthVault.buildQrSyncRecord(PASS, qrBudget());
    assert.equal(built.ok, true);
    assert.equal(built.withName, true);
    const url = buildSyncUrl(built.record, vaultCrypto.encodeVaultBundleForUrl, LOC);
    assert.ok(new TextEncoder().encode(url).length <= QR_MAX_BYTES, `URL de ${url.length} bytes`);
    const encoded = qr.encodeVoxUrl(url);
    assert.equal(qr.decodeQrModules(encoded.modules), url);
    freshDevice();
    const b = decodeURIComponent(url.split("#/sync?b=")[1]);
    const res = await oauthVault.restoreFromPassphraseVault(PASS, null, vaultCrypto.decodeVaultBundleFromUrl(b));
    assert.equal(res.ok, true);
    assert.equal(res.routeId, acc.routeId);
    assert.equal(res.displayName, "Ana Silva");
    assert.equal((await identitySeed.openSeed(acc.routeId, PASS))?.length, 16);
  } finally {
    restoreFetch();
  }
});

test("QR do cofre - sem espaço para o nome, leva só conta e semente", async () => {
  freshDevice();
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("N".repeat(60));
  const built = await oauthVault.buildQrSyncRecord(PASS, qrBudget() - 60);
  assert.equal(built.ok, true);
  assert.equal(built.withName, false);
  const plain = await vaultCrypto.decryptVaultRecord(built.record, PASS);
  assert.deepEqual(Object.keys(plain).sort(), ["routeId", "seed"]);
});

test("QR do cofre - conta sem semente ou endereço longo demais dão motivo, não um QR quebrado", async () => {
  freshDevice();
  const acc = await localAccount.ensureLocalAccount();
  const tiny = await oauthVault.buildQrSyncRecord(PASS, 40);
  assert.equal(tiny.ok, false);
  assert.match(tiny.reason, /longo demais/);
  identitySeed.forgetSeed(acc.routeId);
  assert.equal(identitySeed.hasSeed(acc.routeId), false);
  const legacy = await oauthVault.buildQrSyncRecord(PASS, qrBudget());
  assert.equal(legacy.ok, false);
  assert.match(legacy.reason, /12 palavras/);
});
