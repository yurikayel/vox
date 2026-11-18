/**
 * @file Criptografia E2E de DMs (ECDH P-256 efêmero + AES-GCM-256 via WebCrypto).
 *
 * Par de chaves de DM separado da chave JWK RSA de autoria Arweave.
 * @module crypto-dm
 */

import { openSealed, sealJson } from "./identity/keys.js";
import { dmPrivateKey } from "./identity/keys.js";

const DM_KEYPAIR_STORAGE = "vox-dm-keypair";
const ECDH_ALGO = { name: "ECDH", namedCurve: "P-256" };

function bytesToB64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(b64url) {
  const padded = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function parseJwkInput(jwkOrStr) {
  if (typeof jwkOrStr === "string") {
    return JSON.parse(jwkOrStr);
  }
  return jwkOrStr;
}

/**
 * Gera par ECDH P-256 novo, com chaves em JWK (só em memória).
 * @returns {Promise<{ publicJwk: JsonWebKey, privateJwk: JsonWebKey }>}
 */
export async function generateDmKeypair() {
  const pair = await crypto.subtle.generateKey(ECDH_ALGO, true, ["deriveKey"]);
  return {
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
}

/**
 * Garante par de DM no armazenamento (privada cifrada PM-93); não sobrescreve par existente.
 * @returns {Promise<{ publicJwk: JsonWebKey, privateJwk: string|JsonWebKey }>}
 */
export async function ensureDmKeys() {
  try {
    const raw = localStorage.getItem(DM_KEYPAIR_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.publicJwk && parsed?.privateJwk) return parsed;
    }
  } catch {}
  const fresh = await generateDmKeypair();
  const stored = { publicJwk: fresh.publicJwk, privateJwk: await sealJson(fresh.privateJwk) };
  localStorage.setItem(DM_KEYPAIR_STORAGE, JSON.stringify(stored));
  return stored;
}

/**
 * JWK pública ECDH do par de DM deste aparelho.
 * @returns {Promise<JsonWebKey>}
 */
export async function getPublicJwk() {
  const { publicJwk } = await ensureDmKeys();
  return publicJwk;
}

/**
 * Par de DM com chave privada aberta (para backup). Pode lançar `KeyLockedError` (PM-93).
 * @returns {Promise<{ publicJwk: JsonWebKey, privateJwk: JsonWebKey }>}
 */
export async function getDmKeypair() {
  const stored = await ensureDmKeys();
  return { publicJwk: stored.publicJwk, privateJwk: await openSealed(stored.privateJwk) };
}

/**
 * Par de DM como guardado (privada ainda cifrada).
 * @returns {Promise<{ publicJwk: JsonWebKey, privateJwk: string|JsonWebKey }>}
 */
export async function getDmKeypairAtRest() {
  return ensureDmKeys();
}

/**
 * Substitui o par de DM local (a privada é re-cifrada antes de guardar).
 * @param {{ publicJwk?: JsonWebKey, privateJwk?: JsonWebKey }} keypair Par em JWK.
 * @returns {Promise<boolean>} `false` se faltar chave.
 */
export async function setDmKeypair(keypair) {
  if (!keypair?.publicJwk || !keypair?.privateJwk) return false;
  const stored = { publicJwk: keypair.publicJwk, privateJwk: await sealJson(keypair.privateJwk) };
  localStorage.setItem(DM_KEYPAIR_STORAGE, JSON.stringify(stored));
  return true;
}

async function deriveAesKey(privateKey, publicKey, usages) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

function buildAad(from, to) {
  return new TextEncoder().encode(`v1|${from || ""}|${to || ""}`);
}

const deleteAad = (msgId) => new TextEncoder().encode(`vox-dm-delete-v1|${msgId}`);
const bytesToHex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * PM-94: chave de apagar do envelope no relay. Vai cifrada com a mesma chave da mensagem (IV próprio), então só
 * quem abre a mensagem consegue apagá-la. O relay recebe só o SHA-256 (`del.hash`).
 */
async function sealDeleteToken(aesKey, msgId) {
  const token = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: deleteAad(msgId) }, aesKey, token);
  const hash = bytesToHex(await crypto.subtle.digest("SHA-256", token));
  return { iv: bytesToB64Url(iv), ct: bytesToB64Url(ct), hash };
}

