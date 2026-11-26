/**
 * @file Modelo do HUD de jogo (spec hud-jogo-v0): retrato, PV, CA, condições e grupo. Lógica pura, sem DOM.
 * Dados de outras pessoas vêm só do token projetado (lista de permissão da projeção do jogador).
 * @module dungeon/hud-status-model
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { buildHudBelt, buildHudMagic } from "./hud-bar-model.js";
import { computedDefense } from "./hud-defense.js";
import { defenseLabel } from "./system-display.js";
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

const INK_DARK = "#000000";
const INK_LIGHT = "#ffffff";

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex));
  if (!m) return 0.5;
  const full = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Cor do texto das iniciais com mais contraste sobre a cor do token (WCAG AA exige 4,5:1 para texto normal).
 * @param {string} bg Cor de fundo (#rgb ou #rrggbb); inválida vira cinza médio.
 * @returns {string} Cor de texto, escura ou clara.
 */
export function inkFor(bg) {
  const l = luminance(bg);
  const contrastDark = (l + 0.05) / (luminance(INK_DARK) + 0.05);
  const contrastLight = (luminance(INK_LIGHT) + 0.05) / (l + 0.05);
  return contrastDark >= contrastLight ? INK_DARK : INK_LIGHT;
}

function portrait(token, name) {
  const color = String(token?.color || "#78d6cf");
  return { initials: String(token?.initials || name.slice(0, 2)).toUpperCase(), color, ink: inkFor(color) };
}

/**
 * Ficha do espectador: a ligada a um token cujo dono é a identidade dele. Com identidade e sem token dele, nada (não mostra ficha de outra pessoa);
 * a ficha ativa da sessão só vale quando não há nenhuma identidade.
 * @param {object} state Estado da sessão (`vttKeypair`, `localActor`, `campaign`, `sheet`).
 * @param {object[]} tokens Tokens da cena.
 * @returns {object|null} Ficha própria.
 */
export function resolveOwnSheet(state, tokens) {
  const viewer = state?.vttKeypair?.routeId || state?.localActor || "";
  const mine = viewer ? tokens.find((t) => t.sheetId && t.ownerRouteId === viewer) : null;
  if (viewer) return sheetOfToken(state, mine);
  return state?.sheet || null;
}

function sheetOfToken(state, token) {
  if (!token) return null;
  const active = state.sheet?.character_id === token.sheetId ? state.sheet : null;
  return state.campaign?.sheetsById?.[token.sheetId] || active;
}

/**
 * Linha móvel "Nome · PV 18/24 · CA 16"; partes sem dado são omitidas.
 * @param {{name: string, hp: string|null, ac: number|null}} own Resumo da ficha própria.
 * @returns {string} Linha de uma só linha.
 */
export function buildMobileLine(own) {
  const parts = [own.name];
  if (own.hp) parts.push(`PV ${own.hp}`);
  if (Number.isFinite(own.ac)) parts.push(`${own.acLabel || "CA"} ${own.ac}`);
  return parts.join(" · ");
}

/**
 * Resumo do personagem próprio e do grupo para o HUD.
 * @param {{sheet?: object|null}} state Estado da sessão (`sheet` = ficha própria).
 * @param {{tokens?: object[]}} [scene] Cena ativa (já projetada para o jogador).
 * @returns {{own: object, party: object[]}|null} Modelo, ou null sem ficha.
 */
export function buildHudStatus(state, scene) {
  const tokens = scene?.tokens || [];
  const sheet = resolveOwnSheet(state, tokens);
  if (!sheet) return null;
  const token = tokens.find((t) => t.sheetId && t.sheetId === sheet.character_id);
  const name = sheetName(sheet);
  const hp = ownHp(sheet);
  const pack = getSystemPack(sheet.system?.id);
  const ac = computedDefense(sheet, pack) ?? Number(sheet.attributes_lww?.armor_class);
  const own = { name, hp: hp ? `${hp.cur}/${hp.max}` : null, ac: Number.isFinite(ac) ? ac : null, acLabel: defenseLabel(pack), ...portrait(token, name), conditions: buildHudConditions(token, sheet), magic: buildHudMagic(sheet), belt: buildHudBelt(sheet) };
  own.mobileLine = buildMobileLine(own);
  const party = tokens
    .filter((t) => t.layer === "player" && t !== token)
    .map((t) => ({ tokenId: t.tokenId, name: String(t.name || MISSING).slice(0, 60), hp: tokenHpLabel(t), ...portrait(t, String(t.name || "??")) }));
  return { own, party };
}
