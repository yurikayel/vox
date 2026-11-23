/**
 * @file Operações da Entrega 2 (Mapa 2D, tokens, portas, Camada GM, blobs de mapa, convite P2P e montagem do `<canvas>`).
 * @module dungeon/dungeon-scene-actions
 */
import { attachCanvasInput } from "./canvas-input.js";
import { renderSceneToCanvas } from "./canvas-renderer.js";
import {
  buildCampaignFromSession,
  dispatchCampaignOp,
  hydrateStateFromCampaign,
} from "./dungeon-sync-bridge.js";
import { clampTokenToFloor, clampZoom, createCamera } from "./vtt-geometry.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
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
  await dispatchCampaignOp(state, "SCENE_MAP_SET", {
    sceneId: scene.sceneId,
    floorZ: scene.activeFloorZ,
    mapBlobHash: saved.sha256,
    widthPx: fileSpec.widthPx,
    heightPx: fileSpec.heightPx,
  }, { store });
  state.mapNotice = saved.deduplicated
    ? `Mapa reutilizado sem duplicar disco (SHA-256 ${saved.sha256.slice(0, 10)}…).`
    : `Mapa salvo localmente (SHA-256 ${saved.sha256.slice(0, 10)}…).`;
  return saved;
}

function resolveTokenOwner(state, layer) {
  if (layer === "gm") return state.vttKeypair?.routeId || "gm";
  return state.vttKeypair?.routeId || state.localActor || "local";
}

/**
 * Adiciona um token na cena ativa (na camada `player` ou `gm`).
 * @param {object} state Estado da sessão.
 * @param {{ name: string, layer?: "player"|"gm", x?: number, y?: number, color?: string, hpMax?: number, sizeCells?: number }} rawToken Dados do token.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function addTokenToScene(state, rawToken, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const name = String(rawToken?.name || "").trim();
  if (!name) return scene;
  const layer = rawToken.layer === "gm" && state.viewerRole === "gm" ? "gm" : "player";
  const hpMax = Math.max(1, Math.trunc(Number(rawToken.hpMax) || 20));
  await dispatchCampaignOp(state, "TOKEN_UPSERT", {
    sceneId: scene.sceneId,
    token: {
      name,
      layer,
      x: rawToken.x ?? 1,
      y: rawToken.y ?? 1,
      color: rawToken.color,
      sizeCells: rawToken.sizeCells ?? 1,
      hpMax,
      hpCurrent: hpMax,
      ownerRouteId: resolveTokenOwner(state, layer),
    },
  }, { store });
  state.mapNotice = layer === "gm" ? `Token "${name}" adicionado à Camada do Mestre (oculto).` : `Token "${name}" adicionado ao mapa.`;
  return getActiveScene(state);
}

/**
 * Atualiza propriedades de combate de um token existente (PV, cor, tamanho, visibilidade de PV).
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {object} patch Campos parciais (`hpCurrent`, `hpMax`, `hpVisible`, `color`, `sizeCells`).
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function updateTokenPropsInScene(state, tokenId, patch = {}, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  const tok = (scene.tokens || []).find((t) => t.tokenId === tokenId);
  if (!tok) return scene;
  const hpMax = Math.max(1, Math.trunc(Number(patch.hpMax ?? tok.hpMax) || 20));
  const rawCur = patch.hpCurrent !== undefined ? Number(patch.hpCurrent) : Number(tok.hpCurrent ?? hpMax);
  const hpCurrent = Math.max(0, Math.min(hpMax, Number.isFinite(rawCur) ? Math.trunc(rawCur) : hpMax));
  await dispatchCampaignOp(state, "TOKEN_UPSERT", {
    sceneId: scene.sceneId,
    token: {
      ...tok,
      hpMax,
      hpCurrent,
      hpVisible: patch.hpVisible || tok.hpVisible,
      color: patch.color || tok.color,
      sizeCells: patch.sizeCells ? Math.max(1, Math.min(4, Math.trunc(Number(patch.sizeCells)))) : tok.sizeCells,
    },
  }, { store });
  state.mapNotice = `Token "${tok.name}" atualizado (${hpCurrent}/${hpMax} PV).`;
  return getActiveScene(state);
}

/**
 * Move um token para a célula `(x, y)` na cena ativa e persiste/sincroniza a operação.
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
  await dispatchCampaignOp(state, "TOKEN_MOVE", { sceneId: scene.sceneId, tokenId, x, y }, { store });
  if (tokenId === "tok-lyra") state.playerPos = { x: Math.max(0, Math.min(4, x)), y: Math.max(0, Math.min(4, y)) };
  return getActiveScene(state);
}

/**
 * Desloca um token em `(dx, dy)` células (suporte acessível por teclado/botões direcionais).
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {number} dx Deslocamento horizontal (`-1`, `0`, `1`).
 * @param {number} dy Deslocamento vertical (`-1`, `0`, `1`).
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function nudgeTokenInScene(state, tokenId, dx, dy, opts = {}) {
  const scene = getActiveScene(state);
  const tok = (scene.tokens || []).find((t) => t.tokenId === tokenId);
  if (!tok) return scene;
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  const next = clampTokenToFloor(tok.x + Number(dx || 0), tok.y + Number(dy || 0), tok.sizeCells, floor);
  return moveTokenInScene(state, tokenId, next.x, next.y, opts);
}

/**
 * Adiciona uma porta na grade do piso ativo (`DOOR_UPSERT`).
 * @param {object} state Estado da sessão.
 * @param {{ x1: number, y1: number, x2: number, y2: number, state?: string }} doorSpec Geometria e estado da porta.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function addDoorToScene(state, doorSpec, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  await dispatchCampaignOp(state, "DOOR_UPSERT", {
    sceneId: scene.sceneId,
    floorZ: scene.activeFloorZ,
    door: doorSpec,
  }, { store });
  state.mapNotice = `Porta (${doorSpec.state || "closed"}) adicionada ao piso.`;
  return getActiveScene(state);
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
  await dispatchCampaignOp(state, "TOKEN_LAYER_SET", { sceneId: scene.sceneId, tokenId, layer: nextLayer }, { store });
  state.mapNotice = nextLayer === "player"
    ? `Token "${tok.name}" revelado para os jogadores.`
    : `Token "${tok.name}" ocultado na Camada do Mestre.`;
  return getActiveScene(state);
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
  await dispatchCampaignOp(state, "TOKEN_REMOVE", { sceneId: scene.sceneId, tokenId }, { store });
  return getActiveScene(state);
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
  await dispatchCampaignOp(state, "SCENE_MAP_SET", { sceneId: scene.sceneId, floorZ: scene.activeFloorZ, grid: { type: nextType } }, { store });
  return getActiveScene(state);
}

async function ensurePersistedCampaignForHost(state, pair, store) {
  if (state.campaignId) {
    const cur = await store.loadCampaign(state.campaignId);
    if (cur) {
      if (cur.gmRouteId !== pair.routeId) {
        const updated = await store.saveCampaign({ ...cur, gmRouteId: pair.routeId });
        hydrateStateFromCampaign(state, updated);
      }
      return state.campaignId;
    }
  }
  const seeded = { ...buildCampaignFromSession(state), gmRouteId: pair.routeId };
  const saved = await store.saveCampaign(seeded);
  hydrateStateFromCampaign(state, saved);
  return saved.id;
}

/**
 * Gera um convite P2P local (`#/dungeon/entrar/:id?gm=...#k=...`), garante campanha salva no `VttStore`
 * e ativa o par de sincronização GM com broadcast ao vivo via `BroadcastChannel`.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`, `onSyncUpdate`).
 * @returns {Promise<string>} Link de convite gerado.
 */
