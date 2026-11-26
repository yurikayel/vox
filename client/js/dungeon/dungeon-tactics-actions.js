/**
 * @file Ações táticas da Entrega 3 (Iniciativa, Condições, Névoa, Desenho, AoE, Portas e Andares)
 * integradas à ponte de persistência/P2P (`dungeon-sync-bridge.js`) e ao redutor determinístico.
 * @module dungeon/dungeon-tactics-actions
 */
import { rollDiceFormula } from "./dice-engine.js";
import { getActiveScene } from "./dungeon-scene-actions.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { resolveSheetSystem } from "./screen-sheet-derived.js";
import { getDefaultVttStore } from "./vtt-store.js";
import { normalizeTokenConditions } from "./vtt-tactics-schema.js";

function getActiveFloor(scene) {
  return scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
}

/**
 * Fórmula de iniciativa da ficha ativa: o mesmo número que a faixa de derivados mostra quando o pacote
 * é conhecido; sem pacote, o modificador de Destreza do D&D (`@des`).
 * @param {object|null} sheet Ficha ativa.
 * @returns {string} Fórmula de dados (`1d20+4`, `1d20-1`, `1d20` ou `1d20+@des`).
 */
function initiativeFormulaFor(sheet) {
  const sys = resolveSheetSystem(sheet);
  if (!sys) return "1d20+@des";
  const n = Math.trunc(sys.derived.initiative);
  if (!n) return "1d20";
  return n > 0 ? `1d20+${n}` : `1d20-${Math.abs(n)}`;
}

/**
 * Rola iniciativa (ficha ativa pelo derivado do pacote ou `1d20` p/ NPCs) para todos os tokens do piso ativo.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`, `randomBytesFn`).
 * @returns {Promise<object>} Estado de iniciativa atualizado.
 */
export async function rollInitiativeForScene(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const tokens = (scene.tokens || []).filter((t) => t.floorZ === scene.activeFloorZ);
  for (const tok of tokens) {
    const formula = tok.sheetId && tok.sheetId === state.sheet?.character_id ? initiativeFormulaFor(state.sheet) : "1d20";
    const rolled = rollDiceFormula(formula, { sheet: state.sheet, randomBytesFn: opts.randomBytesFn });
    const rollVal = rolled.ok ? rolled.total : 10;
    await dispatchCampaignOp(state, "INITIATIVE_SET_ENTRY", {
      entry: { tokenId: tok.tokenId, name: tok.name, roll: rollVal, tieBreak: tok.layer === "player" ? 1 : 0, hidden: tok.layer === "gm" },
    }, { store });
  }
  state.mapNotice = `Iniciativa rolada para ${tokens.length} combatente(s).`;
  return state.initiative;
}

/**
 * Avança o turno na iniciativa (decrementando condições temporárias do token que encerrou o turno).
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Estado de iniciativa atualizado.
 */
export async function advanceInitiativeTurn(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  await dispatchCampaignOp(state, "INITIATIVE_NEXT", {}, { store });
  return state.initiative;
}

/**
 * Limpa e reinicia o rastreador de iniciativa da campanha.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Estado de iniciativa zerado.
 */
export async function resetInitiativeTracker(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  await dispatchCampaignOp(state, "INITIATIVE_RESET", {}, { store });
  return state.initiative;
}

