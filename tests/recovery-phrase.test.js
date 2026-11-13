/**
 * ADR-032 §3.3 — frase de recuperação: lista BIP-39 em português, codificação com verificador, derivação
 * determinística da semente, e a semente guardada junto com a conta (cifrada pelo aparelho ou pela senha).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import "./setup.js";
import { BIP39_PT } from "../client/js/data/bip39-pt.js";
import * as phrase from "../client/js/recovery-phrase.js";
import { N, publicPoint, scalarFromBytes } from "../client/js/p256.js";
import * as identitySeed from "../client/js/identity-seed.js";
import * as keyLock from "../client/js/key-lock.js";
import * as keystore from "../client/js/keystore.js";
import * as localAccount from "../client/js/local-account.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import { computeRouteId } from "../client/js/signed-verify.js";

const FIXED_SEED = Uint8Array.from({ length: 16 }, (_, i) => i);
const FIXED_WORDS = "abacate afivelar inativo afivelar donzela achatar barulho beber albergue exalar cuidado banir";
const FIXED_ROUTE = "vx_wtBphdm-O7ADUXqxJEO4";
const PASS = "quatro palavras de teste soberano";

async function signsAndVerifies({ publicJwk, privateJwk }) {
  const algo = { name: "ECDSA", namedCurve: "P-256" };
  const priv = await crypto.subtle.importKey("jwk", privateJwk, algo, false, ["sign"]);
  const pub = await crypto.subtle.importKey("jwk", publicJwk, algo, false, ["verify"]);
  const data = new TextEncoder().encode("vox");
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, data);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, data);
}

async function freshAccount() {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  return localAccount.ensureLocalAccount();
}

test("frase - lista é a BIP-39 em português, sem alteração", () => {
  const hash = createHash("sha256").update(BIP39_PT.join("\n") + "\n").digest("hex");
  assert.equal(BIP39_PT.length, 2048);
  assert.equal(hash, "2685e9c194c82ae67e10ba59d9ea5345a23dc093e92276fc5361f6667d79cd3f");
  assert.equal(new Set(BIP39_PT.map((w) => w.slice(0, 4))).size, 2048, "4 primeiras letras não se repetem");
});

test("frase - vetores de borda da BIP-39 (zeros e uns)", async () => {
  assert.equal((await phrase.entropyToWords(new Uint8Array(16))).join(" "), `${"abacate ".repeat(11)}abater`);
  const ones = await phrase.entropyToWords(new Uint8Array(32).fill(0xff));
  assert.equal(ones.join(" "), `${"zumbido ".repeat(23)}validade`);
});

test("frase - ida e volta, com acento, maiúscula, pontuação e só as 4 primeiras letras", async () => {
  assert.equal((await phrase.entropyToWords(FIXED_SEED)).join(" "), FIXED_WORDS);
  assert.deepEqual(await phrase.wordsToEntropy(FIXED_WORDS), FIXED_SEED);
  const typed = "Abacate, AFIV inatívo\nafivelar - donz acha barulho BEBER albe exal cuid bani";
  assert.deepEqual(await phrase.wordsToEntropy(typed), FIXED_SEED);
});

test("frase - recusa contagem errada, palavra de fora e verificador que não bate", async () => {
  await assert.rejects(phrase.wordsToEntropy("abacate abacate"), /12 ou 24 palavras/);
  await assert.rejects(phrase.wordsToEntropy(FIXED_WORDS.replace("beber", "kiwi")), /não é uma palavra da lista/);
  const swapped = FIXED_WORDS.split(" ");
  [swapped[0], swapped[2]] = [swapped[2], swapped[0]];
  await assert.rejects(phrase.wordsToEntropy(swapped.join(" ")), /errada ou fora de ordem/);
});

test("frase - P-256 em JS confere com chaves geradas pelo WebCrypto", async () => {
  for (let i = 0; i < 5; i++) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const d = BigInt(`0x${Buffer.from(jwk.d, "base64url").toString("hex")}`);
    const { x, y } = publicPoint(d);
    assert.equal(x.toString(16).padStart(64, "0"), Buffer.from(jwk.x, "base64url").toString("hex"));
    assert.equal(y.toString(16).padStart(64, "0"), Buffer.from(jwk.y, "base64url").toString("hex"));
  }
  assert.equal(scalarFromBytes(new Uint8Array(48)), 1n);
  assert.ok(scalarFromBytes(new Uint8Array(48).fill(0xff)) < N);
});

test("frase - a mesma semente dá sempre a mesma conta, e as chaves assinam e conferem", async () => {
  const a = await phrase.identityFromSeed(FIXED_SEED);
  const b = await phrase.identityFromPhrase(FIXED_WORDS);
  assert.equal(await computeRouteId(a.signing.publicJwk), FIXED_ROUTE);
  assert.equal(b.kind, "semente");
  assert.deepEqual(b.signing, a.signing);
  assert.deepEqual(b.dm, a.dm);
  assert.notEqual(a.dm.publicJwk.x, a.signing.publicJwk.x, "DM e assinatura são chaves diferentes");
  assert.equal(await signsAndVerifies(a.signing), true);
});

test("frase - 24 palavras de uma conta antiga voltam a mesma identidade (sem DM)", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const words = await phrase.phraseFromPrivateJwk(privateJwk);
  assert.equal(words.length, 24);
  const back = await phrase.identityFromPhrase(words.join(" "));
  assert.equal(back.kind, "chave");
  assert.equal(back.dm, null);
  assert.equal(await computeRouteId(back.signing.publicJwk), await computeRouteId(publicJwk));
  assert.equal(await signsAndVerifies(back.signing), true);
});

test("semente - conta nova nasce da semente guardada, com DM da mesma semente", async () => {
  const acc = await freshAccount();
  const seed = await identitySeed.openSeed(acc.routeId);
  assert.equal(seed.length, 16);
  const again = await phrase.identityFromSeed(seed);
  assert.equal(await computeRouteId(again.signing.publicJwk), acc.routeId);
  assert.deepEqual((await cryptoDm.ensureDmKeys()).publicJwk, again.dm.publicJwk);
  assert.equal(keystore.isLocked(JSON.parse(localStorage.getItem(identitySeed.SEED_STORAGE))[acc.routeId]), false);
});

test("semente - conta travada guarda a semente só na cópia da senha", async () => {
  const acc = await freshAccount();
  const before = await identitySeed.openSeed(acc.routeId);
  assert.equal(await localAccount.lockActiveAccount(PASS), true);
  const stored = JSON.parse(localStorage.getItem(identitySeed.SEED_STORAGE))[acc.routeId];
  assert.equal(keystore.isLocked(stored), true, "aqui só a marca");
  await assert.rejects(identitySeed.openSeed(acc.routeId), keystore.KeyLockedError);
  assert.deepEqual(await identitySeed.openSeed(acc.routeId, PASS), before);
});

test("semente - limpeza local e remoção da conta levam a semente junto", async () => {
  const first = await freshAccount();
  const second = await localAccount.createAdditionalAccount({ displayName: "Segunda" });
  assert.equal(identitySeed.hasSeed(second.routeId), true);
  await localAccount.switchActiveAccount(first.routeId);
  assert.equal(localAccount.removeVaultAccount(second.routeId), true);
  assert.equal(identitySeed.hasSeed(second.routeId), false);
  await localAccount.wipeLocalAccount();
  assert.equal(localStorage.getItem(identitySeed.SEED_STORAGE), null);
});