export async function generateTableInvite(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const pair = state.vttKeypair || await generateVttKeypair();
  state.vttKeypair = pair;
  const roomKey = state.roomKey || generateRoomKey();
  state.roomKey = roomKey;
  const tableId = await ensurePersistedCampaignForHost(state, pair, store);
  state.inviteHref = buildRoomInviteHref({ tableId, gmRouteId: pair.routeId, roomKey });
  if (!state.syncPeer && typeof globalThis.BroadcastChannel === "function") {
    const transport = createBroadcastChannelTransport(tableId, pair.routeId);
    state.syncPeer = createVttSyncPeer({
      role: "gm",
      campaignId: tableId,
      keypair: pair,
      store,
      transport,
      roomKey,
      onUpdate: (camp) => {
        hydrateStateFromCampaign(state, camp);
        (state._onSyncUpdate || opts.onSyncUpdate)?.(camp);
      },
      onPeerCountChange: (count) => {
        state.connectedPeersCount = count;
        (state._onSyncUpdate || opts.onSyncUpdate)?.();
      },
    });
  }
  state.campaignNotice = "Convite P2P ativo: a mesa sincroniza alterações com abas convidadas.";
  return state.inviteHref;
}

/**
 * Calcula câmera ajustada (`fit`) para enquadrar o piso inteiro no tamanho atual do `<canvas>`.
 * @param {HTMLCanvasElement|object} canvas Elemento `<canvas>`.
 * @param {object} floor Piso ativo (`widthPx`, `heightPx`).
 * @returns {{ panX: number, panY: number, zoom: number }} Câmera centralizada.
 */
