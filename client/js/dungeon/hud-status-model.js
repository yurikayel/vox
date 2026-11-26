/**
 * @file Modelo do HUD de jogo (spec hud-jogo-v0): retrato, PV, CA, condições e grupo. Lógica pura, sem DOM.
 * Dados de outras pessoas vêm só do token projetado (lista de permissão da projeção do jogador).
 * @module dungeon/hud-status-model
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { getSystemPack } from "./system-pack.js";
import { normalizeTokenConditions } from "./vtt-tactics-schema.js";

/** Máximo de condições visíveis no HUD antes do "+N" (D8). */
export const HUD_MAX_CONDITIONS = 4;
const MISSING = "—";

function ownHp(sheet) {
  const max = Number(sheet.pools_base?.hp_max);
  if (!Number.isFinite(max) || max <= 0) return null;
  const cur = Number(projectCharacterPools(sheet.pools_base, sheet.delta_ledger || []).pools?.hp_current);
  return Number.isFinite(cur) ? { cur, max } : null;
}

function sheetName(sheet) {
  return String(sheet.name || sheet.attributes_lww?.name || "Sem nome").slice(0, 60);
}

/**
 * Condições visíveis: as do token e as marcadas na ficha própria, sem repetição; excedente vira contagem.
 * @param {object|undefined} token Token da cena.
 * @param {object|null} sheet Ficha própria (ou null para outras pessoas).
 * @returns {{shown: Array<{id: string, label: string}>, more: number}} Chips e quantos ficaram de fora.
 */
export function buildHudConditions(token, sheet) {
  const labels = new Map((getSystemPack(sheet?.system?.id)?.conditions || []).map((c) => [c.id, c.label]));
  const fromSheet = (sheet?.system_choices?.conditions || []).map((id) => ({ id, label: labels.get(id) || id }));
  const fromToken = normalizeTokenConditions(token?.conditions).map((c) => ({ id: c.id, label: c.label }));
  const all = [...new Map([...fromToken, ...fromSheet].map((c) => [c.id, c])).values()];
  return { shown: all.slice(0, HUD_MAX_CONDITIONS), more: Math.max(0, all.length - HUD_MAX_CONDITIONS) };
}

/**
 * Texto de PV de um token projetado: número quando a projeção deixa, senão só o rótulo de estado.
 * @param {{hpCurrent?: number|null, hpMax?: number|null, hpStatus?: string}|undefined} token Token projetado.
 * @returns {string} "18/24", "Ferido" ou "—".
 */
export function tokenHpLabel(token) {
  if (Number.isFinite(token?.hpCurrent) && Number(token?.hpMax) > 0) return `${token.hpCurrent}/${token.hpMax}`;
  return token?.hpStatus ? String(token.hpStatus) : MISSING;
}

function portrait(token, name) {
  return { initials: String(token?.initials || name.slice(0, 2)).toUpperCase(), color: String(token?.color || "#78d6cf") };
}

/**
 * Linha móvel "Nome · PV 18/24 · CA 16"; partes sem dado são omitidas.
 * @param {{name: string, hp: string|null, ac: number|null}} own Resumo da ficha própria.
 * @returns {string} Linha de uma só linha.
 */
export function buildMobileLine(own) {
  const parts = [own.name];
  if (own.hp) parts.push(`PV ${own.hp}`);
  if (Number.isFinite(own.ac)) parts.push(`CA ${own.ac}`);
  return parts.join(" · ");
}

/**
 * Resumo do personagem próprio e do grupo para o HUD.
 * @param {{sheet?: object|null}} state Estado da sessão (`sheet` = ficha própria).
 * @param {{tokens?: object[]}} [scene] Cena ativa (já projetada para o jogador).
 * @returns {{own: object, party: object[]}|null} Modelo, ou null sem ficha.
 */
export function buildHudStatus(state, scene) {
  const sheet = state?.sheet;
  if (!sheet) return null;
  const tokens = scene?.tokens || [];
  const token = tokens.find((t) => t.sheetId && t.sheetId === sheet.character_id);
  const name = sheetName(sheet);
  const hp = ownHp(sheet);
  const ac = Number(sheet.attributes_lww?.armor_class);
  const own = { name, hp: hp ? `${hp.cur}/${hp.max}` : null, ac: Number.isFinite(ac) ? ac : null, ...portrait(token, name), conditions: buildHudConditions(token, sheet) };
  own.mobileLine = buildMobileLine(own);
  const party = tokens
    .filter((t) => t.layer === "player" && t !== token)
    .map((t) => ({ tokenId: t.tokenId, name: String(t.name || MISSING), hp: tokenHpLabel(t), ...portrait(t, String(t.name || "??")) }));
  return { own, party };
}
