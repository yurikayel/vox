/**
 * @file Visão do grupo, dos espólios e das salvaguardas a partir das fichas que a campanha já guarda
 * (`campaign.sheetsById`). Lógica pura, sem DOM; as telas só formatam o que sai daqui.
 *
 * Não inventa dado: sem ficha não há linha, sem PV o texto é "—", e a salvaguarda é só o modificador do
 * atributo (a ficha ainda não guarda proficiência por salvaguarda, então nada é somado além disso).
 * Fica de fora o desenho (`screen-party-panels.js`) e qualquer ação, que precisaria de um tratador novo.
 *
 * @module dungeon/party-view-model
 * @see docs/specs/subversus-vtt-v0.md (seção 3.1: Acampamento com grupo e espólios; Escudo com salvaguardas em lote)
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { abilityModifier } from "./dice-engine.js";
import { listInventoryItems } from "./vtt-inventory.js";

/** Texto mostrado no lugar de um dado que a ficha não tem. @type {string} */
export const NO_DATA = "—";

/** Atributos das salvaguardas, na ordem da ficha (chave interna, sigla e nome em português). @type {ReadonlyArray<{key: string, short: string, label: string}>} */
export const SAVE_ABILITIES = Object.freeze([
  { key: "str", short: "FOR", label: "Força" },
  { key: "dex", short: "DES", label: "Destreza" },
  { key: "con", short: "CON", label: "Constituição" },
  { key: "int", short: "INT", label: "Inteligência" },
  { key: "wis", short: "SAB", label: "Sabedoria" },
  { key: "cha", short: "CAR", label: "Carisma" },
]);

/**
 * Fichas do grupo: as da campanha; sem campanha carregada, só a ficha ativa da sessão.
 * @param {{campaign?: {sheetsById?: object}, sheet?: object}} state Estado da sessão.
 * @returns {object[]} Fichas, na ordem de inserção.
 */
export function listPartySheets(state) {
  const fromCampaign = Object.values(state?.campaign?.sheetsById || {}).filter((s) => s && typeof s === "object");
  if (fromCampaign.length) return fromCampaign;
  return state?.sheet && typeof state.sheet === "object" ? [state.sheet] : [];
}

function sheetId(sheet, index) {
  return String(sheet.character_id || sheet.char_id || `ficha-${index}`);
}

function sheetName(sheet) {
  return String(sheet.name || sheet.attributes_lww?.name || "Sem nome").slice(0, 60);
}

/** Sem PV máximo na ficha não há PV a mostrar: a projeção preenche um padrão, e esse padrão não é dado da ficha. */
function hpText(sheet, token) {
  const max = Number(sheet.pools_base?.hp_max);
  if (!Number.isFinite(max) || max <= 0) return tokenHpText(token);
  const hp = Number(projectCharacterPools(sheet.pools_base, sheet.delta_ledger || []).pools?.hp_current);
  return `${Number.isFinite(hp) ? hp : NO_DATA} / ${max} PV`;
}

/** Ficha alheia chega sem pools: o PV vem do token projetado (número, ou só o rótulo de estado). */
function tokenHpText(token) {
  if (Number.isFinite(token?.hpCurrent) && Number(token?.hpMax) > 0) return `${token.hpCurrent} / ${token.hpMax} PV`;
  if (token?.hpStatus) return String(token.hpStatus);
  return `${NO_DATA} / ${NO_DATA} PV`;
}

function tokensBySheet(state) {
  const map = new Map();
  for (const scene of Object.values(state?.campaign?.scenesById || {})) {
    for (const t of scene?.tokens || []) if (t.sheetId && !map.has(t.sheetId)) map.set(t.sheetId, t);
  }
  return map;
}

/**
 * Uma linha por personagem do grupo.
 * @param {object} state Estado da sessão.
 * @returns {Array<{id: string, name: string, role: string, level: string, hp: string}>} Linhas do grupo.
 */
export function buildPartyView(state) {
  const tokens = tokensBySheet(state);
  return listPartySheets(state).map((sheet, i) => {
    const level = Number(sheet.attributes_lww?.level);
    return {
      id: sheetId(sheet, i),
      name: sheetName(sheet),
      role: String(sheet.role_title || sheet.attributes_lww?.class_name || "").slice(0, 60) || NO_DATA,
      level: Number.isFinite(level) && level > 0 ? String(Math.trunc(level)) : NO_DATA,
      hp: hpText(sheet, tokens.get(sheetId(sheet, i))),
    };
  });
}

/**
 * Itens carregados por personagem (as mochilas do grupo); quem não carrega nada não aparece.
 * @param {object} state Estado da sessão.
 * @returns {{holders: Array<{id: string, name: string, items: Array<{label: string, qty: number, equipped: boolean}>}>, totalItems: number}} Espólios do grupo.
 */
export function buildLootView(state) {
  const holders = [];
  listPartySheets(state).forEach((sheet, i) => {
    const items = listInventoryItems(sheet.inventory_orset).map((it) => ({ label: it.label, qty: it.qty, equipped: it.equipped }));
    if (items.length) holders.push({ id: sheetId(sheet, i), name: sheetName(sheet), items });
  });
  return { holders, totalItems: holders.reduce((sum, h) => sum + h.items.reduce((n, it) => n + it.qty, 0), 0) };
}

function formatSave(mod) {
  return mod >= 0 ? `+${mod}` : String(mod);
}

/**
 * Salvaguardas de todo o grupo de uma vez: modificador de cada atributo por personagem.
 * @param {object} state Estado da sessão.
 * @returns {{abilities: ReadonlyArray<{key: string, short: string, label: string}>, rows: Array<{id: string, name: string, saves: Array<{key: string, text: string, mod: number}>}>}} Tabela em lote.
 */
export function buildSavesView(state) {
  const rows = listPartySheets(state).map((sheet, i) => {
    const scores = sheet.attributes_lww?.abilities || {};
    const saves = SAVE_ABILITIES.map(({ key }) => {
      const mod = abilityModifier(scores[key] ?? 10);
      return { key, mod, text: formatSave(mod) };
    });
    return { id: sheetId(sheet, i), name: sheetName(sheet), saves };
  });
  return { abilities: SAVE_ABILITIES, rows };
}
