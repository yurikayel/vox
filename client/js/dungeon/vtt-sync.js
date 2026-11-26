/**
 * @file Protocolo de sincronização P2P da Mesa Soberana (E2): sala por `roomKey`,
 * filtro Zero-Spoiler antes da serialização (`SNAPSHOT_FILTERED` e `COMMIT_OP`),
 * verificação ECDSA P-256 (`INV-7`) e replicação sob demanda de blobs (`WANT_BLOB`).
 * @module dungeon/vtt-sync
 */
import { isAuthorizedVttOp, projectStateForPlayer } from "./vtt-reducer.js";
import { collectFairplayOps, limitFairplayOps, normalizeFairplayState } from "./vtt-fairplay-log.js";
import { rebuildFairplayState } from "./vtt-fairplay-rebuild.js";
import { isFairplayLabEnabled } from "./vtt-fairplay-selo.js";
import { createVttOp } from "./vtt-schema.js";
import { isDoorRevealedByFog, isTokenRevealedByFog } from "./vtt-tactics-geometry.js";
import {
  createBlobAssembler,
  signVttOp,
  splitBlobIntoChunks,
  verifyVttOpSignature,
} from "./vtt-sync-codec.js";

/**
 * Cria um barramento em memória para conectar 2+ pares P2P em testes determinísticos sem rede.
 * @returns {{ connect: (peerId: string) => object }} Fábrica de transportes por par.
 */
export function createInMemorySyncHub() {
  const peers = new Map();
  return {
    connect(peerId) {
      const handlers = new Set();
      peers.set(peerId, handlers);
      return {
        peerId,
        send(toPeerId, msg) {
          const payload = structuredClone({ ...msg, from: peerId });
          if (toPeerId === "*") {
            for (const [id, set] of peers.entries()) {
              if (id !== peerId) set.forEach((fn) => fn(payload));
            }
            return;
          }
          peers.get(toPeerId)?.forEach((fn) => fn(payload));
        },
        onMessage(fn) {
          handlers.add(fn);
          return () => handlers.delete(fn);
        },
        close() {
          handlers.clear();
          peers.delete(peerId);
        },
      };
    },
  };
}

/**
 * Cria um transporte local baseado em `BroadcastChannel` para sincronizar abas do mesmo navegador.
 * @param {string} roomId Identificador lógico da sala (`tableId`).
 * @param {string} peerId Identificador `routeId` local.
 * @returns {object} Transporte compatível com `createVttSyncPeer`.
 */
export function createBroadcastChannelTransport(roomId, peerId) {
  if (typeof globalThis.BroadcastChannel !== "function") {
    throw new Error("BroadcastChannel indisponível neste ambiente.");
  }
  const ch = new globalThis.BroadcastChannel(`vox-vtt-room-${roomId}`);
  const handlers = new Set();
  ch.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.from === peerId) return;
    if (msg.to && msg.to !== "*" && msg.to !== peerId) return;
    handlers.forEach((fn) => fn(msg));
  };
  return {
    peerId,
    send(toPeerId, msg) { ch.postMessage({ ...msg, from: peerId, to: toPeerId }); },
    onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    close() { handlers.clear(); ch.close(); },
  };
}

function collectReferencedBlobHashes(campaign) {
  const hashes = new Set();
  for (const scene of Object.values(campaign?.scenesById || {})) {
    for (const f of scene.floors || []) if (f.mapBlobHash) hashes.add(f.mapBlobHash);
    for (const t of scene.tokens || []) if (t.avatarBlobHash) hashes.add(t.avatarBlobHash);
  }
  return hashes;
}

function findSceneToken(campaign, op) {
  const scene = campaign?.scenesById?.[op.payload?.sceneId || campaign.activeSceneId];
  const tokenId = op.payload?.tokenId || op.payload?.token?.tokenId;
  const tok = scene?.tokens?.find((t) => t.tokenId === tokenId);
  const floor = scene?.floors?.find((f) => f.z === tok?.floorZ);
  return { tok, floor };
}

/** Token fora da névoa revelada não segue como delta: quem já o via recebe um novo snapshot sem ele. */
function filterTokenMove(campaign, op) {
  const { tok, floor } = findSceneToken(campaign, op);
  if (!tok || tok.layer !== "player") return null;
  if (floor?.fog?.enabled) return { refreshSnapshot: true };
  return isTokenRevealedByFog(tok, floor) ? op : { refreshSnapshot: true };
}

