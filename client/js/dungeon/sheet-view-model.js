/**
 * @file Visão da ficha para as telas do Subversus: PV, moedas e peso a partir da ficha ativa, sem
 * inventar número. Quando o dado não existe, o texto é "—" (nunca um padrão como 24 PV ou 50 moedas).
 *
 * Lógica pura, sem DOM. Fica de fora daqui o desenho das telas: `screen-table.js` e `screen-sheet.js`
 * só formatam o que este módulo devolve, para a ficha ser a fonte única do estado (spec Subversus VTT v0, §3.1).
 * Peso é guardado em libras (`weightLb`) e mostrado em quilos.
 *
 * @module dungeon/sheet-view-model
 * @see docs/specs/subversus-vtt-v0.md (seção 3.1, "Fonte única de estado")
 */
import { lbToKg } from "./vtt-inventory.js";

/** Texto mostrado no lugar de um dado que a ficha não tem. @type {string} */
export const MISSING_VALUE = "—";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formata quilos em português ("1,5 kg"), ou "—" quando o valor não existe.
 * @param {number|null|undefined} kg Quilos.
 * @returns {string} Texto pronto para a tela.
 */
export function formatKg(kg) {
  const n = finiteOrNull(kg);
  return n === null || n < 0 ? MISSING_VALUE : `${n.toFixed(1).replace(".", ",")} kg`;
}

/**
 * PV atual e máximo da ficha, com a barra em porcentagem.
 * @param {{pools_base?: {hp_max?: number}}|null|undefined} sheet Ficha ativa.
 * @param {{hp_current?: number}|null|undefined} pools Recursos já projetados do `delta_ledger`.
 * @returns {{hp: number|null, hpMax: number|null, text: string, pct: number}} `text` é "— / — PV" sem dado; `pct` é 0 sem dado.
 */
export function buildVitalsView(sheet, pools) {
  const hp = finiteOrNull(pools?.hp_current);
  const rawMax = finiteOrNull(sheet?.pools_base?.hp_max);
  const hpMax = rawMax !== null && rawMax > 0 ? rawMax : null;
  const shownHp = hp === null ? MISSING_VALUE : String(hp);
  const shownMax = hpMax === null ? MISSING_VALUE : String(hpMax);
  const pct = hp === null || hpMax === null ? 0 : Math.max(0, Math.min(100, Math.round((hp / hpMax) * 100)));
  return { hp, hpMax, text: `${shownHp} / ${shownMax} PV`, pct };
}

/**
 * Moedas de ouro da ficha.
 * @param {{currency_gp?: number}|null|undefined} pools Recursos já projetados do `delta_ledger`.
 * @returns {{gp: number|null, text: string}} `text` é "— Moedas" quando a ficha não tem o recurso.
 */
export function buildCoinsView(pools) {
  const gp = finiteOrNull(pools?.currency_gp);
  return { gp, text: `${gp === null ? MISSING_VALUE : gp} Moedas` };
}

/**
 * Peso de um item (peso unitário × quantidade) em quilos.
 * `weightLb` 0 significa que o peso não foi informado (a normalização do inventário troca ausente por 0).
 * @param {{weightLb?: number, qty?: number}} item Item do inventário.
 * @returns {{kg: number|null, text: string}} `text` é "—" sem peso informado.
 */
export function buildItemWeightView(item) {
  const unit = lbToKg(item?.weightLb);
  const qty = finiteOrNull(item?.qty) ?? 1;
  if (unit === null || unit === 0) return { kg: null, text: MISSING_VALUE };
  return { kg: unit * qty, text: formatKg(unit * qty) };
}

/**
 * Carga total do inventário em quilos (soma dos itens que têm peso informado).
 * @param {Array<{weightLb?: number, qty?: number}>} items Itens listados.
 * @returns {{kg: number, text: string}} Carga; lista vazia vale 0,0 kg porque a mochila realmente está vazia.
 */
export function buildCarryView(items) {
  const kg = (items || []).reduce((sum, it) => sum + (buildItemWeightView(it).kg ?? 0), 0);
  return { kg, text: formatKg(kg) };
}

const DND_LB_PER_STRENGTH = 15;

/**
 * Carga contra o limite do sistema, com o motivo por escrito (spec §5.4). O limite é a regra do D&D (15 lb por ponto de
 * Força); sem Força na ficha o limite é desconhecido e nada é marcado como excesso.
 * @param {{attributes_lww?: {abilities?: {str?: number}}}|null|undefined} sheet Ficha ativa.
 * @param {Array<{weightLb?: number, qty?: number}>} items Itens listados.
 * @returns {{kg: number, text: string, limitKg: number|null, limitText: string, over: boolean, reason: string}} Indicador de carga.
 */
export function buildLoadView(sheet, items) {
  const carry = buildCarryView(items);
  const str = finiteOrNull(sheet?.attributes_lww?.abilities?.str);
  const limitKg = str !== null && str > 0 ? lbToKg(str * DND_LB_PER_STRENGTH) : null;
  const limitText = formatKg(limitKg);
  if (limitKg === null) return { ...carry, limitKg, limitText, over: false, reason: "A ficha não tem Força: o limite de carga é desconhecido." };
  const over = carry.kg > limitKg;
  const rule = `Força ${str} × ${DND_LB_PER_STRENGTH} lb, regra do D&D`;
  const reason = over ? `Carga de ${carry.text} acima do limite de ${limitText} (${rule}).` : `Dentro do limite de ${limitText} (${rule}).`;
  return { ...carry, limitKg, limitText, over, reason };
}
