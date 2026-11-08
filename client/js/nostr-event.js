/**
 * Eventos Nostr (NIP-01) com assinatura Schnorr BIP-340 em secp256k1 — JS puro, sem dependência.
 * Base do teste de fumaça dos relays (REV-19) e da sinalização por Nostr (REV-09).
 * Usa só BigInt + WebCrypto (SHA-256), disponível no navegador e no Node ≥ 20.
 */

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = {
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
};

const mod = (a, m = P) => ((a % m) + m) % m;

function modInv(a, m = P) {
  let [lo, hi, x0, x1] = [mod(a, m), m, 1n, 0n];
  while (lo > 1n) {
    const q = hi / lo;
    [lo, hi] = [hi - q * lo, lo];
    [x0, x1] = [x1 - q * x0, x0];
  }
  return mod(x0, m);
}

function modPow(base, exp, m = P) {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

function pointAdd(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x && mod(a.y + b.y) === 0n) return null;
  const lambda = a.x === b.x
    ? mod(3n * a.x * a.x * modInv(2n * a.y))
    : mod((b.y - a.y) * modInv(b.x - a.x));
  const x = mod(lambda * lambda - a.x - b.x);
  return { x, y: mod(lambda * (a.x - x) - a.y) };
}

function pointMul(point, scalar) {
  let result = null;
  let addend = point;
  let k = scalar;
  while (k > 0n) {
    if (k & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}

function liftX(x) {
  if (x <= 0n || x >= P) return null;
  const c = mod(x * x * x + 7n);
  const y = modPow(c, (P + 1n) / 4n);
  if (mod(y * y) !== c) return null;
  return { x, y: (y & 1n) === 0n ? y : P - y };
}

export function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) throw new Error("hex inválido");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const bytesToInt = (bytes) => BigInt(`0x${bytesToHex(bytes) || "0"}`);
const intToBytes = (n) => hexToBytes(n.toString(16).padStart(64, "0"));

function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

async function taggedHash(tag, ...parts) {
  const tagHash = await sha256(new TextEncoder().encode(tag));
  return sha256(concatBytes(tagHash, tagHash, ...parts));
}

function assertLen(bytes, len, label) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== len) throw new Error(`${label}: esperado ${len} bytes`);
}

/** Chave pública x-only (32 bytes) de uma chave secreta de 32 bytes. */
export function getPublicKey(secretKey) {
  assertLen(secretKey, 32, "chave secreta");
  const d = bytesToInt(secretKey);
  if (d <= 0n || d >= N) throw new Error("chave secreta fora do intervalo");
  return intToBytes(pointMul(G, d).x);
}

/** Assinatura BIP-340 (64 bytes) de uma mensagem de 32 bytes. */
export async function schnorrSign(message, secretKey, auxRand = globalThis.crypto.getRandomValues(new Uint8Array(32))) {
  assertLen(message, 32, "mensagem");
  assertLen(auxRand, 32, "aux");
  const d0 = bytesToInt(secretKey);
  if (d0 <= 0n || d0 >= N) throw new Error("chave secreta fora do intervalo");
  const pub = pointMul(G, d0);
  const d = (pub.y & 1n) === 0n ? d0 : N - d0;
  const t = intToBytes(d ^ bytesToInt(await taggedHash("BIP0340/aux", auxRand)));
  const px = intToBytes(pub.x);
  const k0 = mod(bytesToInt(await taggedHash("BIP0340/nonce", t, px, message)), N);
  if (k0 === 0n) throw new Error("nonce nulo");
  const r = pointMul(G, k0);
  const k = (r.y & 1n) === 0n ? k0 : N - k0;
  const rx = intToBytes(r.x);
  const e = mod(bytesToInt(await taggedHash("BIP0340/challenge", rx, px, message)), N);
  return concatBytes(rx, intToBytes(mod(k + e * d, N)));
}

/** Verificação BIP-340. Retorna false (nunca lança) para entradas inválidas. */
export async function schnorrVerify(signature, message, publicKey) {
  try {
    assertLen(signature, 64, "assinatura");
    assertLen(message, 32, "mensagem");
    assertLen(publicKey, 32, "chave pública");
    const pub = liftX(bytesToInt(publicKey));
    const r = bytesToInt(signature.slice(0, 32));
    const s = bytesToInt(signature.slice(32));
    if (!pub || r >= P || s >= N) return false;
    const e = mod(bytesToInt(await taggedHash("BIP0340/challenge", signature.slice(0, 32), publicKey, message)), N);
    const point = pointAdd(pointMul(G, s), pointMul({ x: pub.x, y: P - pub.y }, e));
    return Boolean(point) && (point.y & 1n) === 0n && point.x === r;
  } catch {
    return false;
  }
}

/**
 * Segredo compartilhado ECDH secp256k1 (coordenada x, 32 bytes) entre a minha chave secreta
 * e a chave pública x-only do outro par. Usado para cifrar a sinalização (REV-09).
 */
export function getSharedSecret(secretKey, publicKeyHex) {
  assertLen(secretKey, 32, "chave secreta");
  const pub = liftX(bytesToInt(hexToBytes(publicKeyHex)));
  if (!pub) throw new Error("chave pública inválida");
  const d = bytesToInt(secretKey);
  if (d <= 0n || d >= N) throw new Error("chave secreta fora do intervalo");
  return intToBytes(pointMul(pub, d).x);
}

/** Chave secreta aleatória válida (32 bytes). */
export function generateSecretKey() {
  for (;;) {
    const sk = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const d = bytesToInt(sk);
    if (d > 0n && d < N) return sk;
  }
}

/** id NIP-01: sha256 do JSON canônico [0, pubkey, created_at, kind, tags, content]. */
export async function computeEventId({ pubkey, created_at, kind, tags = [], content = "" }) {
  const serialized = JSON.stringify([0, pubkey, created_at, kind, tags, content]);
  return bytesToHex(await sha256(new TextEncoder().encode(serialized)));
}

/** Monta e assina um evento NIP-01. */
export async function finalizeEvent({ kind, tags = [], content = "", created_at }, secretKey) {
  const pubkey = bytesToHex(getPublicKey(secretKey));
  const event = { pubkey, created_at: created_at ?? Math.floor(Date.now() / 1000), kind, tags, content };
  event.id = await computeEventId(event);
  event.sig = bytesToHex(await schnorrSign(hexToBytes(event.id), secretKey));
  return event;
}

/** Confere id e assinatura de um evento recebido. */
export async function verifyEvent(event) {
  if (!event || typeof event.id !== "string" || typeof event.sig !== "string") return false;
  try {
    if ((await computeEventId(event)) !== event.id) return false;
    return schnorrVerify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
  } catch {
    return false;
  }
}

/** Faixa efêmera do NIP-01: relays repassam e não guardam. */
export const isEphemeralKind = (kind) => Number.isInteger(kind) && kind >= 20000 && kind < 30000;
