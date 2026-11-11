/**
 * @file Conferência de objeto assinado pela conta (ECDSA P-256), sem a conta: pequeno de propósito para a
 * página leve do aviso (`aviso.html`) não carregar `local-account.js`. O `local-account.js` reexporta daqui.
 */
import { canonicalString, isKnownSigv } from "./sig-format.js";

export function bytesToB64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64UrlToBytes(b64url) {
  const padded = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function computeRouteId(pubJwk) {
  if (!pubJwk?.x || !pubJwk?.y) return "";
  const raw = new TextEncoder().encode(`P-256:${pubJwk.x}:${pubJwk.y}`);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return "vx_" + bytesToB64Url(hash).slice(0, 20);
}

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