function filterTokenChangeFloor(campaign, op) {
  const { tok } = findSceneToken(campaign, op);
  return tok?.layer === "gm" ? null : { refreshSnapshot: true };
}

function filterTokenUpsert(campaign, op) {
  if (op.payload?.token?.layer === "gm") return null;
  const { tok, floor } = findSceneToken(campaign, op);
  return !tok || isTokenRevealedByFog(tok, floor) ? op : { refreshSnapshot: true };
}

function filterDoorUpsert(campaign, op) {
  const door = op.payload?.door;
  if (door?.state === "secret") return null;
  const scene = campaign?.scenesById?.[op.payload?.sceneId || campaign.activeSceneId];
  const floor = scene?.floors?.find((f) => f.z === (op.payload?.floorZ ?? scene.activeFloorZ));
  return !door || !floor || isDoorRevealedByFog(door, floor) ? op : { refreshSnapshot: true };
}

function filterRollOp(_campaign, op, viewerRouteId) {
  const vis = op.payload?.rollResult?.visibility || op.payload?.visibility || "public";
  if (vis === "blind") return null;
  if (vis === "gm" && op.actor !== viewerRouteId) return null;
  return op;
}

const OP_FILTERS = {
  TOKEN_LAYER_SET: () => ({ refreshSnapshot: true }),
  TOKEN_UPSERT: filterTokenUpsert,
  TOKEN_MOVE: filterTokenMove,
  TOKEN_REMOVE: () => ({ refreshSnapshot: true }),
  TOKEN_CHANGE_FLOOR: filterTokenChangeFloor,
  DOOR_UPSERT: filterDoorUpsert,
  FOG_SET: () => ({ refreshSnapshot: true }),
  DOOR_STATE_SET: () => ({ refreshSnapshot: true }),
  DRAWING_ADD: (_c, op) => (op.payload?.drawing?.layer === "gm" ? null : op),
  AOE_UPSERT: (_c, op) => (op.payload?.aoe?.layer === "gm" ? null : op),
  INITIATIVE_SET_ENTRY: () => ({ refreshSnapshot: true }),
  INITIATIVE_NEXT: () => ({ refreshSnapshot: true }),
  NOTE_UPSERT: (_c, op) => (op.payload?.note ? { ...op, payload: { ...op.payload, note: { ...op.payload.note, gmSecretMarkdown: "" } } } : op),
  SHEET_UPSERT: (_c, op) => (op.payload?.sheet?.sheet_meta ? { ...op, payload: { ...op.payload, sheet: { ...op.payload.sheet, sheet_meta: { ...op.payload.sheet.sheet_meta, notes_gm: "" } } } } : op),
  ROLL_RECORDED: filterRollOp,
};

/**
 * Filtra ou sanitiza uma operação `VttOp` antes do envio a um jogador (Zero-Spoiler).
 * Retorna `null` se a operação não deve ser enviada diretamente (ou `{ refreshSnapshot: true }`).
 * @param {object} campaign Estado completo da campanha no Mestre.
 * @param {object} op Operação já aplicada no Mestre.
 * @param {string} viewerRouteId Identidade do jogador destinatário.
 * @returns {object|null} Operação segura para envio, `{ refreshSnapshot: true }`, ou `null`.
 */
export function filterOpForPlayer(campaign, op, viewerRouteId) {
  if (!op?.type) return null;
  const fn = OP_FILTERS[op.type];
  return fn ? fn(campaign, op, viewerRouteId) : op;
}

function isAdmittedIn(ctx, campaign, actor) {
  return actor === ctx.keypair.routeId || Object.hasOwn(campaign?.fairplay?.admitted || {}, actor);
}

async function sendFilteredSnapshot(ctx, toPeerId) {
  const full = await ctx.store.loadCampaign(ctx.campaignId);
  if (!full) return;
  const projected = projectStateForPlayer(full, "player", toPeerId);
  ctx.transport.send(toPeerId, { kind: "SNAPSHOT_FILTERED", roomKey: ctx.roomKey, campaign: { ...projected, fairplay: normalizeFairplayState(null) }, fairplayOps: collectFairplayOps(full.fairplay) });
}

