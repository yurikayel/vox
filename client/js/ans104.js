/**
 * @file ANS-104 data item (assinatura Arweave RSA-PSS) com WebCrypto puro.
 * Permite upload via bundler Turbo — gratuito para itens ≤ 100 KiB — sem SDK nem saldo AR.
 * Spec: https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md
 */

const SIG_TYPE_ARWEAVE = 1;
const SIG_LEN = 512;
const OWNER_LEN = 512;
const enc = new TextEncoder();

export function b64UrlToBytes(b64url) {
  const b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesToB64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function sha(algo, bytes) {
  return new Uint8Array(await crypto.subtle.digest(algo, bytes));
}

/** Arweave deepHash (SHA-384) sobre blobs e listas aninhadas. */
export async function deepHash(data) {
  if (Array.isArray(data)) {
    let acc = await sha("SHA-384", concat([enc.encode("list"), enc.encode(String(data.length))]));
    for (const chunk of data) {
      acc = await sha("SHA-384", concat([acc, await deepHash(chunk)]));
    }
    return acc;
  }
  const tag = await sha("SHA-384", concat([enc.encode("blob"), enc.encode(String(data.byteLength))]));
  return sha("SHA-384", concat([tag, await sha("SHA-384", data)]));
}

function avroLong(n) {
  let z = n >= 0 ? n * 2 : -n * 2 - 1;
  const out = [];
  do {
    let byte = z % 128;
    z = Math.floor(z / 128);
    if (z > 0) byte |= 0x80;
    out.push(byte);
  } while (z > 0);
  return Uint8Array.from(out);
}

function avroString(s) {
  const bytes = enc.encode(s);
  return concat([avroLong(bytes.length), bytes]);
}

/** Tags no formato Avro exigido pelo ANS-104. */
export function serializeTags(tags = []) {
  if (!tags.length) return new Uint8Array(0);
  const parts = [avroLong(tags.length)];
  for (const t of tags) parts.push(avroString(String(t.name)), avroString(String(t.value)));
  parts.push(avroLong(0));
  return concat(parts);
}

function u64le(n) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n), true);
  return out;
}

async function importSigningKey(jwk) {
  const { kty, n, e, d, p, q, dp, dq, qi } = jwk;
  return crypto.subtle.importKey(
    "jwk",
    { kty, n, e, d, p, q, dp, dq, qi, alg: "PS256", ext: true },
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function assembleItem({ signature, owner, anchor, tagBytes, tagCount, data }) {
  const sigType = new Uint8Array(2);
  new DataView(sigType.buffer).setUint16(0, SIG_TYPE_ARWEAVE, true);
  return concat([
    sigType,
    signature,
    owner,
    Uint8Array.of(0),
    Uint8Array.of(1),
    anchor,
    u64le(tagCount),
    u64le(tagBytes.length),
    tagBytes,
    data,
  ]);
}

/**
 * Cria e assina um data item ANS-104.
 * @returns {{ id: string, bytes: Uint8Array }}
 */
export async function createSignedDataItem(data, tags, jwk) {
  const payload = typeof data === "string" ? enc.encode(data) : data;
  const owner = b64UrlToBytes(jwk.n);
  if (owner.length !== OWNER_LEN) throw new Error("Carteira precisa ser RSA 4096 (Arweave).");
  const anchor = crypto.getRandomValues(new Uint8Array(32));
  const tagBytes = serializeTags(tags);
  const message = await deepHash([
    enc.encode("dataitem"),
    enc.encode("1"),
    enc.encode(String(SIG_TYPE_ARWEAVE)),
    owner,
    new Uint8Array(0),
    anchor,
    tagBytes,
    payload,
  ]);
  const key = await importSigningKey(jwk);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, key, message));
  if (signature.length !== SIG_LEN) throw new Error("Assinatura com tamanho inesperado.");
  const bytes = assembleItem({ signature, owner, anchor, tagBytes, tagCount: tags.length, data: payload });
  return { id: bytesToB64Url(await sha("SHA-256", signature)), bytes };
}

/**
 * Retorna o endereço Arweave (43 chars base64url) derivado do módulo público n da JWK.
 * @param {object} jwk
 * @returns {Promise<string>}
 */
export async function jwkToAddress(jwk) {
  if (!jwk?.n) return "";
  const owner = b64UrlToBytes(jwk.n);
  const hash = await sha("SHA-256", owner);
  return bytesToB64Url(hash);
}
