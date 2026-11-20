/**
 * @file Operações da Entrega 2 (Mapa 2D, tokens, Camada GM, blobs de mapa, convite P2P e montagem do `<canvas>`).
 * @module dungeon/dungeon-scene-actions
 */
import { attachCanvasInput } from "./canvas-input.js";
import { renderSceneToCanvas } from "./canvas-renderer.js";
import { buildCampaignFromSession, hydrateStateFromCampaign } from "./dungeon-persistence.js";
import { createCamera } from "./vtt-geometry.js";
import { reduceCampaign } from "./vtt-reducer.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
import { createVttOp } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";
import { buildRoomInviteHref, generateRoomKey, generateVttKeypair } from "./vtt-sync-codec.js";
import { createBroadcastChannelTransport, createVttSyncPeer } from "./vtt-sync.js";

/**
 * Retorna a cena ativa da sessão, garantindo fallback para a cena padrão da Cripta.
 * @param {object} state Estado da sessão.
 * @returns {object} `SceneDoc` ativa.
 */
export function getActiveScene(state) {
  if (state?.scene?.floors?.length) return state.scene;
  const fromDoc = state?.campaignDoc?.scenesById?.[state.campaignDoc.activeSceneId];
  if (fromDoc?.floors?.length) return fromDoc;
  const fallback = createDefaultScene(state?.localActor || "local");
  if (state) state.scene = fallback;
  return fallback;
}

async function applySceneOp(state, type, payload, store) {
  const op = createVttOp({
    type,
    payload,
    actor: state.localActor || "local",
    lamport: (state.campaignDoc?.lamport || 0) + 1,
  });
  if (state.campaignId) {
    const res = await store.appendOp(state.campaignId, op);
    hydrateStateFromCampaign(state, res.campaign);
    return getActiveScene(state);
  }
  const base = buildCampaignFromSession(state);
  const currentScene = getActiveScene(state);
  const seeded = { ...base, activeSceneId: currentScene.sceneId, scenesById: { ...(base.scenesById || {}), [currentScene.sceneId]: currentScene } };
  const reduced = reduceCampaign(seeded, op);
  state.scene = reduced.scenesById[reduced.activeSceneId];
  return state.scene;
}

/**
 * Salva uma imagem de mapa deduplicada por SHA-256 no `VttStore` e vincula ao piso ativo da cena.
 * @param {object} state Estado da sessão.
 * @param {{ bytes: Uint8Array, mime?: string, widthPx?: number, heightPx?: number }} fileSpec Dados da imagem.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<{ sha256: string, deduplicated: boolean }>} Hash e status de deduplicação.
 */
export async function uploadSceneMapBlob(state, fileSpec, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const saved = await store.putBlob(fileSpec.bytes, fileSpec.mime || "image/png");
  const scene = getActiveScene(state);
  await applySceneOp(state, "SCENE_MAP_SET", {
    sceneId: scene.sceneId,
    floorZ: scene.activeFloorZ,
    mapBlobHash: saved.sha256,
    widthPx: fileSpec.widthPx,
    heightPx: fileSpec.heightPx,
  }, store);
  state.mapNotice = saved.deduplicated
    ? `Mapa reutilizado sem duplicar disco (SHA-256 ${saved.sha256.slice(0, 10)}…).`
    : `Mapa salvo localmente (SHA-256 ${saved.sha256.slice(0, 10)}…).`;
  return saved;
}

