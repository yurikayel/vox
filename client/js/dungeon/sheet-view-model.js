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

/** Quantidade máxima de atalhos do HUD rápido da aba Mapa (spec Subversus VTT v0, §3.1). */
export const HUD_MAX_SHORTCUTS = 6;

function favoriteShortcut(fav) {
  if (fav.kind === "item") return { id: fav.key, label: fav.label, kind: "action", action: "inv-equip", attrs: { "data-item-id": fav.id } };
  return { id: fav.key, label: fav.label, kind: "action", action: "roll-action", attrs: { "data-action-id": fav.id } };
}

/**
 * Atalhos do HUD rápido, derivados da ficha ativa: primeiro as ações clicáveis (ataque/perícia), depois
 * "Rolar d20", "Mover" (só com token da ficha na cena) e "Abrir ficha". Nunca passa de `HUD_MAX_SHORTCUTS`;
 * os atalhos fixos têm vaga garantida e as ações da ficha ocupam o que sobra, na ordem da ficha.
 * @param {{char_id?: string, sheet_meta?: {clickable_actions?: Array<{id: string, label: string}>}}|null|undefined} sheet Ficha ativa.
 * @param {{ownTokenId?: string, favorites?: Array<{key: string, kind: string, id: string, label: string}>}} [opts] `ownTokenId`: token da ficha na cena; `favorites`: favoritos resolvidos, que ocupam as vagas das ações.
 * @returns {Array<{id: string, label: string, kind: "action"|"link", action?: string, attrs?: Record<string, string>, href?: string}>} Atalhos em ordem de exibição.
 */
export function buildHudShortcuts(sheet, opts = {}) {
  const fixed = [{ id: "roll-d20", label: "Rolar d20", kind: "action", action: "roll-d20" }];
  if (opts.ownTokenId) fixed.push({ id: "move", label: "Mover", kind: "action", action: "select-token", attrs: { "data-token-id": opts.ownTokenId } });
  if (sheet?.char_id) fixed.push({ id: "sheet", label: "Abrir ficha", kind: "link", href: `#/dungeon/ficha/${encodeURIComponent(sheet.char_id)}` });
  const room = HUD_MAX_SHORTCUTS - fixed.length;
  const favorites = (opts.favorites || []).slice(0, room).map(favoriteShortcut);
  if (favorites.length) return [...favorites, ...fixed];
  const actions = (sheet?.sheet_meta?.clickable_actions || [])
    .filter((a) => a?.id && a?.label)
    .slice(0, room)
    .map((a) => ({ id: `action:${a.id}`, label: String(a.label), kind: "action", action: "roll-action", attrs: { "data-action-id": String(a.id) } }));
  return [...actions, ...fixed];
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
