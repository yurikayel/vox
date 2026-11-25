/**
 * @file Protocolo de sincronização P2P da Mesa Soberana (E2): sala por `roomKey`,
 * filtro Zero-Spoiler antes da serialização (`SNAPSHOT_FILTERED` e `COMMIT_OP`),
 * verificação ECDSA P-256 (`INV-7`) e replicação sob demanda de blobs (`WANT_BLOB`).
 * @module dungeon/vtt-sync
 */
import { isAuthorizedVttOp, projectStateForPlayer } from "./vtt-reducer.js";
import { collectFairplayOps, limitFairplayOps, normalizeFairplayState } from "./vtt-fairplay-log.js";
import { rebuildFairplayState } from "./vtt-fairplay-rebuild.js";
import { createVttOp } from "./vtt-schema.js";
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

function filterTokenMove(campaign, op) {
  const scene = campaign?.scenesById?.[op.payload?.sceneId || campaign.activeSceneId];
  const tok = scene?.tokens?.find((t) => t.tokenId === op.payload?.tokenId);
  return tok && tok.layer === "player" ? op : null;
}

function filterRollOp(_campaign, op, viewerRouteId) {
  const vis = op.payload?.rollResult?.visibility || op.payload?.visibility || "public";
  if (vis === "blind") return null;
  if (vis === "gm" && op.actor !== viewerRouteId) return null;
  return op;
}

const OP_FILTERS = {
  TOKEN_LAYER_SET: () => ({ refreshSnapshot: true }),
  TOKEN_UPSERT: (_c, op) => (op.payload?.token?.layer === "gm" ? null : op),
  TOKEN_MOVE: filterTokenMove,
  DOOR_UPSERT: (_c, op) => (op.payload?.door?.state === "secret" ? null : op),
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
  await dispatchSyncOp(ctx, { type: "FAIRPLAY_ADMIT", payload: { actor: peerId } });
}

async function handleGmActionOp(ctx, msg) {
  if (tsOutOfRange(ctx, msg.op)) {
    ctx.transport.send(msg.from, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId: msg.op.opId, reason: "ts_out_of_range" });
    return;
  }
  const validSig = await verifyVttOpSignature(msg.op);
  const current = await ctx.store.loadCampaign(ctx.campaignId);
  if (validSig && msg.op.type === "FAIRPLAY_KEY" && !isAdmittedIn(ctx, current, msg.op.actor)) {
    ctx.transport.send(msg.from, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId: msg.op.opId, reason: "not_admitted" });
    return;
  }
  if (!validSig || !isAuthorizedVttOp(current, msg.op)) {
    ctx.transport.send(msg.from, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId: msg.op.opId, reason: validSig ? "unauthorized" : "invalid_signature" });
    return;
  }
  const res = await ctx.store.appendOp(ctx.campaignId, msg.op);
  if (!res.duplicate) {
    await broadcastCommittedOp(ctx, res.campaign, msg.op);
    ctx.onUpdate?.(res.campaign);
  } else if (!current?.appliedOpIds?.includes(msg.op.opId)) {
    // Recusada pelo reducer (ex.: Fairplay fora de fase ou com lamport atrasado): o par precisa saber para assinar de novo.
    ctx.transport.send(msg.from, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId: msg.op.opId, reason: "out_of_phase" });
  }
}

async function handleGmMessage(ctx, msg) {
  if (msg.kind === "HELLO_SYNC" && msg.from) {
    ctx.connectedPlayers.add(msg.from);
    ctx.onPeerCountChange?.(ctx.connectedPlayers.size);
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
  if (msg.kind === "OP_REJECTED") ctx.onRejected?.(msg);
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
    snapshotAsked: false,
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
 * @param {object} opts Opções (`role`, `campaignId`, `keypair`, `store`, `transport`, `roomKey`, `gmRouteId`, `onUpdate`, `onBlobReceived`, `onRejected`, `onPeerCountChange`, `now` relógio injetável).
 * @returns {{ join: () => void, dispatchOp: (rawOp: object) => Promise<object>, getPeerCount: () => number, flush: () => Promise<void>, close: () => void }} Controlador do par P2P.
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
    join: () => { if (ctx.role === "player") ctx.transport.send(ctx.gmRouteId, { kind: "HELLO_SYNC", roomKey: ctx.roomKey }); },
    dispatchOp: (rawOp) => dispatchSyncOp(ctx, rawOp),
    getPeerCount: () => ctx.connectedPlayers.size,
    flush: () => chain,
    close: () => { detach(); ctx.transport.close?.(); },
  };
}
