/**
 * @file Regras de autorização das ops de ficha de jogador (`SHEET_UPSERT`, `SHEET_DELTA`, `SHEET_ACTION_*`).
 * Dono de uma ficha: o autor igual ao `owner_pubkey_p256` dela, ou o `ownerRouteId` de um token ligado a ela
 * (`token.sheetId`). Ficha nova de jogador é aceita e nasce com o autor como dono. Sem campo de identidade novo.
 * @module dungeon/vtt-sheet-auth
 */

const SHEET_OPS = new Set(["SHEET_UPSERT", "SHEET_DELTA", "SHEET_ACTION_UPSERT", "SHEET_ACTION_REMOVE"]);

/**
 * Diz se o tipo da operação mexe em ficha.
 * @param {string} type Tipo da `VttOp`.
 * @returns {boolean} `true` para as ops de ficha de jogador.
 */
export function isSheetOp(type) {
  return SHEET_OPS.has(type);
}

/**
 * Id da ficha alvo, como o reducer o resolve (ficha enviada no upsert; `sheetId` ou a ativa nas demais).
 * @param {object} state Estado da campanha.
 * @param {object} op Operação.
 * @returns {string} Id da ficha, ou vazio.
 */
export function targetSheetId(state, op) {
  if (op.type === "SHEET_UPSERT") return String(op.payload?.sheet?.character_id || "");
  return String(op.payload?.sheetId || state.activeSheetId || "");
}

function hasOwnedToken(state, sheetId, actor) {
  return Object.values(state.scenesById || {}).some((scene) => (scene.tokens || []).some((t) => t.sheetId === sheetId && t.ownerRouteId === actor));
}

/**
 * Diz se `actor` é dono da ficha existente: dono declarado ou token ligado a ela e a ele.
 * @param {object} state Estado da campanha.
 * @param {string} sheetId Id da ficha.
 * @param {string} actor Autor da operação.
 * @returns {boolean} `true` quando é o dono.
 */
export function isSheetOwner(state, sheetId, actor) {
  const sheet = state.sheetsById?.[sheetId];
  if (!sheet || !actor) return false;
  return sheet.owner_pubkey_p256 === actor || hasOwnedToken(state, sheetId, actor);
}

/**
 * Autoriza uma op de ficha de jogador: dono da ficha existente, ou criação de ficha nova (só no upsert).
 * @param {object} state Estado da campanha.
 * @param {object} op Operação de ficha.
 * @returns {boolean} `true` quando autorizada.
 */
export function isPlayerAuthorizedForSheetOp(state, op) {
  const sheetId = targetSheetId(state, op);
  if (!sheetId || !op.actor) return false;
  if (state.sheetsById?.[sheetId]) return isSheetOwner(state, sheetId, op.actor);
  return op.type === "SHEET_UPSERT";
}

/**
 * Dono que a ficha gravada deve ter: o Mestre grava o que quiser; jogador mantém o dono atual ou assume a ficha nova.
 * @param {object} state Estado da campanha.
 * @param {string} sheetId Id da ficha.
 * @param {string} actor Autor da operação.
 * @param {boolean} isGm Se o autor é o Mestre.
 * @param {string} declared Dono vindo no payload.
 * @returns {string} Valor de `owner_pubkey_p256`.
 */
export function ownerForUpsert(state, sheetId, actor, isGm, declared) {
  if (isGm) return String(declared || "");
  return state.sheetsById?.[sheetId]?.owner_pubkey_p256 || actor;
}
