/**
 * @file Conferência de objeto assinado pela conta (ECDSA P-256), sem precisar da conta.
 *
 * Pequeno de propósito: a página leve do aviso (`aviso.html`) confere assinaturas sem carregar
 * `local-account.js`, que reexporta daqui. O formato canônico do que é assinado (v1 e v2) fica em
 * `sig-format.js`.
 *
 * @module signed-verify
 * @see client/js/sig-format.js
 * @see docs/IDENTITY.md
 */
import { canonicalString, isKnownSigv } from "./sig-format.js";

/**
 * Codifica bytes em base64url sem preenchimento (`=`).
 *
 * @param {ArrayBuffer|Uint8Array|number[]} bytes Bytes a codificar.
 * @returns {string} Texto base64url.
 */
export function bytesToB64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decodifica base64url (com ou sem preenchimento) em bytes.
 *
 * @param {string} b64url Texto base64url.
 * @returns {Uint8Array} Bytes decodificados.
 * @throws {DOMException} Se o texto não é base64 válido (`atob`).
 */
export function b64UrlToBytes(b64url) {
  const padded = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Deriva a rota (`vx_…`) de uma chave pública: SHA-256 de `P-256:<x>:<y>`, em base64url, 20 caracteres.
 *
 * @param {{x: string, y: string}} pubJwk Chave pública em JWK.
 * @returns {Promise<string>} Rota, ou `""` se a chave não tem `x` e `y`.
 */
export async function computeRouteId(pubJwk) {
  if (!pubJwk?.x || !pubJwk?.y) return "";
  const raw = new TextEncoder().encode(`P-256:${pubJwk.x}:${pubJwk.y}`);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return "vx_" + bytesToB64Url(hash).slice(0, 20);
}

/**
 * Confere um objeto assinado: a rota do autor tem de vir da chave anexada e a assinatura ECDSA P-256
 * sobre a forma canônica tem de bater.
 *
 * Versões de assinatura desconhecidas são recusadas (`isKnownSigv`). Nunca lança.
 *
 * @param {{sig: string, pubKey: object, author: string}} signed Objeto assinado.
 * @returns {Promise<boolean>} `true` só quando tudo confere.
 */
export async function verifyPayload(signed) {
  if (!signed?.sig || !signed?.pubKey || !signed?.author || !isKnownSigv(signed)) return false;
  try {
    // 1. Valida que routeId é derivado da chave pública anexada
    const expectedRouteId = await computeRouteId(signed.pubKey);
    if (signed.author !== expectedRouteId) return false;

    // 2. Valida assinatura criptográfica
    const imported = await crypto.subtle.importKey(
      "jwk",
      signed.pubKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const verifyData = new TextEncoder().encode(canonicalString(signed));
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      imported,
      b64UrlToBytes(signed.sig),
      verifyData
    );
  } catch {
    return false;
  }
}
