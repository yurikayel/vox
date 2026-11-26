/**
 * @file Projeção do jogador para fichas: fichas alheias só pela lista de permissão; o PV delas segue pelo token.
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";

/**
 * Ids das fichas próprias: ficha ligada (`token.sheetId`) a um token cujo `ownerRouteId` é o do viewer.
 * Sem token do viewer na cena (ou sem identidade), a ficha conta como alheia e segue a lista de permissão.
 * @param {object} scenesById Cenas completas da campanha.
 * @param {string} viewerRouteId Identidade de quem lê.
 * @returns {Set<string>} Ids de ficha próprios.
 */
export function ownedSheetIds(scenesById, viewerRouteId) {
  const owned = new Set();
  if (!viewerRouteId) return owned;
  for (const scene of Object.values(scenesById || {})) {
    for (const t of scene?.tokens || []) {
      if (t.sheetId && t.ownerRouteId === viewerRouteId) owned.add(t.sheetId);
    }
  }
  return owned;
}

/**
 * Lista de permissão da ficha alheia: identificação, nome e CA. O resto (inventário, metadados, escolhas, recursos, atributos) fica fora.
 * @param {object} sheet Ficha completa.
 * @returns {object} Ficha reduzida.
 */
function foreignSheetView(sheet) {
  const attrs = sheet.attributes_lww || {};
  const out = { character_id: sheet.character_id, campaign_id: sheet.campaign_id, attributes_lww: { name: attrs.name, armor_class: attrs.armor_class } };
  if (sheet.name !== undefined) out.name = sheet.name;
  return out;
}

/**
 * Reduz à lista de permissão as fichas que não são do viewer; as próprias passam inteiras.
 * @param {object} sheetsById Fichas já projetadas (sem notas do Mestre).
 * @param {Set<string>} owned Ids de ficha próprios.
 * @returns {object} Fichas com o conteúdo completo só nas próprias.
 */
function hideForeignSheetFields(sheetsById, owned) {
  return Object.fromEntries(
    Object.entries(sheetsById).map(([id, s]) => [id, !s || typeof s !== "object" || owned.has(id) ? s : foreignSheetView(s)]),
  );
}

function sheetHp(sheet) {
  const max = Number(sheet?.pools_base?.hp_max);
  if (!Number.isFinite(max) || max <= 0) return null;
  const cur = Number(projectCharacterPools(sheet.pools_base, sheet.delta_ledger || []).pools?.hp_current);
  return Number.isFinite(cur) ? { hpCurrent: cur, hpMax: max } : null;
}

/**
 * Grava no token o PV calculado da ficha alheia ligada a ele; o modo `hpVisible` ainda decide o que o jogador vê.
 * @param {object} scene Cena completa.
 * @param {object} sheetsById Fichas completas.
 * @param {Set<string>} owned Ids de ficha próprios.
 * @returns {object} Cena com PV de fichas alheias nos tokens.
 */
export function withForeignSheetHp(scene, sheetsById, owned) {
  const tokens = (scene.tokens || []).map((t) => {
    if (!t.sheetId || owned.has(t.sheetId)) return t;
    const hp = sheetHp(sheetsById?.[t.sheetId]);
    return hp ? { ...t, ...hp } : t;
  });
  return { ...scene, tokens };
}

/**
 * Fichas para o jogador: sem notas do Mestre; as alheias reduzidas à lista de permissão.
 * @param {{sheetsById?: object, scenesById?: object}} state Estado completo da campanha.
 * @param {string} viewerRouteId Identidade de quem lê.
 * @returns {{sheetsById: object, owned: Set<string>}} Fichas projetadas e ids próprios.
 */
export function projectSheetsForPlayer(state, viewerRouteId) {
  const owned = ownedSheetIds(state.scenesById, viewerRouteId);
  const noGmNotes = Object.fromEntries(
    Object.entries(state.sheetsById || {}).map(([id, s]) => [id, s?.sheet_meta ? { ...s, sheet_meta: { ...s.sheet_meta, notes_gm: "" } } : s]),
  );
  return { sheetsById: hideForeignSheetFields(noGmNotes, owned), owned };
}
