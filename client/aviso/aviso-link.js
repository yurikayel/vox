/**
 * @file Aviso assinado v0 (lote C) — códigos curtos e link de conferência, sem dependências.
 *
 * A página leve (`aviso.html`) importa só isto e `signed-verify.js`; o `aviso.js` reexporta para o app.
 * O link leva o aviso assinado inteiro no fragmento (`#v=1&a=…`), que não vai ao servidor.
 *
 * @module aviso/aviso-link
 * @see docs/specs/aviso-assinado-v0.md
 * @see client/aviso/aviso-page.js
 */

/**
 * Tamanho máximo do aviso codificado no link, em caracteres (cabe em uma mensagem do WhatsApp).
 *
 * @type {number}
 */
export const AVISO_LINK_MAX = 2000;
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Diz se o objeto é um tópico-aviso (tem `avisoKind`). Não confere assinatura nem selo.
 *
 * @param {object} post Objeto qualquer.
 * @returns {boolean}
 */
export const isAvisoTopic = (post) => post?.type === "topic" && Boolean(post.avisoKind);

/**
 * Vencimento do aviso: `expiresAt`; senão, o encontro mais 1 dia; senão, a publicação mais 7 dias.
 *
 * @param {{expiresAt?: number, eventAt?: number, ts?: number}} post Aviso.
 * @returns {number} Instante do vencimento, em ms.
 */
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

/**
 * Código curto do aviso: 4 caracteres base32 (Crockford) do SHA-256 da assinatura.
 *
 * Serve para a resposta no WhatsApp apontar o aviso certo; sozinho, não prova nada.
 *
 * @param {{sig: string}} signedAviso Aviso assinado.
 * @returns {Promise<string>} Código, ou `""` sem assinatura.
 */
export async function avisoCode(signedAviso) {
  if (!signedAviso?.sig) return "";
  return base32(await sha256(signedAviso.sig), 4);
}

/**
 * Código de conferência de quem assina: 6 caracteres base32 do SHA-256 da rota, em dois grupos.
 *
 * É o que a pessoa confere uma vez com a coordenação, de viva voz.
 *
 * @param {string} routeId Rota de quem assina.
 * @returns {Promise<string>} Código como `"7KQ-2MX"`, ou `""` sem rota.
 */
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

/**
 * Monta o fragmento do link de conferência (`v=1&a=<base64url do JSON>`).
 *
 * @param {object} signedAviso Aviso assinado.
 * @returns {string} Fragmento sem `#`.
 * @throws {Error} Se o aviso codificado passa de {@link AVISO_LINK_MAX}.
 */
export function encodeAvisoFragment(signedAviso) {
  const encoded = toBase64Url(JSON.stringify(signedAviso));
  if (encoded.length > AVISO_LINK_MAX) throw new Error("Aviso grande demais para o link de conferência.");
  return `v=1&a=${encoded}`;
}

/**
 * Lê o fragmento do link de conferência. Não confere a assinatura.
 *
 * @param {string} [fragment=""] Fragmento, com ou sem `#`.
 * @returns {object|null} O aviso, ou `null` se a versão, o tamanho ou o conteúdo não servem.
 */
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
