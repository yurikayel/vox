/**
 * @file ADR-032 §3.3 — a frase da conta ativa: mostrar, conferir e entrar por ela.
 *
 * - Conta com semente: 12 palavras. Conta antiga (sem semente): 24 palavras da chave de assinatura.
 * - Conta travada (ADR-026): mostrar a frase pede a Senha Soberana.
 * - A frase só conta como saída depois que a pessoa digita de volta 3 palavras sorteadas (§3.3.4).
 * - Entrar pela frase não toca em rede: a mesma chave, o mesmo `routeId`.
 */

import { markAccountExit } from "./account-exit.js";
import * as cryptoDm from "./crypto-dm.js";
import * as identitySeed from "./identity-seed.js";
import { isLocked } from "./keystore.js";
import * as localAccount from "./local-account.js";
import { entropyToWords, identityFromPhrase, normalizeWords, privateKeyBytes } from "./recovery-phrase.js";

/** Quantas palavras a pessoa digita de volta para a frase valer como saída. */
export const CONFIRM_COUNT = 3;

/**
 * Se mostrar a frase desta conta pede a Senha Soberana (conta travada).
 * @returns {Promise<boolean>}
 */
export async function phraseNeedsPassphrase() {
  const acc = await localAccount.ensureLocalAccount();
  return isLocked(acc.privateJwk);
}

/**
 * A frase da conta ativa.
 * @param {string} [passphrase] Senha Soberana, se a conta estiver travada.
 * @returns {Promise<{ kind: "semente"|"chave", words: string[] }>}
 */
export async function getAccountPhrase(passphrase = "") {
  const { kind, secret } = await openRecoverySecret(passphrase);
  return { kind, words: await entropyToWords(secret) };
}

/**
 * O segredo que a frase codifica (e que os guardiões dividem): a semente, ou a chave em conta antiga.
 * @param {string} [passphrase] Senha Soberana, se a conta estiver travada.
 * @returns {Promise<{ kind: "semente"|"chave", secret: Uint8Array }>}
 */
export async function openRecoverySecret(passphrase = "") {
  const acc = await localAccount.ensureLocalAccount();
  const seed = await identitySeed.openSeed(acc.routeId, passphrase);
  if (seed) return { kind: "semente", secret: seed };
  const { privateJwk } = await localAccount.openAccountKeys(passphrase);
  return { kind: "chave", secret: privateKeyBytes(privateJwk) };
}

/**
 * Posições (base 0) sorteadas para conferir, em ordem crescente.
 * @param {number} total palavras da frase
 * @param {() => number} [random]
 * @returns {number[]}
 */
export function pickConfirmPositions(total, random = Math.random) {
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, CONFIRM_COUNT).sort((a, b) => a - b);
}

/**
 * Confere as palavras digitadas; com tudo certo, marca a frase como saída da conta.
 * @param {string[]} words a frase mostrada
 * @param {Record<number, string>} typed posição → o que a pessoa digitou
 * @returns {boolean}
 */
export function confirmPhraseWords(words, typed) {
  const entries = Object.entries(typed || {});
  if (entries.length < CONFIRM_COUNT) return false;
  const ok = entries.every(([pos, text]) => {
    const [word] = normalizeWords(text);
    const expected = words[Number(pos)];
    return Boolean(word && expected && (word === expected || (word.length >= 4 && expected.startsWith(word.slice(0, 4)))));
  });
  if (ok) markAccountExit("frase");
  return ok;
}

async function adoptKeysFromPhrase(id, routeId) {
  const previous = localAccount.getCachedRouteIdSync();
  await localAccount.importLocalAccountBundle({ routeId, publicJwk: id.signing.publicJwk, privateJwk: id.signing.privateJwk });
  if (id.dm) await cryptoDm.setDmKeypair(id.dm);
  else if (previous && previous !== routeId) await cryptoDm.setDmKeypair(await cryptoDm.generateDmKeypair());
  if (id.seed) await identitySeed.storeSeed(routeId, id.seed);
}

/**
 * Entra pela frase neste aparelho. Se a conta ativa já é a da frase, não mexe nas chaves.
 * @param {string} text as palavras digitadas
 * @returns {Promise<{ ok: true, routeId: string, kind: "semente"|"chave", displayName: string }>}
 */
export async function restoreFromPhrase(text) {
  const id = await identityFromPhrase(text);
  const routeId = await localAccount.computeRouteId(id.signing.publicJwk);
  if (localAccount.getCachedRouteIdSync() !== routeId) await adoptKeysFromPhrase(id, routeId);
  markAccountExit("frase", routeId);
  return { ok: true, routeId, kind: id.kind, displayName: localAccount.getDisplayName() };
}
