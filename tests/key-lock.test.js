/**
 * PM-93 etapa 2 — trava das chaves depois do backup com a Senha Soberana: assinatura e DM com chave não
 * exportável, cópia exportável só pela senha, e nenhuma identidade perdida no caminho.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as keystore from "../client/js/keystore.js";
import * as keyLock from "../client/js/key-lock.js";
import * as localAccount from "../client/js/local-account.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import { exportAccountBundle, importAccountBundle } from "../client/js/account-backup.js";
import { restoreFromPassphraseVault, savePassphraseVault } from "../client/js/oauth-vault.js";
import { sealKeysAtRest } from "../client/js/key-at-rest.js";

const PASS = "quatro palavras de teste soberano";
const read = (key) => JSON.parse(localStorage.getItem(key));

async function freshAccount() {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  return localAccount.ensureLocalAccount();
}

async function withoutKeystore(fn) {
  const saved = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  keystore.__resetKeystoreForTests();
  try {
    return await fn();
  } finally {
    globalThis.indexedDB = saved;
    keystore.__resetKeystoreForTests();
  }
}

function assertLockedEverywhere(routeId) {
  assert.equal(keystore.isLocked(read("vox-local-account-v1").privateJwk), true, "conta ativa");
  assert.equal(keystore.isLocked(read("vox-dm-keypair").privateJwk), true, "par de DM");
  const entry = read("vox-accounts-vault-v1")[routeId];
  assert.equal(keystore.isLocked(entry.privateJwk), true, "cofre multi-conta");
  assert.equal(keystore.isLocked(entry.dmKeypair.privateJwk), true, "DM no cofre multi-conta");
}

function storageHas(text) {
  for (let i = 0; i < localStorage.length; i += 1) {
    if (String(localStorage.getItem(localStorage.key(i))).includes(text)) return true;
  }
  return false;
}

async function assertSignsAs(routeId) {
  const signed = await localAccount.signPayload({ type: "post", text: "travada" });
  assert.equal(signed.author, routeId);
  assert.equal(await localAccount.verifyPayload(signed), true);
}

test("PM-93 etapa 2 - cofre com a Senha Soberana trava; assinatura e DM seguem funcionando", async () => {
  const acc = await freshAccount();
  const res = await savePassphraseVault(PASS);
  assert.equal(res.ok, true);
  assert.equal(res.locked, true);
  assertLockedEverywhere(acc.routeId);

  keyLock.__resetKeyLockForTests();
  await assertSignsAs(acc.routeId);
  const { publicJwk } = await cryptoDm.ensureDmKeys();
  const envelope = await cryptoDm.seal(publicJwk, "oi travado", { from: "a", to: "b" });
  assert.equal(await cryptoDm.open(envelope), "oi travado");
});

test("PM-93 etapa 2 - conta travada só exporta com a mesma senha, e a chave não fica em claro nem cifrada pelo aparelho", async () => {
  await freshAccount();
  const plain = await localAccount.exportLocalAccountBundle();
  await savePassphraseVault(PASS);

  await assert.rejects(() => localAccount.exportLocalAccountBundle(), keystore.KeyLockedError);
  await assert.rejects(() => localAccount.exportLocalAccountBundle("outra senha bem comprida"), /Senha incorreta/);
  await assert.rejects(() => exportAccountBundle(""), keystore.KeyLockedError);
  const other = await savePassphraseVault("outra senha bem comprida");
  assert.equal(other.ok, false);
  assert.match(other.reason, /Senha incorreta/);

  const opened = await localAccount.exportLocalAccountBundle(PASS);
  assert.equal(opened.privateJwk.d, plain.privateJwk.d);
  assert.equal(storageHas(plain.privateJwk.d), false);
  assert.equal(storageHas(keystore.SEALED_TAG), false, "nenhuma cópia cifrada pelo aparelho sobra");
});

test("PM-93 etapa 2 - .voxid com senha curta não trava; com a Senha Soberana trava e restaura travado", async () => {
  const acc = await freshAccount();
  await exportAccountBundle("curta-11ch");
  assert.equal(keystore.isSealed(read("vox-local-account-v1").privateJwk), true);
  const file = await exportAccountBundle(PASS);
  assert.equal(keystore.isLocked(read("vox-local-account-v1").privateJwk), true);

  await freshAccount();
  const restored = await importAccountBundle(file, PASS);
  assert.equal(restored.routeId, acc.routeId);
  assertLockedEverywhere(acc.routeId);
  await assertSignsAs(acc.routeId);
});

test("PM-93 etapa 2 - sem IndexedDB nada trava e o cofre é salvo como antes", async () => {
  await withoutKeystore(async () => {
    await localAccount.wipeLocalAccount();
    localStorage.clear();
    const acc = await localAccount.ensureLocalAccount();
    const res = await savePassphraseVault(PASS);
    assert.equal(res.ok, true);
    assert.equal(res.locked, false);
    assert.equal(keystore.isLocked(read("vox-local-account-v1").privateJwk), false);
    await assertSignsAs(acc.routeId);
  });
});

test("PM-93 etapa 2 - a migração da abertura não mexe em chave travada", async () => {
  await freshAccount();
  await savePassphraseVault(PASS);
  const before = localStorage.getItem("vox-local-account-v1");
  assert.equal(await sealKeysAtRest(), 0);
  assert.equal(localStorage.getItem("vox-local-account-v1"), before);
});

test("PM-93 etapa 2 - chave travada sumida do IndexedDB: assinar avisa e o cofre com a senha recupera", async () => {
  const acc = await freshAccount();
  await savePassphraseVault(PASS);
  await keystore.removeKey(`sign:${acc.routeId}`);
  keyLock.__resetKeyLockForTests();
  await assert.rejects(() => localAccount.signPayload({ type: "post", text: "x" }), keystore.KeystoreUnavailableError);

  const back = await restoreFromPassphraseVault(PASS);
  assert.equal(back.ok, true);
  assert.equal(back.routeId, acc.routeId);
  assert.equal(keystore.isLocked(read("vox-local-account-v1").privateJwk), true);
  await assertSignsAs(acc.routeId);
});

test("PM-93 etapa 2 - conta travada continua travada e assinando depois de trocar de conta", async () => {
  const first = await freshAccount();
  await savePassphraseVault(PASS);
  await localAccount.createAdditionalAccount({ displayName: "Segunda" });
  assert.equal(keystore.isSealed(read("vox-local-account-v1").privateJwk), true, "a conta nova começa cifrada pelo aparelho");
  assert.equal(await localAccount.switchActiveAccount(first.routeId), true);
  assertLockedEverywhere(first.routeId);
  await assertSignsAs(first.routeId);
});

test("PM-93 etapa 2 - limpar o aparelho apaga a cópia por senha e as chaves travadas", async () => {
  const acc = await freshAccount();
  await savePassphraseVault(PASS);
  assert.ok(await keystore.loadKey(`sign:${acc.routeId}`));
  await localAccount.wipeLocalAccount();
  assert.equal(localStorage.getItem("vox-locked-keys-v1"), null);
  assert.equal(await keystore.loadKey(`sign:${acc.routeId}`), null);
  assert.equal(await keystore.loadKey(`dm:${acc.routeId}`), null);
});
