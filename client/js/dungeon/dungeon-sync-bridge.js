/**
 * @file Ponte unificada de projeção de estado e despacho de operações (`VttOp`) para a Mesa Soberana:
 * sincroniza P2P (`syncPeer.dispatchOp`), persiste em `VttStore` ou reduz em memória preservando `sheet`, `scene`, `initiative`, `calendar` e `notes`.
 * @module dungeon/dungeon-sync-bridge
 */
import { formatInWorldDate } from "./vtt-calendar.js";
import { listInventoryItems, totalCarriedWeight } from "./vtt-inventory.js";
import { reduceCampaign } from "./vtt-reducer.js";
import { ownSheetIdFor } from "./vtt-sheet-auth.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
import { createCampaign, createVttOp, ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";
import { createInitiativeState } from "./vtt-tactics-schema.js";

/**
 * Projeta um `VoxCRDTCharacterSheet` para o formato esperado pela UI da Mesa/Grimório.
 * @param {object} rawSheet Ficha CRDT bruta.
 * @param {Array<string>} [fallbackInventory] Inventário legado de fallback.
 * @returns {object} Ficha enriquecida para renderização.
 */
export function buildUiSheetProjection(rawSheet, fallbackInventory) {
  const sheet = ensureSheetMeta(rawSheet);
  const attrs = sheet.attributes_lww || {};
  const ab = attrs.abilities || {};
  const invItems = listInventoryItems(sheet.inventory_orset);
  const inventoryLabels = invItems.length
    ? invItems.map((it) => `${it.label}${it.qty > 1 ? ` ×${it.qty}` : ""}${it.equipped ? " (E)" : ""}`)
    : Array.isArray(sheet.inventory) ? sheet.inventory : fallbackInventory || [];
  return {
    ...sheet,
    char_id: sheet.character_id,
    name: attrs.name || "Aventureiro",
    role_title: attrs.class_name || "Aventureiro",
    attributes: { vitalidade: ab.con ?? 12, astucia: ab.dex ?? 12, sabedoria: ab.wis ?? 12 },
    inventory: inventoryLabels,
    inventoryItems: invItems,
    carryWeight: totalCarriedWeight(sheet.inventory_orset),
  };
}

function pickRecord(map, preferredId) {
  if (!map || typeof map !== "object") return null;
  return map[preferredId] || Object.values(map)[0] || null;
}

function syncLastD20(state) {
  const lastRoll = state.rolls[state.rolls.length - 1];
  const keptD20 = lastRoll?.rolls?.find((d) => d.kept && d.sides === 20);
  if (keptD20) state.lastRoll = { dieSides: 20, value: keptD20.value, committed: false };
}

/** Id da ficha que esta tela mostra: jogador remoto vê a própria (a ativa é decisão do Mestre); os demais, a ativa. */
function viewerSheetId(state, campaign) {
  if (state.joinMode !== "p2p_player") return campaign.activeSheetId;
  return ownSheetIdFor(campaign, state.vttKeypair?.routeId || state.localActor) || campaign.activeSheetId;
}

/**
 * Hidrata o estado de sessão da UI a partir de um `CampaignDoc` completo sem sobrescrever blocos demo W-DRF.
 * @param {object} state Estado de sessão do `#/dungeon`.
 * @param {object} campaign Documento `CampaignDoc` carregado ou reduzido.
 * @returns {object} Estado atualizado.
 */
export function hydrateStateFromCampaign(state, campaign) {
  state.campaignId = campaign.id;
  state.campaignDoc = campaign;
  state.tableId = campaign.id;
  state.tableName = campaign.name;
  const activeSheet = pickRecord(campaign.sheetsById, viewerSheetId(state, campaign));
  if (activeSheet) state.sheet = buildUiSheetProjection(activeSheet, state.sheet?.inventory);
  const activeScene = pickRecord(campaign.scenesById, campaign.activeSceneId);
  if (activeScene) state.scene = activeScene;
  if (campaign.initiative) state.initiative = campaign.initiative;
  if (campaign.calendar) state.worldCalendar = campaign.calendar;
  state.worldDateLabel = formatInWorldDate(campaign.calendar);
  if (Array.isArray(campaign.chronicle) && campaign.chronicle.length) state.chronicle = [...campaign.chronicle];
  state.rolls = [...(campaign.rolls || [])];
  state.fairplay = campaign.fairplay;
  state.notes = Object.values(campaign.notesById || {});
  syncLastD20(state);
  return state;
}

/**
 * Constrói um `CampaignDoc` a partir do estado efêmero da sessão quando ainda não há campanha salva.
 * @param {object} state Estado da sessão.
 * @returns {object} Documento `CampaignDoc` completo (incluindo cena, iniciativa, calendário e notas).
 */
export function buildCampaignFromSession(state) {
  if (state.campaignDoc) return state.campaignDoc;
  const sheet = ensureSheetMeta(state.sheet || {});
  const scene = state.scene?.floors?.length ? state.scene : createDefaultScene(state.localActor || "local");
  const notesById = Object.fromEntries((state.notes || []).filter((n) => n?.id).map((n) => [n.id, n]));
  return createCampaign({
    id: state.tableId || "mesa-local",
    name: state.tableName || "Mesa Local",
    gmRouteId: state.vttKeypair?.routeId || "local",
    activeSheetId: sheet.character_id,
    sheetsById: { [sheet.character_id]: sheet },
    activeSceneId: scene.sceneId,
    scenesById: { [scene.sceneId]: scene },
    initiative: createInitiativeState(state.initiative),
    calendar: state.worldCalendar,
    notesById,
    chronicle: state.chronicle || [],
    rolls: state.rolls || [],
    fairplay: state.fairplay,
  });
}

function hydrateEphemeralReduction(state, reduced) {
  const activeSheet = pickRecord(reduced.sheetsById, reduced.activeSheetId);
  if (activeSheet) state.sheet = buildUiSheetProjection(activeSheet, state.sheet?.inventory);
  const activeScene = pickRecord(reduced.scenesById, reduced.activeSceneId);
  if (activeScene) state.scene = activeScene;
  if (reduced.initiative) state.initiative = reduced.initiative;
  if (reduced.calendar) {
    state.worldCalendar = reduced.calendar;
    state.worldDateLabel = formatInWorldDate(reduced.calendar);
  }
  state.chronicle = [...(reduced.chronicle || [])];
  state.rolls = [...(reduced.rolls || [])];
  state.fairplay = reduced.fairplay;
  state.notes = Object.values(reduced.notesById || {});
  syncLastD20(state);
  return reduced;
}

async function dispatchViaSyncPeer(state, type, payload) {
  const actor = state.vttKeypair?.routeId || state.localActor || "local";
  const res = await state.syncPeer.dispatchOp({ type, payload, actor });
  if (state.joinMode !== "p2p_player" && res?.id) hydrateStateFromCampaign(state, res);
  return res;
}

/**
 * Despacha uma operação `VttOp` pelo caminho adequado: par P2P ativo (`syncPeer`), `VttStore` local ou redutor em memória.
 * Garante propagação integral de `sheet`, `scene`, `initiative`, `calendar`, `notes`, `chronicle` e `rolls`.
 * @param {object} state Estado da sessão dungeon.
 * @param {string} type Tipo da operação (`ROLL_RECORDED`, `TOKEN_MOVE`, `INVENTORY_MUTATE`, etc.).
 * @param {object} payload Carga da operação.
 * @param {{ store?: object, refreshCampaignsList?: boolean }} [opts={}] Opções de store.
 * @returns {Promise<object>} Documento `CampaignDoc` atualizado ou operação enviada ao GM.
 */
export async function dispatchCampaignOp(state, type, payload, opts = {}) {
  if (state.syncPeer && typeof state.syncPeer.dispatchOp === "function") {
    return dispatchViaSyncPeer(state, type, payload);
  }
  const store = opts.store || getDefaultVttStore();
  const op = createVttOp({
    type,
    payload,
    actor: state.vttKeypair?.routeId || state.localActor || "local",
    lamport: (state.campaignDoc?.lamport || 0) + 1,
  });
  if (state.campaignId) {
    const res = await store.appendOp(state.campaignId, op);
    hydrateStateFromCampaign(state, res.campaign);
    if (opts.refreshCampaignsList) state.campaigns = await store.listCampaigns();
    return res.campaign;
  }
  const reduced = reduceCampaign(buildCampaignFromSession(state), op);
  return hydrateEphemeralReduction(state, reduced);
}
