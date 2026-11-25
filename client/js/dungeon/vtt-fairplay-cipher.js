/**
 * @file Cifra das partes de backup do Fairplay (ADR-040 §2.3): chave ECDH P-256 efêmera da sessão,
 * HKDF-SHA-256 por rolagem e por par, AES-256-GCM com a rolagem e os dois pares como dados associados.
 *
 * A chave privada nasce não exportável e vive só na memória da sessão. Não tem relação com a chave
 * de identidade nem com a de DM (identidade congelada; RPG isolado, ADR-033).
 * @module dungeon/vtt-fairplay-cipher
 */

/** Nome do algoritmo gravado em cada envelope e em `FAIRPLAY_KEY` (ADR-036: o formato diz o algoritmo). */
export const FAIRPLAY_SHARE_ALG = "ecdh-p256+hkdf-sha256+aes-256-gcm";

const CURVE = { name: "ECDH", namedCurve: "P-256" };
const HKDF_SALT = new TextEncoder().encode("vox-fairplay-share-v1");

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  return Uint8Array.from(String(hex).match(/../g) || [], (h) => Number.parseInt(h, 16));
}

/**
 * Cria a chave ECDH desta sessão de jogo. Só a parte pública sai do aparelho (em `FAIRPLAY_KEY`).
 * @returns {Promise<{privateKey: CryptoKey, publicKeyJwk: JsonWebKey}>} Par da sessão.
 */
export async function createFairplaySessionKey() {
  const pair = await crypto.subtle.generateKey(CURVE, false, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicKeyJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}

function bindingLabel(rollId, fromPeer, toPeer) {
  return new TextEncoder().encode(`${rollId}|${fromPeer}|${toPeer}`);
}

async function deriveShareKey(privateKey, peerJwk, label) {
  const peerKey = await crypto.subtle.importKey("jwk", { ...peerJwk, ext: true }, CURVE, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, privateKey, 256);
  const ikm = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: label },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function encodeShare(share) {
  const y = typeof share.y === "string" ? share.y : toHex(share.y);
  return new TextEncoder().encode(JSON.stringify({ splitId: share.splitId, x: share.x, y }));
}

/**
 * SHA-256 (hex) da parte codificada: é o que quem divide publica junto de cada envelope, para que a
 * parte liberada depois na recuperação possa ser conferida contra o que foi prometido.
 * @param {{splitId: string, x: number, y: Uint8Array|string}} share Parte Shamir em claro (`y` em bytes ou hex).
 * @returns {Promise<string>} Hash em hex minúsculo (64 caracteres).
 */
export async function fairplayShareHash(share) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeShare(share))));
}

const P256_P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Coordenada canônica: 32 bytes em base64url sem preenchimento, e só a escrita que o próprio `toBase64Url` produziria. */
function coordinate(b64u) {
  if (typeof b64u !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(b64u)) return null;
  const bytes = Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) => c.charCodeAt(0));
  return toBase64Url(bytes) === b64u ? BigInt(`0x${toHex(bytes)}`) : null;
}

/**
 * Confere, de forma síncrona, que (x, y) de um JWK P-256 é um ponto da curva (y² = x³ − 3x + b mod p).
 * O reducer não pode importar a chave (WebCrypto é assíncrono); isto fecha o buraco só da forma.
 * @param {{x?: string, y?: string}} jwk Chave pública em JWK.
 * @returns {boolean} `true` quando as coordenadas têm 32 bytes, são menores que p e estão na curva.
 */
export function isFairplayPublicKeyOnCurve(jwk) {
  const x = coordinate(jwk?.x);
  const y = coordinate(jwk?.y);
  if (x === null || y === null || x >= P256_P || y >= P256_P) return false;
  return (y * y) % P256_P === (((x * x * x - 3n * x + P256_B) % P256_P) + P256_P) % P256_P;
}

function decodeShare(bytes) {
  const raw = JSON.parse(new TextDecoder().decode(bytes));
  return { splitId: String(raw.splitId), x: Number(raw.x), y: fromHex(raw.y) };
}

/**
 * Cifra uma parte Shamir para um único destinatário da mesa.
 * @param {{share: object, rollId: string, fromPeer: string, toPeer: string, privateKey: CryptoKey, recipientJwk: JsonWebKey}} opts Parte, rolagem, pares e chaves.
 * @returns {Promise<{alg: string, iv: string, ct: string}>} Envelope que pode passar pelo Mestre-hub.
 */
export async function sealFairplayShare(opts) {
  const label = bindingLabel(opts.rollId, opts.fromPeer, opts.toPeer);
  const key = await deriveShareKey(opts.privateKey, opts.recipientJwk, label);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: label }, key, encodeShare(opts.share));
  return { alg: FAIRPLAY_SHARE_ALG, iv: toHex(iv), ct: toHex(new Uint8Array(ct)) };
}

/**
 * Abre um envelope endereçado a este aparelho. Falha se a rolagem, os pares ou o conteúdo não baterem.
 * @param {{envelope: {alg: string, iv: string, ct: string}, rollId: string, fromPeer: string, toPeer: string, privateKey: CryptoKey, senderJwk: JsonWebKey}} opts Envelope, rolagem, pares e chaves.
 * @returns {Promise<{splitId: string, x: number, y: Uint8Array}>} Parte Shamir em claro.
 */
export async function openFairplayShare(opts) {
  if (opts.envelope?.alg !== FAIRPLAY_SHARE_ALG) throw new Error("Envelope de parte com algoritmo desconhecido.");
  const label = bindingLabel(opts.rollId, opts.fromPeer, opts.toPeer);
  const key = await deriveShareKey(opts.privateKey, opts.senderJwk, label);
  const iv = fromHex(opts.envelope.iv);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: label }, key, fromHex(opts.envelope.ct));
  return decodeShare(new Uint8Array(plain));
}

/**
 * Confere a forma de um envelope sem abrir (o reducer não tem a chave de ninguém).
 * @param {unknown} env Candidato a envelope.
 * @returns {boolean} `true` quando tem algoritmo conhecido, IV de 12 bytes e texto cifrado em hex de 17 a 512 bytes.
 */
export function isFairplayShareEnvelope(env) {
  return Boolean(env && env.alg === FAIRPLAY_SHARE_ALG && /^[0-9a-f]{24}$/.test(String(env.iv)) && /^(?:[0-9a-f]{2}){17,512}$/.test(String(env.ct)));
}
