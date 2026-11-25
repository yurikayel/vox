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
  return new TextEncoder().encode(JSON.stringify({ splitId: share.splitId, x: share.x, y: toHex(share.y) }));
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
 * @returns {boolean} `true` quando tem algoritmo conhecido, IV de 12 bytes e texto cifrado em hex.
 */
export function isFairplayShareEnvelope(env) {
  return Boolean(env && env.alg === FAIRPLAY_SHARE_ALG && /^[0-9a-f]{24}$/.test(String(env.iv)) && /^(?:[0-9a-f]{2}){17,}$/.test(String(env.ct)));
}
