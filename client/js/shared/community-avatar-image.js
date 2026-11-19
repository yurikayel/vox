/**
 * @file Avatar/foto de comunidade: compressão na saída e validação na entrada/exibição.
 * @module shared/community-avatar-image
 */

import { sanitizeMediaUrl } from "./html.js";
import { compressRasterFileToJpegDataUrl, isRasterImageMime } from "./raster-file-to-jpeg.js";

/** Lado maior após compressão (criação/troca). @type {number} */
export const COMMUNITY_AVATAR_MAX_EDGE = 512;
/** Qualidade JPEG na compressão. @type {number} */
export const COMMUNITY_AVATAR_JPEG_QUALITY = 0.56;
/** Teto do payload base64 armazenado/gossip (além de MIME seguro). @type {number} */
export const COMMUNITY_AVATAR_MAX_STORED_BYTES = 400 * 1024;

const COMMUNITY_IMAGE_FIELDS = Object.freeze(["image", "avatar"]);

/**
 * Tamanho estimado do payload binário de um data URL base64.
 * @param {string} dataUrl
 * @returns {number}
 */
export function dataUrlPayloadBytes(dataUrl) {
  const m = /^data:image\/[^;]+;base64,(.*)$/i.exec(String(dataUrl || ""));
  if (!m) return 0;
  const b64 = m[1].replace(/\s/g, "");
  return Math.floor((b64.length * 3) / 4);
}

/**
 * URL segura para foto de comunidade (raster + teto de tamanho).
 * @param {*} raw
 * @returns {string} URL ou vazio.
 */
export function acceptCommunityAvatarDataUrl(raw) {
  const safe = sanitizeMediaUrl(raw);
  if (!safe) return "";
  if (safe.startsWith("data:")) {
    if (dataUrlPayloadBytes(safe) > COMMUNITY_AVATAR_MAX_STORED_BYTES) return "";
  }
  return safe;
}

/**
 * Comprime arquivo escolhido na UI para JPEG aceitável.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function compressCommunityAvatarFile(file) {
  const dataUrl = await compressRasterFileToJpegDataUrl(file, {
    maxEdge: COMMUNITY_AVATAR_MAX_EDGE,
    quality: COMMUNITY_AVATAR_JPEG_QUALITY,
  });
  const accepted = acceptCommunityAvatarDataUrl(dataUrl);
  if (!accepted) {
    throw new Error("Imagem ainda grande demais após compressão. Use uma foto menor.");
  }
  return accepted;
}

/**
 * Valida MIME antes da leitura (recusa SVG e tipos não raster).
 * @param {File|Blob|null} file
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateCommunityAvatarFile(file) {
  if (!file) return { ok: false, message: "Nenhum arquivo selecionado." };
  const mime = String(file.type || "").toLowerCase();
  if (mime.includes("svg")) {
    return { ok: false, message: "SVG não é permitido na foto da comunidade." };
  }
  if (!isRasterImageMime(mime)) {
    return { ok: false, message: "Formato não suportado. Use JPEG, PNG, WebP ou GIF." };
  }
  const size = Number(file.size) || 0;
  if (size <= 0) return { ok: false, message: "Arquivo de imagem vazio ou inválido." };
  return { ok: true };
}

/**
 * Indica se o gossip traz imagem rejeitada (malicioso ou grande demais).
 * @param {object|null} item
 * @returns {boolean}
 */
export function communityGossipHasRejectedImages(item) {
  if (!item || (item.type !== "community" && item.type !== "community_update")) return false;
  for (const field of COMMUNITY_IMAGE_FIELDS) {
    const raw = item[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (!acceptCommunityAvatarDataUrl(raw)) return true;
  }
  return false;
}

/**
 * Remove ou normaliza campos de imagem antes de gravar/repassar.
 * @param {object} item
 * @returns {object}
 */
export function sanitizeCommunityGossipImages(item) {
  if (!item || (item.type !== "community" && item.type !== "community_update")) return item;
  const next = { ...item };
  for (const field of COMMUNITY_IMAGE_FIELDS) {
    if (typeof next[field] !== "string") continue;
    const accepted = acceptCommunityAvatarDataUrl(next[field]);
    if (accepted) next[field] = accepted;
    else delete next[field];
  }
  return next;
}