function sanitizeEcPublicJwk(toPubInput) {
  const toPubJwk = parseJwkInput(toPubInput);
  if (!toPubJwk || toPubJwk.kty !== "EC") {
    throw new Error("Chave pública Dm-Pub inválida");
  }
  return {
    kty: toPubJwk.kty,
    crv: toPubJwk.crv || "P-256",
    x: toPubJwk.x,
    y: toPubJwk.y,
    ext: true,
  };
}

/**
 * Cifra texto para o destinatário (envelope DM v1 com token de apagar PM-94).
 * @param {JsonWebKey|string} toPubInput JWK pública ECDH do destinatário.
 * @param {string} plaintext Conteúdo em texto claro.
 * @param {object} [options={}]
 * @param {string} [options.from=""] Identificador da origem (AAD).
 * @param {string} [options.to=""] Identificador do destino (AAD).
 * @returns {Promise<object>} Envelope com `ephPub`, `iv`, `ct`, `del`, etc.
 * @throws {Error} Se a chave pública for inválida.
 */
export async function seal(toPubInput, plaintext, { from = "", to = "" } = {}) {
  const cleanJwk = sanitizeEcPublicJwk(toPubInput);
  const recipientPubKey = await crypto.subtle.importKey("jwk", cleanJwk, ECDH_ALGO, false, []);
  const ephPair = await crypto.subtle.generateKey(ECDH_ALGO, true, ["deriveKey"]);
  const ephPub = await crypto.subtle.exportKey("jwk", ephPair.publicKey);
  const aesKey = await deriveAesKey(ephPair.privateKey, recipientPubKey, ["encrypt"]);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(String(plaintext));
  const ctBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: buildAad(from, to) },
    aesKey,
    encoded
  );

  const msgId = "dm_" + bytesToB64Url(crypto.getRandomValues(new Uint8Array(9)));
  return {
    v: 1,
    id: msgId,
    from,
    to,
    ts: Date.now(),
    ephPub,
    iv: bytesToB64Url(iv),
    ct: bytesToB64Url(ctBuffer),
    del: await sealDeleteToken(aesKey, msgId),
  };
}

async function recipientAesKey(envelope, privateJwkOverride) {
  const privKey = await dmPrivateKey(privateJwkOverride || (await ensureDmKeys()).privateJwk);
  const ephPubKey = await crypto.subtle.importKey("jwk", envelope.ephPub, ECDH_ALGO, false, []);
  return deriveAesKey(privKey, ephPubKey, ["decrypt"]);
}

/**
 * Abre envelope DM v1 e devolve o texto plano.
 * @param {object} envelope Envelope produzido por {@link seal}.
 * @param {JsonWebKey|null} [privateJwkOverride=null] Chave privada alternativa (fora do armazenamento).
 * @returns {Promise<string>}
 * @throws {Error} Envelope inválido ou falha de descriptografia.
 */
export async function open(envelope, privateJwkOverride = null) {
  if (!envelope || envelope.v !== 1 || !envelope.ephPub || !envelope.iv || !envelope.ct) {
    throw new Error("Envelope DM inválido");
  }

  const aesKey = await recipientAesKey(envelope, privateJwkOverride);

  const iv = b64UrlToBytes(envelope.iv);
  const ct = b64UrlToBytes(envelope.ct);
  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: buildAad(envelope.from, envelope.to) },
    aesKey,
    ct
  );

  return new TextDecoder().decode(ptBuffer);
}

/**
 * Extrai token de apagar (hex) do envelope PM-94, ou `null` se ausente.
 * @param {object} envelope Envelope DM.
 * @param {JsonWebKey|null} [privateJwkOverride=null] Chave privada alternativa.
 * @returns {Promise<string|null>}
 */
export async function openDeleteToken(envelope, privateJwkOverride = null) {
  if (!envelope?.del?.iv || !envelope.del.ct || !envelope.ephPub) return null;
  const aesKey = await recipientAesKey(envelope, privateJwkOverride);
  const token = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64UrlToBytes(envelope.del.iv), additionalData: deleteAad(envelope.id) },
    aesKey,
    b64UrlToBytes(envelope.del.ct)
  );
  return bytesToHex(token);
}
