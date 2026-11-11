/**
 * @file Aviso assinado v0 — códigos e link de conferência, sem dependências: a página leve (`aviso.html`)
 * importa só isto. O `aviso.js` reexporta. Spec: docs/specs/aviso-assinado-v0.md.
 */

export const AVISO_LINK_MAX = 2000;
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const DAY_MS = 24 * 60 * 60 * 1000;

export const isAvisoTopic = (post) => post?.type === "topic" && Boolean(post.avisoKind);

/** Vencimento: `expiresAt`, senão encontro + 1 dia, senão publicação + 7 dias. */
export function avisoExpiresAt(post) {
  if (Number(post?.expiresAt) > 0) return Number(post.expiresAt);
  if (Number(post?.eventAt) > 0) return Number(post.eventAt) + DAY_MS;
  return Number(post?.ts || 0) + 7 * DAY_MS;
}

function base32(bytes, length) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

async function sha256(textValue) {
  const data = new TextEncoder().encode(String(textValue));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

/** Código do aviso: 4 caracteres do SHA-256 da assinatura. */
export async function avisoCode(signedAviso) {
  if (!signedAviso?.sig) return "";
  return base32(await sha256(signedAviso.sig), 4);
}

/** Código de conferência de quem assina: 6 caracteres do SHA-256 do routeId, em dois grupos. */
export async function personCode(routeId) {
  if (!routeId) return "";
  const code = base32(await sha256(routeId), 6);
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function toBase64Url(textValue) {
  const bytes = new TextEncoder().encode(textValue);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Fragmento do link de conferência (`v=1&a=…`). Lança acima do limite. */
export function encodeAvisoFragment(signedAviso) {
  const encoded = toBase64Url(JSON.stringify(signedAviso));
  if (encoded.length > AVISO_LINK_MAX) throw new Error("Aviso grande demais para o link de conferência.");
  return `v=1&a=${encoded}`;
}

/** Lê o fragmento; devolve o aviso assinado ou `null` (sem verificar a assinatura). */
export function decodeAvisoFragment(fragment = "") {
  const params = new URLSearchParams(String(fragment).replace(/^#/, ""));
  const encoded = params.get("a") || "";
  if (params.get("v") !== "1" || !encoded || encoded.length > AVISO_LINK_MAX) return null;
  try {
    const aviso = JSON.parse(fromBase64Url(encoded));
    return isAvisoTopic(aviso) ? aviso : null;
  } catch {
    return null;
  }
}