/**
 * Alterna uma condição de combate no token alvo (adiciona com duração opcional ou remove se já ativa).
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {string} conditionId Chave da condição (`envenenado`, `caido`, etc.).
 * @param {object} [opts={}] Opções (`durationRounds`, `store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function toggleConditionOnToken(state, tokenId, conditionId, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const tok = (scene.tokens || []).find((t) => t.tokenId === tokenId);
  if (!tok) return scene;
  const cleanId = String(conditionId || "").trim().toLowerCase();
  const hasIt = normalizeTokenConditions(tok.conditions).some((c) => c.id === cleanId);
  const type = hasIt ? "TOKEN_CONDITION_REMOVE" : "TOKEN_CONDITION_SET";
  const payload = hasIt
    ? { sceneId: scene.sceneId, tokenId, conditionId: cleanId }
    : { sceneId: scene.sceneId, tokenId, condition: { id: cleanId, durationRounds: opts.durationRounds ?? 2 } };
  await dispatchCampaignOp(state, type, payload, { store });
  return getActiveScene(state);
}

/**
 * Liga ou desliga a Névoa de Guerra no piso ativo.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function toggleFogEnabled(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const floor = getActiveFloor(scene);
  const next = !floor?.fog?.enabled;
  await dispatchCampaignOp(state, "FOG_SET", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, enabled: next }, { store });
  state.mapNotice = next ? "Névoa de guerra ativada neste andar." : "Névoa de guerra desativada.";
  return getActiveScene(state);
}

/**
 * Revela um retângulo no piso ativo sob a Névoa de Guerra.
 * @param {object} state Estado da sessão.
 * @param {{ x: number, y: number, w: number, h: number }} rect Área revelada em pixels do mundo.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function revealFogRectInScene(state, rect, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "FOG_SET", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, enabled: true, revealRect: rect }, { store });
  return getActiveScene(state);
}

/**
 * Cobre novamente toda a Névoa de Guerra no piso ativo.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function resetFogInScene(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "FOG_SET", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, enabled: true, reset: true }, { store });
  return getActiveScene(state);
}

/**
 * Grava um traço de desenho livre simplificado no piso ativo.
 * @param {object} state Estado da sessão.
 * @param {Array<{ wx: number, wy: number }>} points Pontos simplificados.
 * @param {object} [opts={}] Opções (`color`, `width`, `layer`, `store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function commitDrawingStroke(state, points, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "DRAWING_ADD", {
    sceneId: scene.sceneId,
    floorZ: scene.activeFloorZ,
    drawing: { points, color: opts.color || "#78d6cf", width: opts.width || 3, layer: opts.layer || "player" },
  }, { store });
  return getActiveScene(state);
}

/**
 * Remove todos os desenhos livres do piso ativo.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function clearSceneDrawings(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "DRAWING_CLEAR", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ }, { store });
  return getActiveScene(state);
}

/**
 * Adiciona um gabarito de Área de Efeito (`circle`, `cone`, `cube`, `line`) no piso ativo.
 * @param {object} state Estado da sessão.
 * @param {object} aoeSpec Parâmetros geométricos do gabarito.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function commitAoeTemplate(state, aoeSpec, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "AOE_UPSERT", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, aoe: aoeSpec }, { store });
  return getActiveScene(state);
}

/**
 * Remove todos os gabaritos de Área de Efeito do piso ativo.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function clearSceneAoes(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "AOE_CLEAR", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ }, { store });
  return getActiveScene(state);
}

function nextDoorState(currentState, isGm) {
  if (currentState === "secret") return isGm ? "closed" : null;
  if (currentState === "locked") return isGm ? "closed" : null;
  if (currentState === "closed") return "open";
  return "closed";
}

/**
 * Alterna o estado de uma porta ao clicar no mapa (jogador só alterna `closed`/`open`; GM destranca e revela `secret`).
 * @param {object} state Estado da sessão.
 * @param {string} doorId Identificador da porta.
 * @param {object} [opts={}] Opções (`forceState`, `store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function toggleDoorInScene(state, doorId, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const floor = getActiveFloor(scene);
  const door = (floor?.doors || []).find((d) => d.doorId === doorId);
  if (!door) return scene;
  const isGm = state.viewerRole === "gm";
  const next = opts.forceState && isGm ? opts.forceState : nextDoorState(door.state, isGm);
  if (!next) return scene;
  await dispatchCampaignOp(state, "DOOR_STATE_SET", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, doorId, state: next }, { store });
  return getActiveScene(state);
}

/**
 * Adiciona um novo andar (`z`) à cena ativa e o seleciona imediatamente.
 * @param {object} state Estado da sessão.
 * @param {string} [name] Rótulo opcional do andar.
 * @param {object} [opts={}] Opções (`z`, `store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function addFloorToScene(state, name = "", opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "FLOOR_ADD", { sceneId: scene.sceneId, select: true, floor: { ...(opts.z !== undefined ? { z: opts.z } : {}), ...(name ? { name } : {}) } }, { store });
  return getActiveScene(state);
}

/**
 * Alterna o andar (`activeFloorZ`) exibido no mapa 2D.
 * @param {object} state Estado da sessão.
 * @param {number} floorZ Nível vertical `z`.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function selectSceneFloor(state, floorZ, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "FLOOR_SELECT", { sceneId: scene.sceneId, floorZ: Number(floorZ) }, { store });
  return getActiveScene(state);
}

/**
 * Move um token para outro andar (`elevation_z`) preservando PV, condições e dono.
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {number} targetFloorZ Novo andar `z`.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function moveTokenToFloor(state, tokenId, targetFloorZ, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "TOKEN_CHANGE_FLOOR", { sceneId: scene.sceneId, tokenId, floorZ: Number(targetFloorZ) }, { store });
  return getActiveScene(state);
}
