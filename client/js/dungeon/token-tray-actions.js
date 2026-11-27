/**
 * @file Bandeja de tokens do Mestre (SUB-26): "Adicionar ao mapa" a partir das fichas da mesa ou de um token simples.
 * Usa só a op que já existe (`TOKEN_UPSERT`); só o Mestre adiciona. O token entra na primeira célula livre do andar.
 * @module dungeon/token-tray-actions
 */
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { addTokenToScene, getActiveScene } from "./dungeon-scene-actions.js";
import { getDefaultVttStore } from "./vtt-store.js";

const DEFAULT_HP = 20;

/**
 * Primeira célula livre do andar ativo (varre linha a linha, da esquerda para a direita). Sem célula livre, a origem.
 * @param {{floors: object[], activeFloorZ?: number, tokens?: object[]}} scene Cena ativa.
 * @returns {{x: number, y: number}} Coluna e linha.
 */
export function firstFreeCell(scene) {
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ) || scene.floors[0];
  const cell = Number(floor.grid?.cellPx) || 64;
  const cols = Math.max(1, Math.floor(floor.widthPx / cell));
  const rows = Math.max(1, Math.floor(floor.heightPx / cell));
  const taken = new Set((scene.tokens || []).filter((t) => t.floorZ === floor.z).map((t) => `${t.x},${t.y}`));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) if (!taken.has(`${x},${y}`)) return { x, y };
  }
  return { x: 0, y: 0 };
}

function sheetToken(state, sheetId) {
  const sheet = state.campaign?.sheetsById?.[sheetId];
  if (!sheet) return null;
  const hp = Math.trunc(Number(sheet.pools_base?.hp_max));
  const hpMax = hp > 0 ? hp : DEFAULT_HP;
  const name = String(sheet.attributes_lww?.name || sheet.name || "Ficha").trim().slice(0, 48) || "Ficha";
  return { name, sheetId, layer: "player", hpMax, hpCurrent: hpMax };
}

function simpleToken(spec) {
  const name = String(spec.name || "").trim().slice(0, 48) || "Token";
  return { name, layer: spec.hidden ? "gm" : "player", hpMax: DEFAULT_HP, hpCurrent: DEFAULT_HP };
}

function onMapAlready(scene, sheetId) {
  return (scene.tokens || []).some((t) => t.sheetId === sheetId);
}

/**
 * Adiciona um token à cena ativa pela bandeja. Só o Mestre: qualquer outro papel não muda nada. Ficha que já tem token
 * na cena não ganha um segundo. O dono do token é a rota do Mestre, então a bandeja não concede posse da ficha a ninguém.
 * @param {object} state Estado da sessão.
 * @param {{kind: "sheet"|"simple", sheetId?: string, name?: string, hidden?: boolean}} spec O que adicionar.
 * @param {{store?: object}} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena ativa depois da operação.
 */
export async function addTrayToken(state, spec, opts = {}) {
  const scene = getActiveScene(state);
  if (state.viewerRole !== "gm") return scene;
  if (spec.kind === "sheet" && onMapAlready(scene, spec.sheetId)) {
    state.mapNotice = "Essa ficha já está no mapa.";
    return scene;
  }
  const token = spec.kind === "sheet" ? sheetToken(state, spec.sheetId) : simpleToken(spec);
  if (!token) return scene;
  const at = firstFreeCell(scene);
  const ownerRouteId = state.vttKeypair?.routeId || "gm";
  await dispatchCampaignOp(state, "TOKEN_UPSERT", { sceneId: scene.sceneId, token: { ...token, ...at, ownerRouteId } }, { store: opts.store || getDefaultVttStore() });
  state.mapNotice = token.layer === "gm" ? `Token "${token.name}" adicionado à Camada do Mestre (oculto).` : `Token "${token.name}" adicionado ao mapa.`;
  return getActiveScene(state);
}

/**
 * Clique em "Adicionar ao mapa" da bandeja (`data-dungeon="tray-add"`).
 * @param {object} state Estado da sessão.
 * @param {HTMLElement} el Botão clicado (`data-tray-kind`, `data-sheet-id`).
 * @param {{store?: object}} [opts={}] Opções da tela (`store`).
 * @returns {Promise<object>} Cena ativa depois da operação.
 */
export function handleTrayAdd(state, el, opts = {}) {
  const root = el.closest?.("[data-token-tray]");
  const spec = el.dataset.trayKind === "sheet"
    ? { kind: "sheet", sheetId: el.dataset.sheetId || "" }
    : { kind: "simple", name: root?.querySelector?.("#dungeon-tray-name")?.value, hidden: Boolean(root?.querySelector?.("#dungeon-tray-hidden")?.checked) };
  return addTrayToken(state, spec, { store: opts.store });
}

/**
 * Envio do formulário "Adicionar Token" da Mesa (nome e camada).
 * @param {object} state Estado da sessão.
 * @param {HTMLFormElement|object} form Formulário.
 * @param {{ viewOpts: object, settle: (p: Promise<any>, o?: object) => any }} ctx Contexto de redraw.
 * @returns {Promise<any>|undefined} Promessa de liquidação, ou `undefined` sem nome.
 */
export function submitAddToken(state, form, ctx) {
  const name = String(form?.querySelector?.("#dungeon-token-name")?.value ?? "").trim();
  const layer = String(form?.querySelector?.("#dungeon-token-layer")?.value ?? "player").trim();
  return name ? ctx.settle(addTokenToScene(state, { name, layer }, { store: ctx.viewOpts.store })) : undefined;
}