async function broadcastCommittedOp(ctx, fullCampaign, op) {
  for (const peerId of ctx.connectedPlayers) {
    const filtered = filterOpForPlayer(fullCampaign, op, peerId);
    if (!filtered) continue;
    if (filtered.refreshSnapshot) {
      await sendFilteredSnapshot(ctx, peerId);
    } else {
      ctx.transport.send(peerId, { kind: "COMMIT_OP", roomKey: ctx.roomKey, op: filtered });
    }
  }
}

async function handleGmWantBlob(ctx, msg) {
  const full = await ctx.store.loadCampaign(ctx.campaignId);
  const allowed = collectReferencedBlobHashes(projectStateForPlayer(full, "player", msg.from));
  if (!allowed.has(msg.sha256)) return;
  const bytes = await ctx.store.getBlob(msg.sha256);
  if (!bytes) return;
  for (const chunk of splitBlobIntoChunks(msg.sha256, bytes)) {
    ctx.transport.send(msg.from, { ...chunk, roomKey: ctx.roomKey });
  }
}

/** Tolerância (ms) entre o relógio do autor de uma op Fairplay e o do Mestre; o prazo das fases não depende de um `ts` livre. */
export const FAIRPLAY_TS_TOLERANCE_MS = 5000;

function isFairplayOp(op) {
  return String(op?.type || "").startsWith("FAIRPLAY_");
}

function tsOutOfRange(ctx, op) {
  return isFairplayOp(op) && !(Math.abs(Number(op.ts) - ctx.now()) <= FAIRPLAY_TS_TOLERANCE_MS);
}

/**
 * Registra no log a admissão de quem entra na mesa, antes de qualquer op dele: assim o `lamport` da admissão
 * é menor que o das ops seguintes do jogador e a ordem do replay é a mesma da chegada.
 */
async function admitJoiningPlayer(ctx, peerId) {
  const current = await ctx.store.loadCampaign(ctx.campaignId);
  if (isAdmittedIn(ctx, current, peerId)) return;
  if (ctx.refusedFairplay.has(peerId)) return; // recusado: um novo pedido não o devolve à fila
  if (isFairplayLabEnabled(ctx.storage)) {
    ctx.pendingFairplay.add(peerId); // com a flag ligada, quem entra espera a aprovação do Mestre
    ctx.onFairplayAccessChange?.();
    return;
  }
  await dispatchSyncOp(ctx, { type: "FAIRPLAY_ADMIT", payload: { actor: peerId } });
}

/** Aprova um par pendente (só Mestre, só com a flag ligada): grava `FAIRPLAY_ADMIT` no log. */
async function approveFairplayPeer(ctx, routeId) {
  if (ctx.role !== "gm" || !isFairplayLabEnabled(ctx.storage) || !ctx.pendingFairplay.has(routeId)) return false;
  ctx.pendingFairplay.delete(routeId);
  await dispatchSyncOp(ctx, { type: "FAIRPLAY_ADMIT", payload: { actor: routeId } });
  ctx.onFairplayAccessChange?.();
  return true;
}

/**
 * Recusa um par pendente (só Mestre, só com a flag ligada): sai da fila, fica em `refusedFairplay` e o pedido de
 * chave dele volta como `OP_REJECTED` com motivo `revoked`. Recusar quem não está pendente (ou já foi recusado) não muda nada.
 */
async function refuseFairplayPeer(ctx, routeId) {
  if (ctx.role !== "gm" || !isFairplayLabEnabled(ctx.storage) || !ctx.pendingFairplay.has(routeId)) return false;
  ctx.pendingFairplay.delete(routeId);
  ctx.refusedFairplay.add(routeId);
  const opId = ctx.keyOpByActor.get(routeId) || "";
  ctx.transport.send(routeId, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId, reason: "revoked" });
  ctx.onFairplayAccessChange?.();
  return true;
}

