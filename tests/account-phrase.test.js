/**
 * ADR-032 §3.3 — a frase da conta ativa: mostrar (12 ou 24 palavras, com senha se travada), conferir 3 palavras
 * para valer como saída, e entrar pela frase num navegador limpo sem tocar em rede.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as accountPhrase from "../client/js/account-phrase.js";
import { getAccountExits } from "../client/js/account-exit.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as identitySeed from "../client/js/identity-seed.js";
import * as keyLock from "../client/js/key-lock.js";
import * as localAccount from "../client/js/local-account.js";
import { parseRoute } from "../client/js/app/route-parse.js";
import * as screen from "../client/js/render/recovery-phrase.js";

const PASS = "quatro palavras de teste soberano";

async function freshAccount() {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  return localAccount.ensureLocalAccount();
}

async function wipeBrowser() {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
}

test("frase da conta - conta nova mostra 12 palavras; conta sem semente mostra 24", async () => {
  const acc = await freshAccount();
  const seeded = await accountPhrase.getAccountPhrase();
  assert.equal(seeded.kind, "semente");
  assert.equal(seeded.words.length, 12);
  identitySeed.forgetSeed(acc.routeId);
  const legacy = await accountPhrase.getAccountPhrase();
  assert.equal(legacy.kind, "chave");
  assert.equal(legacy.words.length, 24);
});

test("frase da conta - conta travada só mostra a frase com a Senha Soberana", async () => {
  await freshAccount();
  const before = await accountPhrase.getAccountPhrase();
  assert.equal(await accountPhrase.phraseNeedsPassphrase(), false);
  assert.equal(await localAccount.lockActiveAccount(PASS), true);
  assert.equal(await accountPhrase.phraseNeedsPassphrase(), true);
  await assert.rejects(accountPhrase.getAccountPhrase());
  assert.deepEqual(await accountPhrase.getAccountPhrase(PASS), before);
});

test("frase da conta - sorteio de 3 posições distintas, em ordem", () => {
  let n = 0;
  const seq = () => [0.9, 0.1, 0.5, 0.3, 0.7][n++ % 5];
  const picked = accountPhrase.pickConfirmPositions(12, seq);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  assert.deepEqual([...picked].sort((a, b) => a - b), picked);
  assert.ok(picked.every((p) => p >= 0 && p < 12));
});

test("frase da conta - só vale como saída quando as 3 palavras conferem", async () => {
  const acc = await freshAccount();
  const { words } = await accountPhrase.getAccountPhrase();
  assert.equal(accountPhrase.confirmPhraseWords(words, { 0: words[0], 4: "errada", 9: words[9] }), false);
  assert.equal(getAccountExits(acc.routeId).frase, undefined);
  assert.equal(accountPhrase.confirmPhraseWords(words, { 0: words[0] }), false, "menos de 3 não vale");
  const typed = { 0: words[0].toUpperCase(), 4: `${words[4].slice(0, 4)} `, 9: words[9] };
  assert.equal(accountPhrase.confirmPhraseWords(words, typed), true);
  assert.ok(getAccountExits(acc.routeId).frase > 0);
});

test("frase da conta - navegador limpo: as 12 palavras trazem a mesma conta, DM e semente", async () => {
  const acc = await freshAccount();
  const { words } = await accountPhrase.getAccountPhrase();
  const dmBefore = (await cryptoDm.ensureDmKeys()).publicJwk;
  await wipeBrowser();
  const res = await accountPhrase.restoreFromPhrase(words.join(" "));
  assert.equal(res.ok, true);
  assert.equal(res.kind, "semente");
  assert.equal(res.routeId, acc.routeId);
  assert.equal((await localAccount.ensureLocalAccount()).routeId, acc.routeId);
  assert.deepEqual((await cryptoDm.ensureDmKeys()).publicJwk, dmBefore);
  assert.equal(identitySeed.hasSeed(acc.routeId), true);
  assert.ok(getAccountExits(acc.routeId).frase > 0);
});

test("frase da conta - 24 palavras por cima de outra conta trocam também as chaves de DM", async () => {
  const old = await freshAccount();
  identitySeed.forgetSeed(old.routeId);
  const { words } = await accountPhrase.getAccountPhrase();
  await freshAccount();
  const dmOther = (await cryptoDm.ensureDmKeys()).publicJwk;
  const res = await accountPhrase.restoreFromPhrase(words);
  assert.equal(res.kind, "chave");
  assert.equal(res.routeId, old.routeId);
  assert.notDeepEqual((await cryptoDm.ensureDmKeys()).publicJwk, dmOther, "DM da outra conta não fica");
});

test("frase da conta - frase errada não troca a conta ativa", async () => {
  const acc = await freshAccount();
  await assert.rejects(accountPhrase.restoreFromPhrase("abacate abacate"), /12 ou 24 palavras/);
  assert.equal((await localAccount.ensureLocalAccount()).routeId, acc.routeId);
});

test("tela da frase - rota, aviso, senha só quando travada, nota de conta antiga e conferência", () => {
  const loc = { hash: "#/frase", search: "" };
  const prev = [globalThis.window, globalThis.location];
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    assert.deepEqual(parseRoute(), { name: "recovery-phrase" });
  } finally {
    [globalThis.window, globalThis.location] = prev;
  }
  assert.match(screen.renderPhraseIntroHtml({ needsPassphrase: false }), /não fotografe/);
  assert.doesNotMatch(screen.renderPhraseIntroHtml({ needsPassphrase: false }), /id="phrase-pass"/);
  assert.match(screen.renderPhraseIntroHtml({ needsPassphrase: true }), /id="phrase-pass"/);
  const words = Array.from({ length: 24 }, () => "abacate");
  assert.match(screen.renderPhraseWordsHtml({ words, kind: "chave" }), /mensagens diretas antigas/);
  assert.doesNotMatch(screen.renderPhraseWordsHtml({ words: words.slice(0, 12), kind: "semente" }), /mensagens diretas antigas/);
  const confirm = screen.renderPhraseConfirmHtml([1, 5, 10]);
  assert.equal((confirm.match(/data-phrase-pos=/g) || []).length, 3);
  assert.match(confirm, /Palavra nº 2/);
});
