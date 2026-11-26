/**
 * @file Projeção do jogador para fichas: campos internos de fichas alheias ficam fora; o PV delas segue pelo token.
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";

/**
 * Ids das fichas ligadas a um token do próprio viewer.
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
 * Tira `pools_base` e `delta_ledger` das fichas que não são do viewer.
 * @param {object} sheetsById Fichas já projetadas (sem notas do Mestre).
 * @param {Set<string>} owned Ids de ficha próprios.
 * @returns {object} Fichas com campos internos só nas próprias.
 */
export function hideForeignSheetFields(sheetsById, owned) {
  return Object.fromEntries(
    Object.entries(sheetsById).map(([id, s]) => {
      if (!s || typeof s !== "object" || owned.has(id)) return [id, s];
      const copy = { ...s };
      delete copy.pools_base;
      delete copy.delta_ledger;
      return [id, copy];
    }),
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
