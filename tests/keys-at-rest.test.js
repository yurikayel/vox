/**
 * PM-93 (etapa 1) — chaves privadas guardadas cifradas pela chave do aparelho, migração do que estava em claro
 * e nenhuma identidade trocada quando a chave do aparelho não abre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as keystore from "../client/js/keystore.js";
import { sealKeysAtRest } from "../client/js/key-at-rest.js";
import * as localAccount from "../client/js/local-account.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as wallet from "../client/js/wallet.js";

const FAKE_WALLET = { kty: "RSA", n: "bm9kZQ", e: "AQAB", d: "c2VncmVkbw" };
const read = (key) => JSON.parse(localStorage.getItem(key));

function freshDevice() {
  localStorage.clear();
  localAccount.wipeLocalAccount();
  wallet.__resetSessionForTests();
}

/** Simula um navegador em que o IndexedDB não responde (chave do aparelho indisponível). */
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

test("keystore - chave do aparelho não é exportável e o selo não deixa o segredo em claro", async () => {
  const key = await keystore.getDeviceKey();
  assert.equal(key.extractable, false);
  const sealed = await keystore.sealJson({ d: "segredo-de-teste" });
  assert.equal(keystore.isSealed(sealed), true);
  assert.equal(JSON.stringify(sealed).includes("segredo-de-teste"), false);
  assert.deepEqual(await keystore.openSealed(sealed), { d: "segredo-de-teste" });
  assert.deepEqual(await keystore.openSealed({ d: "claro" }), { d: "claro" }, "valor em claro passa direto");
});

test("keystore - sem IndexedDB não cifra, e o que foi cifrado não abre (sem inventar chave)", async () => {
  const sealed = await keystore.sealJson({ d: "x" });
  await withoutKeystore(async () => {
    assert.deepEqual(await keystore.sealJson({ d: "y" }), { d: "y" });
    await assert.rejects(() => keystore.openSealed(sealed), keystore.KeystoreUnavailableError);
  });
  assert.deepEqual(await keystore.openSealed(sealed), { d: "x" }, "volta a abrir quando o IndexedDB volta");
});

test("PM-93 - conta nova guarda a chave cifrada, assina e exporta para backup", async () => {
  freshDevice();
  const acc = await localAccount.ensureLocalAccount();
  assert.equal(keystore.isSealed(read("vox-local-account-v1").privateJwk), true);
  assert.equal(keystore.isSealed(read("vox-dm-keypair").privateJwk), true);
  const signed = await localAccount.signPayload({ type: "post", text: "oi" });
  assert.equal(await localAccount.verifyPayload(signed), true);
  const bundle = await localAccount.exportLocalAccountBundle();
  assert.equal(bundle.routeId, acc.routeId);
  assert.ok(bundle.privateJwk.d, "o backup leva a chave aberta");
});

test("PM-93 - migração cifra conta, DM, cofre multi-conta e carteira guardados em claro", async () => {
  freshDevice();
  const acc = await localAccount.ensureLocalAccount();
  const plainAcc = { ...read("vox-local-account-v1"), privateJwk: (await localAccount.exportLocalAccountBundle()).privateJwk };
  const plainDm = await cryptoDm.getDmKeypair();
  localStorage.setItem("vox-local-account-v1", JSON.stringify(plainAcc));
  localStorage.setItem("vox-dm-keypair", JSON.stringify(plainDm));
  localStorage.setItem("vox-accounts-vault-v1", JSON.stringify({ [acc.routeId]: { ...plainAcc, dmKeypair: plainDm } }));
  localStorage.setItem("vox-wallet-jwk", JSON.stringify(FAKE_WALLET));

  assert.equal(await sealKeysAtRest(), 4);
  assert.equal(keystore.isSealed(read("vox-local-account-v1").privateJwk), true);
  assert.equal(keystore.isSealed(read("vox-dm-keypair").privateJwk), true);
  const entry = read("vox-accounts-vault-v1")[acc.routeId];
  assert.equal(keystore.isSealed(entry.privateJwk), true);
  assert.equal(keystore.isSealed(entry.dmKeypair.privateJwk), true);
  assert.equal(keystore.isSealed(read("vox-wallet-jwk")), true);
  assert.equal(localStorage.getItem("vox-wallet-jwk").includes(FAKE_WALLET.d), false);
  assert.equal(await sealKeysAtRest(), 0, "segunda vez não muda nada");

  const signed = await localAccount.signPayload({ type: "post", text: "depois da migração" });
  assert.equal(signed.author, acc.routeId);
  assert.equal(await localAccount.verifyPayload(signed), true);
});

test("PM-93 - migração não regrava se o armazenamento mudou no meio", async () => {
  const store = new Map([["vox-dm-keypair", JSON.stringify({ publicJwk: { x: 1 }, privateJwk: { d: "a" } })]]);
  let dmReads = 0;
  const racing = {
    getItem: (k) => {
      if (k !== "vox-dm-keypair") return store.get(k) ?? null;
      dmReads += 1;
      return dmReads > 1 ? JSON.stringify({ publicJwk: { x: 2 }, privateJwk: { d: "b" } }) : store.get(k);
    },
    setItem: (k, v) => store.set(k, v),
  };
  assert.equal(await sealKeysAtRest(racing), 0);
  assert.equal(JSON.parse(store.get("vox-dm-keypair")).privateJwk.d, "a", "nada foi sobrescrito");
});

test("PM-93 - chave do aparelho indisponível não troca a identidade", async () => {
  freshDevice();
  const acc = await localAccount.ensureLocalAccount();
  await withoutKeystore(async () => {
    const again = await localAccount.ensureLocalAccount();
    assert.equal(again.routeId, acc.routeId, "não gera conta nova por cima");
    await assert.rejects(() => localAccount.signPayload({ type: "post", text: "x" }), keystore.KeystoreUnavailableError);
    const dm = await cryptoDm.ensureDmKeys();
    assert.equal(keystore.isSealed(dm.privateJwk), true, "não gera par de DM novo por cima");
  });
  assert.equal(await localAccount.verifyPayload(await localAccount.signPayload({ type: "post", text: "ok" })), true);
});

test("PM-93 - carteira guardada cifrada abre na sessão seguinte sem gerar outra", async () => {
  freshDevice();
  await wallet.saveJwk(FAKE_WALLET);
  assert.equal(keystore.isSealed(read("vox-wallet-jwk")), true);
  wallet.__resetSessionForTests();
  assert.equal(wallet.getStoredJwk(), null, "cifrada não aparece pelo caminho síncrono");
  assert.equal(wallet.hasWallet(), true);
  assert.deepEqual(await wallet.ensureWallet(), FAKE_WALLET);
  assert.deepEqual(wallet.getStoredJwk(), FAKE_WALLET, "aberta para a sessão");
});

test("PM-93 - conta adicional e troca de conta mantêm as chaves cifradas e assinando", async () => {
  freshDevice();
  const first = await localAccount.ensureLocalAccount();
  const second = await localAccount.createAdditionalAccount({ displayName: "Segunda" });
  const vault = read("vox-accounts-vault-v1");
  for (const entry of Object.values(vault)) {
    assert.equal(keystore.isSealed(entry.privateJwk), true);
    assert.equal(keystore.isSealed(entry.dmKeypair.privateJwk), true);
  }
  assert.equal(await localAccount.switchActiveAccount(first.routeId), true);
  const signed = await localAccount.signPayload({ type: "post", text: "de volta" });
  assert.equal(signed.author, first.routeId);
  assert.equal(await localAccount.verifyPayload(signed), true);
  assert.notEqual(second.routeId, first.routeId);
});