/** Revoga um par (só Mestre, só com a flag ligada): grava `FAIRPLAY_REVOKE`; o reducer ignora par desconhecido ou repetido. */
async function revokeFairplayPeer(ctx, routeId) {
  if (ctx.role !== "gm" || !isFairplayLabEnabled(ctx.storage)) return false;
  ctx.pendingFairplay.delete(routeId);
  await dispatchSyncOp(ctx, { type: "FAIRPLAY_REVOKE", payload: { actor: routeId } });
  return true;
}

function isRevokedIn(campaign, actor) {
  return Object.hasOwn(campaign?.fairplay?.revoked || {}, actor);
}

/** Motivo da recusa de uma op Fairplay com assinatura válida (par revogado ou não admitido), ou `null`. */
function fairplayRefusal(ctx, current, op) {
  if (isFairplayOp(op) && isRevokedIn(current, op.actor)) return "revoked";
  if (op.type === "FAIRPLAY_KEY" && ctx.refusedFairplay.has(op.actor)) return "revoked"; // entrada recusada pelo Mestre (ADR-040 §3.1)
  if (op.type === "FAIRPLAY_KEY" && !isAdmittedIn(ctx, current, op.actor)) return "not_admitted";
  return null;
}

function rejectOp(ctx, msg, reason) {
  ctx.transport.send(msg.from, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId: msg.op.opId, reason });
}

async function handleGmActionOp(ctx, msg) {
  if (tsOutOfRange(ctx, msg.op)) return rejectOp(ctx, msg, "ts_out_of_range");
  const validSig = await verifyVttOpSignature(msg.op);
  const current = await ctx.store.loadCampaign(ctx.campaignId);
  const refusal = validSig ? fairplayRefusal(ctx, current, msg.op) : null;
  if (refusal === "not_admitted") ctx.keyOpByActor.set(msg.op.actor, msg.op.opId); // para avisar este pedido se o Mestre recusar depois
  if (refusal) return rejectOp(ctx, msg, refusal);
  if (!validSig || !isAuthorizedVttOp(current, msg.op)) return rejectOp(ctx, msg, validSig ? "unauthorized" : "invalid_signature");
  const res = await ctx.store.appendOp(ctx.campaignId, msg.op);
  if (!res.duplicate) {
    await broadcastCommittedOp(ctx, res.campaign, msg.op);
    ctx.onUpdate?.(res.campaign);
  } else if (!current?.appliedOpIds?.includes(msg.op.opId)) {
    // Recusada pelo reducer (ex.: Fairplay fora de fase ou com lamport atrasado): o par precisa saber para assinar de novo.
    rejectOp(ctx, msg, "out_of_phase");
  }
  return undefined;
}

async function handleGmMessage(ctx, msg) {
  if (msg.kind === "HELLO_SYNC" && msg.from) {
    if (!ctx.connectedPlayers.has(msg.from)) {
      ctx.connectedPlayers.add(msg.from);
      ctx.onPeerCountChange?.(ctx.connectedPlayers.size);
    }
    await admitJoiningPlayer(ctx, msg.from);
    await sendFilteredSnapshot(ctx, msg.from);
    return;
  }
  if (msg.kind === "WANT_BLOB" && msg.sha256 && msg.from) return handleGmWantBlob(ctx, msg);
  if (msg.kind === "ACTION_OP" && msg.op) return handleGmActionOp(ctx, msg);
  return undefined;
}

async function requestMissingBlobs(ctx, campaign, fromGm) {
  for (const hash of collectReferencedBlobHashes(campaign)) {
    const local = await ctx.store.getBlob(hash);
    if (!local) ctx.transport.send(fromGm, { kind: "WANT_BLOB", roomKey: ctx.roomKey, sha256: hash });
  }
}

/** Aplica o teto do Mestre e confere a assinatura de cada op de Fairplay recebida. */
async function verifiedFairplayOps(raw) {
  const ok = [];
  for (const op of limitFairplayOps(raw)) if (await verifyVttOpSignature(op)) ok.push(op);
  return ok;
}

/** O estado Fairplay do snapshot nunca é usado: ele é refeito, de uma vez, das ops assinadas e reverificadas. */
async function applySnapshot(ctx, msg) {
  ctx.snapshotAsked = false;
  stopHelloRetry(ctx);
  const ops = await verifiedFairplayOps(msg.fairplayOps);
  const saved = await ctx.store.saveCampaign(rebuildFairplayState(msg.campaign, ops));
  await requestMissingBlobs(ctx, saved, msg.from);
  ctx.onUpdate?.(saved);
}