export function computeFitCamera(canvas, floor) {
  const cssW = Math.max(240, Number(canvas?.clientWidth || canvas?.width) || 768);
  const cssH = Math.max(180, Number(canvas?.clientHeight || canvas?.height) || 420);
  const fw = Math.max(256, Number(floor?.widthPx) || 768);
  const fh = Math.max(256, Number(floor?.heightPx) || 576);
  const zoom = clampZoom(Math.min((cssW - 16) / fw, (cssH - 16) / fh, 1));
  return {
    zoom,
    panX: Math.round((cssW - fw * zoom) / 2),
    panY: Math.round((cssH - fh * zoom) / 2),
  };
}

async function resolveMapBitmap(scene, store) {
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  if (!floor?.mapBlobHash || typeof globalThis.createImageBitmap !== "function") return null;
  const bytes = await store.getBlob(floor.mapBlobHash);
  if (!bytes) return null;
  return globalThis.createImageBitmap(new Blob([bytes]));
}

function syncZoomBadge(container, zoom) {
  const el = container?.querySelector?.("[data-dungeon-zoom-label]");
  if (el) el.textContent = `${Math.round((Number(zoom) || 1) * 100)}%`;
}

function buildCanvasCallbacks(container, state, ov, draw, opts) {
  const store = opts.store || getDefaultVttStore();
  const refresh = () => opts.onStateMutated?.();
  return {
    getScene: () => getActiveScene(state),
    getCamera: () => createCamera(state.camera),
    getViewerRole: () => (state.viewerRole === "gm" ? "gm" : "player"),
    getTool: () => state.activeTool || "select",
    onCameraChange: (cam) => { state.camera = cam; state._cameraTouched = true; syncZoomBadge(container, cam.zoom); draw(); },
    onSelectToken: (tokId) => { state.selectedTokenId = tokId; draw(); },
    onSelectCommitted: (tokId) => { state.selectedTokenId = tokId; refresh(); },
    onDragPreview: (prev) => { ov.dragPreview = prev; draw(); },
    onTokenMove: (tokId, x, y) => { moveTokenInScene(state, tokId, x, y, { store }).then(refresh); },
    onRulerChange: (r) => { ov.ruler = r; draw(); },
    onDraftStroke: (s) => { ov.draftStroke = s; draw(); },
    onFogPreview: (r) => { ov.draftFogRect = r; draw(); },
    onAoePreview: (a) => { ov.draftAoe = a; draw(); },
    onDoorToggle: (id) => { opts.onDoorToggle?.(id)?.then?.(refresh); },
    onDrawingCommit: (pts) => { opts.onDrawingCommit?.(pts)?.then?.(refresh); },
    onFogReveal: (rect) => { opts.onFogReveal?.(rect)?.then?.(refresh); },
    onAoeCommit: (aoe) => { opts.onAoeCommit?.(aoe)?.then?.(refresh); },
  };
}

function maybeApplyInitialFitCamera(container, canvas, state, scene) {
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  if (!state._cameraTouched && floor && canvas.clientWidth && canvas.clientHeight) {
    state.camera = computeFitCamera(canvas, floor);
    syncZoomBadge(container, state.camera.zoom);
  }
}

function observeCanvasResize(canvas, onResize) {
  if (typeof globalThis.ResizeObserver !== "function") return () => {};
  const ro = new globalThis.ResizeObserver(() => onResize());
  ro.observe(canvas);
  return () => ro.disconnect?.();
}

/**
 * Monta e conecta o `<canvas>` 2D da Mesa (`renderSceneToCanvas` + `attachCanvasInput` + `ResizeObserver`) de forma idempotente.
 * @param {ParentNode} container Contêiner da tela da Mesa.
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`store`, `onStateMutated`, callbacks táticos).
 * @returns {() => void} Função para desconectar listeners e observadores do canvas atual.
 */
export function mountSceneCanvas(container, state, opts = {}) {
  const canvas = container?.querySelector?.("#dungeon-vtt-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return () => {};
  const store = opts.store || getDefaultVttStore();
  const scene = getActiveScene(state);
  maybeApplyInitialFitCamera(container, canvas, state, scene);
  const ov = { mapImage: null, dragPreview: null, draftStroke: null, draftFogRect: null, draftAoe: null, ruler: null };
  /**
   * Redesenha a cena ativa no canvas com a câmera e o estado de sobreposição atuais.
   *
   * @returns {void}
   */
  const draw = () => renderSceneToCanvas(canvas, getActiveScene(state), {
    camera: createCamera(state.camera),
    viewerRole: state.viewerRole === "gm" ? "gm" : "player",
    selectedTokenId: state.selectedTokenId || "",
    notes: state.notes || [],
    ...ov,
  });
  draw();
  resolveMapBitmap(scene, store).then((bmp) => { if (bmp) { ov.mapImage = bmp; draw(); } }).catch(() => {});
  const detachInput = attachCanvasInput(canvas, buildCanvasCallbacks(container, state, ov, draw, opts));
  const detachResize = observeCanvasResize(canvas, draw);
  return () => {
    detachInput();
    detachResize();
  };
}