/**
 * Adiciona um token na cena ativa (na camada `player` ou `gm`).
 * @param {object} state Estado da sessão.
 * @param {{ name: string, layer?: "player"|"gm", x?: number, y?: number, color?: string }} rawToken Dados do token.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function addTokenToScene(state, rawToken, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const name = String(rawToken?.name || "").trim();
  if (!name) return scene;
  const layer = rawToken.layer === "gm" && state.viewerRole === "gm" ? "gm" : "player";
  const next = await applySceneOp(state, "TOKEN_UPSERT", {
    sceneId: scene.sceneId,
    token: { name, layer, x: rawToken.x ?? 1, y: rawToken.y ?? 1, ownerRouteId: layer === "gm" ? "gm" : state.localActor || "local" },
  }, store);
  state.mapNotice = layer === "gm" ? `Token "${name}" adicionado à Camada do Mestre (oculto).` : `Token "${name}" adicionado ao mapa.`;
  return next;
}

/**
 * Move um token para a célula `(x, y)` na cena ativa e persiste a operação.
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {number} x Nova coluna.
 * @param {number} y Nova linha.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function moveTokenInScene(state, tokenId, x, y, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const next = await applySceneOp(state, "TOKEN_MOVE", { sceneId: scene.sceneId, tokenId, x, y }, store);
  if (tokenId === "tok-lyra") state.playerPos = { x: Math.max(0, Math.min(4, x)), y: Math.max(0, Math.min(4, y)) };
  return next;
}

/**
 * Alterna um token entre Camada do Mestre (`gm`) e Camada dos Jogadores (`player`).
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function toggleTokenLayerInScene(state, tokenId, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const tok = (scene.tokens || []).find((t) => t.tokenId === tokenId);
  if (!tok) return scene;
  const nextLayer = tok.layer === "gm" ? "player" : "gm";
  const next = await applySceneOp(state, "TOKEN_LAYER_SET", { sceneId: scene.sceneId, tokenId, layer: nextLayer }, store);
  state.mapNotice = nextLayer === "player"
    ? `Token "${tok.name}" revelado para os jogadores.`
    : `Token "${tok.name}" ocultado na Camada do Mestre.`;
  return next;
}

/**
 * Remove um token da cena ativa.
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function removeTokenFromScene(state, tokenId, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  if (state.selectedTokenId === tokenId) state.selectedTokenId = "";
  return applySceneOp(state, "TOKEN_REMOVE", { sceneId: scene.sceneId, tokenId }, store);
}

/**
 * Alterna o tipo de grade da cena ativa entre `square` e `hex`.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function toggleSceneGridType(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  const nextType = floor?.grid?.type === "hex" ? "square" : "hex";
  return applySceneOp(state, "SCENE_MAP_SET", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, grid: { type: nextType } }, store);
}

/**
 * Gera um convite P2P local (`#/dungeon/entrar/:id?gm=...#k=...`) com chave no fragmento `#k=`
 * e ativa o par de sincronização GM via `BroadcastChannel` quando suportado pelo navegador.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<string>} Link de convite gerado.
 */
export async function generateTableInvite(state, opts = {}) {
  const pair = state.vttKeypair || await generateVttKeypair();
  state.vttKeypair = pair;
  const roomKey = state.roomKey || generateRoomKey();
  state.roomKey = roomKey;
  const tableId = state.campaignId || state.tableId || "mesa-local";
  state.inviteHref = buildRoomInviteHref({ tableId, gmRouteId: pair.routeId, roomKey });
  if (!state.syncPeer && typeof globalThis.BroadcastChannel === "function") {
    const store = opts.store || getDefaultVttStore();
    const transport = createBroadcastChannelTransport(tableId, pair.routeId);
    state.syncPeer = createVttSyncPeer({ role: "gm", campaignId: tableId, keypair: pair, store, transport, roomKey });
  }
  return state.inviteHref;
}

async function resolveMapBitmap(scene, store) {
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  if (!floor?.mapBlobHash || typeof globalThis.createImageBitmap !== "function") return null;
  const bytes = await store.getBlob(floor.mapBlobHash);
  if (!bytes) return null;
  return globalThis.createImageBitmap(new Blob([bytes]));
}

/**
 * Monta e conecta o `<canvas>` 2D da Mesa (`renderSceneToCanvas` + `attachCanvasInput`) de forma idempotente.
 * @param {ParentNode} container Contêiner da tela da Mesa.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`, `onStateMutated`).
 * @returns {() => void} Função para desconectar listeners do canvas atual.
 */
export function mountSceneCanvas(container, state, opts = {}) {
  const canvas = container?.querySelector?.("#dungeon-vtt-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return () => {};
  const store = opts.store || getDefaultVttStore();
  let mapImage = null;
  let dragPreview = null;
  const draw = () => renderSceneToCanvas(canvas, getActiveScene(state), {
    camera: createCamera(state.camera),
    viewerRole: state.viewerRole === "gm" ? "gm" : "player",
    selectedTokenId: state.selectedTokenId || "",
    mapImage,
    dragPreview,
  });
  draw();
  resolveMapBitmap(getActiveScene(state), store).then((bmp) => { if (bmp) { mapImage = bmp; draw(); } }).catch(() => {});
  return attachCanvasInput(canvas, {
    getScene: () => getActiveScene(state),
    getCamera: () => createCamera(state.camera),
    getViewerRole: () => (state.viewerRole === "gm" ? "gm" : "player"),
    onCameraChange: (cam) => { state.camera = cam; draw(); },
    onSelectToken: (tokId) => { state.selectedTokenId = tokId; draw(); opts.onStateMutated?.(); },
    onDragPreview: (prev) => { dragPreview = prev; draw(); },
    onTokenMove: (tokId, x, y) => { moveTokenInScene(state, tokId, x, y, { store }).then(() => opts.onStateMutated?.()); },
  });
}