/** Op recusada na chegada (fora de ordem ou de fase): pede o estado do Mestre em vez de descartar em silêncio. */
function askSnapshotOnce(ctx) {
  if (ctx.snapshotAsked) return;
  ctx.snapshotAsked = true;
  ctx.transport.send(ctx.gmRouteId, { kind: "HELLO_SYNC", roomKey: ctx.roomKey });
}

async function applyCommittedOp(ctx, msg) {
  if (isFairplayOp(msg.op) && !(await verifyVttOpSignature(msg.op))) return;
  const before = await ctx.store.loadCampaign(ctx.campaignId);
  if (!before) return; // ainda sem campanha: o snapshot do Mestre traz esta op
  const res = await ctx.store.appendOp(ctx.campaignId, msg.op).catch(() => null);
  if (res?.campaign && !res.duplicate) {
    await requestMissingBlobs(ctx, res.campaign, msg.from);
    ctx.onUpdate?.(res.campaign);
  } else if (res?.duplicate && !before?.appliedOpIds?.includes(msg.op.opId)) {
    askSnapshotOnce(ctx);
  }
}

async function handlePlayerMessage(ctx, msg) {
  const fromGm = msg.from === ctx.gmRouteId;
  if (msg.kind === "SNAPSHOT_FILTERED" && msg.campaign) {
    if (fromGm) await applySnapshot(ctx, msg);
    return;
  }
  if (msg.kind === "COMMIT_OP" && msg.op) {
    if (fromGm) await applyCommittedOp(ctx, msg);
    return;
  }
  if (msg.kind === "BLOB_CHUNK") {
    const res = await ctx.assembler.pushChunk(msg);
    if (res.complete && res.bytes) {
      await ctx.store.putBlob(res.bytes);
      ctx.onBlobReceived?.(res.sha256);
    }
    return;
  }
  if (msg.kind === "OP_REJECTED") {
    if (msg.reason === "revoked") stopHelloRetry(ctx); // recusa da entrada: insistir não muda a resposta; outra op recusada não é isso
    ctx.onRejected?.(msg);
  }
}

async function dispatchSyncOp(ctx, rawOp) {
  const cur = await ctx.store.loadCampaign(ctx.campaignId);
  const op = await signVttOp(createVttOp({ ...rawOp, lamport: (cur?.lamport || 0) + 1 }), ctx.keypair);
  if (ctx.role === "gm") {
    const res = await ctx.store.appendOp(ctx.campaignId, op);
    await broadcastCommittedOp(ctx, res.campaign, op);
    ctx.onUpdate?.(res.campaign);
    return res.campaign;
  }
  ctx.transport.send(ctx.gmRouteId, { kind: "ACTION_OP", roomKey: ctx.roomKey, op });
  return op;
}

/**
 * Reenvios do HELLO_SYNC quando o Mestre ainda não escuta (sob carga): 1 envio + até 4 reenvios, com espera dobrando
 * (400, 800, 1600, 3200 ms) e uma espera final de 6400 ms antes de desistir: ~12,4 s no total. Ao desistir, só
 * chama `onHelloGaveUp`; o aviso ao jogador na interface fica para o SUB-03 (estado honesto do jogador).
 */
export const HELLO_RETRY_LIMIT = 4;
const HELLO_BACKOFF_MS = 400;

function stopHelloRetry(ctx) {
  if (ctx.helloTimer != null) ctx.cancel(ctx.helloTimer);
  ctx.helloTimer = null;
}

function giveUpHello(ctx, reason) {
  stopHelloRetry(ctx);
  ctx.onHelloGaveUp?.({ reason });
}

function sendHello(ctx) {
  try {
    ctx.transport.send(ctx.gmRouteId, { kind: "HELLO_SYNC", roomKey: ctx.roomKey });
    return true;
  } catch {
    giveUpHello(ctx, "error");
    return false;
  }
}

function scheduleHelloRetry(ctx) {
  ctx.helloTimer = ctx.schedule(() => {
    ctx.helloTimer = null;
    if (ctx.helloAttempts >= HELLO_RETRY_LIMIT) return giveUpHello(ctx, "no_response");
    ctx.helloAttempts += 1;
    if (sendHello(ctx)) scheduleHelloRetry(ctx);
    return undefined;
  }, HELLO_BACKOFF_MS * 2 ** ctx.helloAttempts);
}

