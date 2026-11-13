/**
 * @file Termo de convivência da comunidade (civic lote 3).
 *
 * A moderação publica o texto assinado; quem entra assina o hash do termo junto com a entrada
 * (`membership.termoHash`), no molde do pacto 18+. Quando o termo muda, o hash antigo deixa de bater e a
 * pessoa vê que pode assinar de novo — ninguém é expulso por isso.
 *
 * Lógica pura, sem DOM.
 *
 * @module community-termo
 * @see docs/specs/aviso-assinado-v0.md (seção "Termo de convivência e mediação")
 * @see client/js/app/community-termo-flow.js (tela)
 */

import { isModerator } from "./moderation.js";

/**
 * Tipo do corpo assinado do termo.
 *
 * @type {string}
 */
export const TERMO_TYPE = "community-termo";

/**
 * Tamanho máximo do texto do termo, em caracteres.
 *
 * @type {number}
 */
export const TERMO_MAX = 2000;

/**
 * Tamanho mínimo do texto do termo, em caracteres.
 *
 * @type {number}
 */
export const TERMO_MIN = 20;

const cleanText = (text) => String(text ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * Valida o texto do termo (quebras de linha normalizadas e sem espaços nas pontas).
 *
 * @param {string} text Texto digitado pela moderação.
 * @returns {""|"curto"|"longo"} `""` quando válido.
 */
export function validateTermoText(text) {
  const t = cleanText(text);
  if (t.length < TERMO_MIN) return "curto";
  return t.length > TERMO_MAX ? "longo" : "";
}

/**
 * Monta o corpo do termo que a moderação assina e publica.
 *
 * @param {string} communityId Comunidade do termo.
 * @param {string} text Texto do termo ({@link TERMO_MIN}–{@link TERMO_MAX} caracteres).
 * @param {number} [now=Date.now()] Instante da publicação, em ms.
 * @returns {{type: string, communityId: string, termoText: string, ts: number}} Corpo pronto para `signPayload`.
 * @throws {Error} Se falta a comunidade ou o texto tem tamanho fora do limite.
 */
export function buildTermo(communityId, text, now = Date.now()) {
  if (!communityId) throw new Error("Termo sem comunidade.");
  if (validateTermoText(text)) throw new Error(`O termo precisa ter de ${TERMO_MIN} a ${TERMO_MAX} caracteres.`);
  return { type: TERMO_TYPE, communityId, termoText: cleanText(text), ts: now };
}

function isTermoByModeration(t, communityId, meta) {
  if (t?.type !== TERMO_TYPE || t.communityId !== communityId || !t.termoText) return false;
  return isModerator(String(t.author || t.owner || ""), meta?.owner, meta?.moderators);
}

/**
 * Escolhe o termo que vale: o mais recente publicado por dono ou moderação da comunidade.
 *
 * @param {object[]} [items=[]] Termos já verificados.
 * @param {string} [communityId=""] Comunidade.
 * @param {object} [meta={}] Metadados da comunidade (dono e moderação).
 * @returns {object|null} O termo vigente, ou `null`.
 */
export function latestTermo(items = [], communityId = "", meta = {}) {
  let best = null;
  for (const t of items) {
    if (!isTermoByModeration(t, communityId, meta)) continue;
    if (!best || Number(t.ts || 0) >= Number(best.ts || 0)) best = t;
  }
  return best;
}

/**
 * Calcula o SHA-256 do texto do termo; é o que a entrada na comunidade assina.
 *
 * @param {{termoText: string}|null} termo Termo vigente.
 * @returns {Promise<string>} Hash em hexadecimal minúsculo (64 caracteres).
 */
export async function termoHash(termo) {
  const bytes = new TextEncoder().encode(cleanText(termo?.termoText));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Campos extras da entrada na comunidade: o hash do termo vigente, se houver.
 *
 * @param {object|null} termo Termo vigente.
 * @returns {Promise<{termoHash?: string}>} Objeto vazio quando não há termo.
 */
export async function membershipTermoFields(termo) {
  return termo ? { termoHash: await termoHash(termo) } : {};
}

/**
 * Situação de quem vê o termo.
 *
 * @param {object|null} termo Termo vigente.
 * @param {{termoHash?: string}|null} membership Entrada mais recente da pessoa, ou `null` se não é membro.
 * @returns {Promise<"sem-termo"|"nao-assinou"|"assinou"|"mudou">} `mudou` quando a pessoa assinou uma versão anterior.
 */
export async function termoStatus(termo, membership) {
  if (!termo) return "sem-termo";
  if (!membership?.termoHash) return "nao-assinou";
  return membership.termoHash === (await termoHash(termo)) ? "assinou" : "mudou";
}
