/**
 * Entrar em outra conta neste aparelho (frase, arquivo `.voxid`, cofre): nome, Pix, enriquecimento e chave de DM
 * passam a ser os da conta que entrou, nunca os da que estava ativa; a que estava ativa vai inteira para o cofre
 * local e volta igual. E o cartão do Perfil grava o cofre com o e-mail da conta (ADR-032 Emenda 1).
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as keyLock from "../client/js/key-lock.js";
import { openRecoverySecret, restoreFromPhrase } from "../client/js/account-phrase.js";
import { exportAccountBundle, importAccountBundle } from "../client/js/account-backup.js";
import { entropyToWords, newSeed } from "../client/js/recovery-phrase.js";
import { buildSyncUrl, needsNoEmailConfirm } from "../client/js/app/profile-vault-sync.js";

const PIX = { normalized: "11999990000", type: "phone", masked: "(11) 9****-0000" };

async function previousAccount() {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Conta Antiga");
  localAccount.setPixKey(PIX);
  localAccount.setProfileEnrichment({ displayName: "Conta Antiga", oauthEmail: "antiga@exemplo.com" });
  return { routeId: acc.routeId, dmPub: JSON.stringify(await cryptoDm.getPublicJwk()) };
}

function assertNothingFrom(prev, label) {
  assert.notEqual(localAccount.getDisplayName(), "Conta Antiga", `${label}: nome`);
  assert.equal(localAccount.getPixKey(), null, `${label}: Pix`);
  assert.notEqual(localAccount.getProfileEnrichment()?.oauthEmail, "antiga@exemplo.com", `${label}: enriquecimento`);
}

async function assertPreviousKept(prev) {
  assert.equal(await localAccount.switchActiveAccount(prev.routeId), true);
  assert.equal(localAccount.getDisplayName(), "Conta Antiga");
  assert.equal(localAccount.getPixKey()?.normalized, PIX.normalized);
  assert.equal(JSON.stringify(await cryptoDm.getPublicJwk()), prev.dmPub, "a anterior volta com a própria chave de DM");
}

test("entrar pela frase de outra conta não leva nome, Pix, enriquecimento nem chave de DM da anterior", async () => {
  const prev = await previousAccount();
  const res = await restoreFromPhrase(await entropyToWords(newSeed()));
  assert.notEqual(res.routeId, prev.routeId);
  assertNothingFrom(prev, "frase");
  assert.notEqual(res.displayName, "Conta Antiga");
  assert.notEqual(JSON.stringify(await cryptoDm.getPublicJwk()), prev.dmPub);
  await assertPreviousKept(prev);
});

test("restaurar .voxid de outra conta sem nome nem Pix não herda os da anterior", async () => {
  const prev = await previousAccount();
  const other = await localAccount.createAdditionalAccount({ displayName: "" });
  const file = await exportAccountBundle("uma senha longa de teste", { asFile: true });
  await localAccount.switchActiveAccount(prev.routeId);
  localAccount.removeVaultAccount(other.routeId);
  const acc = await importAccountBundle(file, "uma senha longa de teste");
  assert.equal(acc.routeId, other.routeId);
  assertNothingFrom(prev, ".voxid");
  assert.notEqual(JSON.stringify(await cryptoDm.getPublicJwk()), prev.dmPub);
  await assertPreviousKept(prev);
});

test("voltar pela frase a uma conta que já esteve aqui traz o nome e o Pix dela do cofre local", async () => {
  const prev = await previousAccount();
  const words = await entropyToWords((await openRecoverySecret()).secret);
  await localAccount.createAdditionalAccount({ displayName: "Outra" });
  await restoreFromPhrase(words);
  assert.equal(localAccount.getCachedRouteIdSync(), prev.routeId);
  assert.equal(localAccount.getDisplayName(), "Conta Antiga");
  assert.equal(localAccount.getPixKey()?.normalized, PIX.normalized);
});

test("cartão do Perfil: sem e-mail, conta com saída por e-mail pede confirmação; o link leva o cofre no fragmento", () => {
  assert.equal(needsNoEmailConfirm("", { email: 1 }), true);
  assert.equal(needsNoEmailConfirm("ana@exemplo.com", { email: 1 }), false);
  assert.equal(needsNoEmailConfirm("", { frase: 1 }), false);
  assert.equal(needsNoEmailConfirm("", {}), false);
  const url = buildSyncUrl({ v: 2 }, () => "a b/c", { origin: "https://exemplo.org", pathname: "/vox/" });
  assert.equal(url, "https://exemplo.org/vox/#/sync?b=a%20b%2Fc");
});
