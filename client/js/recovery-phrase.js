/**
 * @file ADR-032 §3.3 — frase de recuperação: a conta escrita em palavras, sem servidor.
 *
 * - **12 palavras (contas novas):** codificam uma semente de 128 bits (BIP-39, lista em português). Da semente
 *   saem, por HKDF-SHA256 com rótulos diferentes, a chave de assinatura (o `routeId`) e a chave de DM.
 * - **24 palavras (contas de antes da semente):** codificam a própria chave privada de assinatura (256 bits).
 *   Trazem a identidade de volta, mas não as chaves de DM.
 *
 * Só a codificação em palavras segue a BIP-39; a derivação das chaves é do Vox (não é carteira BIP-32).
 * Vetores fixos em `tests/recovery-phrase.test.js`.
 */

import { BIP39_PT } from "./data/bip39-pt.js";
import { bigIntTo32Bytes, bytesToBigInt, N, publicPoint, scalarFromBytes } from "./p256.js";

/** Tamanho da semente das contas novas, em bytes. */
export const SEED_BYTES = 16;
/** Palavras de uma frase de semente. */
export const SEED_WORDS = 12;
/** Palavras de uma frase de chave (contas de antes da semente). */
export const KEY_WORDS = 24;

const SALT = "vox-semente-v1";
const INFO_SIGN = "vox-assinatura-p256";
const INFO_DM = "vox-dm-p256";
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const ECDH = { name: "ECDH", namedCurve: "P-256" };

const INDEX = new Map(BIP39_PT.map((w, i) => [w, i]));
const BY_PREFIX = new Map(BIP39_PT.map((w, i) => [w.slice(0, 4), i]));
const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const toBits = (bytes) => [...bytes].map((b) => b.toString(2).padStart(8, "0")).join("");

async function checksumBits(entropy) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", entropy));
  return toBits(hash).slice(0, (entropy.length * 8) / 32);
}

/**
 * Bytes (16 ou 32) para palavras, com o dígito verificador da BIP-39.
 * @param {Uint8Array} entropy
 * @returns {Promise<string[]>}
 */
export async function entropyToWords(entropy) {
  if (!(entropy instanceof Uint8Array) || ![16, 32].includes(entropy.length)) throw new Error("A frase codifica 16 ou 32 bytes.");
  const bits = toBits(entropy) + (await checksumBits(entropy));
  return bits.match(/.{11}/g).map((chunk) => BIP39_PT[parseInt(chunk, 2)]);
}

/**
 * Texto digitado para palavras: minúsculas, sem acento, separadas por qualquer coisa que não seja letra.
 * @param {string} text
 * @returns {string[]}
 */
export function normalizeWords(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** Índice da palavra; aceita só as 4 primeiras letras, que não se repetem na lista. */
function wordIndex(word) {
  if (INDEX.has(word)) return INDEX.get(word);
  return word.length >= 4 ? BY_PREFIX.get(word.slice(0, 4)) : undefined;
}

/**
 * Palavras para bytes. Lança com mensagem para a pessoa se a quantidade, uma palavra ou o verificador não batem.
 * @param {string|string[]} input
 * @returns {Promise<Uint8Array>}
 */
export async function wordsToEntropy(input) {
  const words = Array.isArray(input) ? input.flatMap(normalizeWords) : normalizeWords(input);
  if (![SEED_WORDS, KEY_WORDS].includes(words.length)) throw new Error(`A frase tem ${SEED_WORDS} ou ${KEY_WORDS} palavras; aqui há ${words.length}.`);
  const bad = words.find((w) => wordIndex(w) === undefined);
  if (bad) throw new Error(`"${bad}" não é uma palavra da lista. Confira a grafia.`);
  const bits = words.map((w) => wordIndex(w).toString(2).padStart(11, "0")).join("");
  const size = (words.length * 11 * 32) / 33 / 8;
  const entropy = Uint8Array.from(bits.slice(0, size * 8).match(/.{8}/g), (b) => parseInt(b, 2));
  if (bits.slice(size * 8) !== (await checksumBits(entropy))) throw new Error("Alguma palavra está errada ou fora de ordem.");
  return entropy;
}

async function hkdf(seed, info) {
  const key = await crypto.subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: enc.encode(SALT), info: enc.encode(info) }, key, 384);
  return new Uint8Array(bits);
}

/**
 * Par de chaves JWK da P-256 a partir do escalar, na mesma forma que o WebCrypto exporta.
 * @param {bigint} d
 * @param {"ECDSA"|"ECDH"} kind
 * @returns {Promise<{ publicJwk: object, privateJwk: object }>}
 */
export async function jwkPairFromScalar(d, kind) {
  const { x, y } = publicPoint(d);
  const pub = { kty: "EC", crv: "P-256", x: b64url(bigIntTo32Bytes(x)), y: b64url(bigIntTo32Bytes(y)) };
  const [algo, privUse, pubUse] = kind === "ECDH" ? [ECDH, ["deriveKey"], []] : [ECDSA, ["sign"], ["verify"]];
  const privateKey = await crypto.subtle.importKey("jwk", { ...pub, d: b64url(bigIntTo32Bytes(d)) }, algo, true, privUse);
  const publicKey = await crypto.subtle.importKey("jwk", pub, algo, true, pubUse);
  return { publicJwk: await crypto.subtle.exportKey("jwk", publicKey), privateJwk: await crypto.subtle.exportKey("jwk", privateKey) };
}

/**
 * Chaves da conta que nascem da semente: assinatura (ECDSA) e DM (ECDH).
 * @param {Uint8Array} seed 16 bytes
 * @returns {Promise<{ signing: object, dm: object }>}
 */
export async function identityFromSeed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== SEED_BYTES) throw new Error("A semente tem 16 bytes.");
  const [signBytes, dmBytes] = await Promise.all([hkdf(seed, INFO_SIGN), hkdf(seed, INFO_DM)]);
  const [signing, dm] = await Promise.all([jwkPairFromScalar(scalarFromBytes(signBytes), "ECDSA"), jwkPairFromScalar(scalarFromBytes(dmBytes), "ECDH")]);
  return { signing, dm };
}

/**
 * Semente nova, sorteada no aparelho.
 * @returns {Uint8Array}
 */
export function newSeed() {
  return crypto.getRandomValues(new Uint8Array(SEED_BYTES));
}

/**
 * As 24 palavras de uma chave de assinatura (contas de antes da semente).
 * @param {{ d: string }} privateJwk
 * @returns {Promise<string[]>}
 */
export async function phraseFromPrivateJwk(privateJwk) {
  if (!privateJwk?.d) throw new Error("Sem a chave privada aberta não há frase.");
  return entropyToWords(fromB64url(privateJwk.d));
}

/**
 * Lê uma frase: 12 palavras voltam semente, assinatura e DM; 24 voltam só a assinatura.
 * @param {string|string[]} input
 * @returns {Promise<{ kind: "semente"|"chave", seed: Uint8Array|null, signing: object, dm: object|null }>}
 */
export async function identityFromPhrase(input) {
  const entropy = await wordsToEntropy(input);
  if (entropy.length === SEED_BYTES) return { kind: "semente", seed: entropy, ...(await identityFromSeed(entropy)) };
  const d = bytesToBigInt(entropy);
  if (d < 1n || d >= N) throw new Error("Estas palavras não formam uma chave válida.");
  return { kind: "chave", seed: null, signing: await jwkPairFromScalar(d, "ECDSA"), dm: null };
}
