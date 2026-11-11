/**
 * @file Termo de convivência da comunidade (lote 3): a moderação publica o texto assinado e quem entra
 * assina o hash do termo junto com a entrada (`membership.termoHash`), no molde do pacto 18+.
 * Lógica pura, sem DOM. Spec: docs/specs/aviso-assinado-v0.md ("Termo de convivência e mediação").
 */

import { isModerator } from "./moderation.js";

export const TERMO_TYPE = "community-termo";
export const TERMO_MAX = 2000;
export const TERMO_MIN = 20;

const cleanText = (text) => String(text ?? "").replace(/\r\n?/g, "\n").trim();

/** Problema do texto do termo, ou "" se válido. */
export function validateTermoText(text) {
  const t = cleanText(text);
  if (t.length < TERMO_MIN) return "curto";
  return t.length > TERMO_MAX ? "longo" : "";
}

/** Corpo do termo que a moderação assina e publica. */
export function buildTermo(communityId, text, now = Date.now()) {
  if (!communityId) throw new Error("Termo sem comunidade.");
  if (validateTermoText(text)) throw new Error(`O termo precisa ter de ${TERMO_MIN} a ${TERMO_MAX} caracteres.`);
  return { type: TERMO_TYPE, communityId, termoText: cleanText(text), ts: now };
}

function isTermoByModeration(t, communityId, meta) {
  if (t?.type !== TERMO_TYPE || t.communityId !== communityId || !t.termoText) return false;
  return isModerator(String(t.author || t.owner || ""), meta?.owner, meta?.moderators);
}

/** Termo que vale: o mais recente publicado por dono ou moderação da comunidade. */
export function latestTermo(items = [], communityId = "", meta = {}) {
  let best = null;
  for (const t of items) {
    if (!isTermoByModeration(t, communityId, meta)) continue;
    if (!best || Number(t.ts || 0) >= Number(best.ts || 0)) best = t;
  }
  return best;
}

/** SHA-256 do texto do termo, em hex: é o que a entrada assina. */
export async function termoHash(termo) {
  const bytes = new TextEncoder().encode(cleanText(termo?.termoText));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Campos extras da entrada: o hash do termo vigente, se houver. */
export async function membershipTermoFields(termo) {
  return termo ? { termoHash: await termoHash(termo) } : {};
}

/** Situação de quem vê: sem termo, assinou o atual, assinou um antigo (o termo mudou) ou não assinou. */
export async function termoStatus(termo, membership) {
  if (!termo) return "sem-termo";
  if (!membership?.termoHash) return "nao-assinou";
  return membership.termoHash === (await termoHash(termo)) ? "assinou" : "mudou";
}