/** Entra na mesa: envia o HELLO_SYNC e o repete, com limite, até o estado chegar, uma recusa final ou um erro. */
function startHelloRetry(ctx) {
  stopHelloRetry(ctx);
  ctx.helloAttempts = 0;
  if (sendHello(ctx)) scheduleHelloRetry(ctx);
}

function buildSyncContext(opts) {
  return {
    role: opts.role === "gm" ? "gm" : "player",
    campaignId: opts.campaignId,
    keypair: opts.keypair,
    store: opts.store,
    transport: opts.transport,
    roomKey: opts.roomKey,
    gmRouteId: opts.gmRouteId || opts.keypair.routeId,
    connectedPlayers: new Set(),
    pendingFairplay: new Set(opts.pendingFairplay || []),
    refusedFairplay: new Set(),
    keyOpByActor: new Map(),
    onFairplayAccessChange: opts.onFairplayAccessChange,
    storage: opts.storage,
    snapshotAsked: false,
    helloAttempts: 0,
    helloTimer: null,
    schedule: typeof opts.schedule === "function" ? opts.schedule : (fn, ms) => setTimeout(fn, ms),
    cancel: typeof opts.cancel === "function" ? opts.cancel : (h) => clearTimeout(h),
    onHelloGaveUp: opts.onHelloGaveUp,
    now: typeof opts.now === "function" ? opts.now : Date.now,
    assembler: createBlobAssembler(),
    onUpdate: opts.onUpdate,
    onBlobReceived: opts.onBlobReceived,
    onRejected: opts.onRejected,
    onPeerCountChange: opts.onPeerCountChange,
  };
}

/**
 * Instancia um par P2P da Mesa Soberana (`"gm"` ou `"player"`) sobre qualquer transporte compatível.
 * @param {object} opts Opções (`onFairplayAccessChange` (fila de pedidos mudou), `pendingFairplay` (fila inicial, para testes), `schedule`, `cancel` e `onHelloGaveUp` opcionais: reenvio do HELLO_SYNC do jogador; `storage` opcional: armazenamento da flag `vox.lab.fairplay`; `role`, `campaignId`, `keypair`, `store`, `transport`, `roomKey`, `gmRouteId`, `onUpdate`, `onBlobReceived`, `onRejected`, `onPeerCountChange`, `now` relógio injetável).
 * @returns {{ routeId: string, getPendingFairplayPeers: () => string[], approveFairplayPeer: (routeId: string) => Promise<boolean>, refuseFairplayPeer: (routeId: string) => Promise<boolean>, revokeFairplayPeer: (routeId: string) => Promise<boolean>, join: () => void, dispatchOp: (rawOp: object) => Promise<object>, getPeerCount: () => number, flush: () => Promise<void>, close: () => void }} Controlador do par P2P.
 */
export function createVttSyncPeer(opts) {
  const ctx = buildSyncContext(opts);
  let chain = Promise.resolve();
  const detach = ctx.transport.onMessage((msg) => {
    if (!msg || msg.roomKey !== ctx.roomKey) return;
    chain = chain
      .then(() => (ctx.role === "gm" ? handleGmMessage(ctx, msg) : handlePlayerMessage(ctx, msg)))
      .catch(() => {});
  });
  return {
    join: () => { if (ctx.role === "player") startHelloRetry(ctx); },
    dispatchOp: (rawOp) => dispatchSyncOp(ctx, rawOp),
    routeId: ctx.keypair.routeId,
    getPendingFairplayPeers: () => [...ctx.pendingFairplay],
    approveFairplayPeer: (routeId) => approveFairplayPeer(ctx, String(routeId)),
    refuseFairplayPeer: (routeId) => refuseFairplayPeer(ctx, String(routeId)),
    revokeFairplayPeer: (routeId) => revokeFairplayPeer(ctx, String(routeId)),
    getPeerCount: () => ctx.connectedPlayers.size,
    flush: () => chain,
    close: () => { stopHelloRetry(ctx); detach(); ctx.transport.close?.(); },
  };
}
