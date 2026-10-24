/**
 * Criptografia E2E para Mensagens Diretas Efêmeras (Fase 4)
 * ECDH P-256 (chave efêmera por mensagem) + AES-GCM-256 via WebCrypto API.
 * Separado da chave JWK RSA Arweave de autoria pública.
 */

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

export async function ensureDmKeys() {
  try {
    const raw = localStorage.getItem(DM_KEYPAIR_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.publicJwk && parsed?.privateJwk) return parsed;
    }
  } catch {}

  const pair = await crypto.subtle.generateKey(ECDH_ALGO, true, ["deriveKey"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const stored = { publicJwk, privateJwk };
  localStorage.setItem(DM_KEYPAIR_STORAGE, JSON.stringify(stored));
  return stored;
}

export async function getPublicJwk() {
  const { publicJwk } = await ensureDmKeys();
  return publicJwk;
}

export async function getDmKeypair() {
  return await ensureDmKeys();
}

export function setDmKeypair(keypair) {
  if (!keypair?.publicJwk || !keypair?.privateJwk) return false;
  localStorage.setItem(DM_KEYPAIR_STORAGE, JSON.stringify(keypair));
  return true;
}

async function deriveAesKey(privateKey, publicKey, usage) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

function buildAad(from, to) {
  return new TextEncoder().encode(`v1|${from || ""}|${to || ""}`);
}

export async function seal(toPubInput, plaintext, { from = "", to = "" } = {}) {
  const toPubJwk = parseJwkInput(toPubInput);
  if (!toPubJwk || toPubJwk.kty !== "EC") {
    throw new Error("Chave pública Dm-Pub inválida");
  }

  const recipientPubKey = await crypto.subtle.importKey("jwk", toPubJwk, ECDH_ALGO, false, []);
  const ephPair = await crypto.subtle.generateKey(ECDH_ALGO, true, ["deriveKey"]);
  const ephPub = await crypto.subtle.exportKey("jwk", ephPair.publicKey);
  const aesKey = await deriveAesKey(ephPair.privateKey, recipientPubKey, "encrypt");

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
  };
}

export async function open(envelope, privateJwkOverride = null) {
  if (!envelope || envelope.v !== 1 || !envelope.ephPub || !envelope.iv || !envelope.ct) {
    throw new Error("Envelope DM inválido");
  }

  const privJwk = privateJwkOverride || (await ensureDmKeys()).privateJwk;
  const privKey = await crypto.subtle.importKey("jwk", privJwk, ECDH_ALGO, false, ["deriveKey"]);
  const ephPubKey = await crypto.subtle.importKey("jwk", envelope.ephPub, ECDH_ALGO, false, []);
  const aesKey = await deriveAesKey(privKey, ephPubKey, "decrypt");

  const iv = b64UrlToBytes(envelope.iv);
  const ct = b64UrlToBytes(envelope.ct);
  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: buildAad(envelope.from, envelope.to) },
    aesKey,
    ct
  );

  return new TextDecoder().decode(ptBuffer);
}
