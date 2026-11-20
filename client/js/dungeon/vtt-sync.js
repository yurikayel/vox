/**
 * @file Protocolo de sincronização P2P da Mesa Soberana (E2): sala por `roomKey`,
 * filtro Zero-Spoiler antes da serialização (`SNAPSHOT_FILTERED` e `COMMIT_OP`),
 * verificação ECDSA P-256 (`INV-7`) e replicação sob demanda de blobs (`WANT_BLOB`).
 * @module dungeon/vtt-sync
 */
import { isAuthorizedVttOp, projectStateForPlayer } from "./vtt-reducer.js";
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

async function sendFilteredSnapshot(ctx, toPeerId) {
  const full = await ctx.store.loadCampaign(ctx.campaignId);
  if (!full) return;
  const projected = projectStateForPlayer(full, "player", toPeerId);
  ctx.transport.send(toPeerId, { kind: "SNAPSHOT_FILTERED", roomKey: ctx.roomKey, campaign: projected });
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

async function handleGmActionOp(ctx, msg) {
  const validSig = await verifyVttOpSignature(msg.op);
  const current = await ctx.store.loadCampaign(ctx.campaignId);
  if (!validSig || !isAuthorizedVttOp(current, msg.op)) {
    ctx.transport.send(msg.from, { kind: "OP_REJECTED", roomKey: ctx.roomKey, opId: msg.op.opId, reason: validSig ? "unauthorized" : "invalid_signature" });
    return;
  }
  const res = await ctx.store.appendOp(ctx.campaignId, msg.op);
  if (!res.duplicate) {
    await broadcastCommittedOp(ctx, res.campaign, msg.op);
    ctx.onUpdate?.(res.campaign);
  }
}

async function handleGmMessage(ctx, msg) {
  if (msg.kind === "HELLO_SYNC" && msg.from) {
    ctx.connectedPlayers.add(msg.from);
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

async function handlePlayerMessage(ctx, msg) {
  if (msg.kind === "SNAPSHOT_FILTERED" && msg.campaign) {
    const saved = await ctx.store.saveCampaign(msg.campaign);
    await requestMissingBlobs(ctx, saved, msg.from);
    ctx.onUpdate?.(saved);
    return;
  }
  if (msg.kind === "COMMIT_OP" && msg.op) {
    const res = await ctx.store.appendOp(ctx.campaignId, msg.op).catch(() => null);
    if (res?.campaign) {
      await requestMissingBlobs(ctx, res.campaign, msg.from);
      ctx.onUpdate?.(res.campaign);
    }
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

/**
 * Instancia um par P2P da Mesa Soberana (`"gm"` ou `"player"`) sobre qualquer transporte compatível.
 * @param {object} opts Opções (`role`, `campaignId`, `keypair`, `store`, `transport`, `roomKey`, `gmRouteId`, `onUpdate`, `onBlobReceived`, `onRejected`).
 * @returns {{ join: () => void, dispatchOp: (rawOp: object) => Promise<object>, flush: () => Promise<void>, close: () => void }} Controlador do par P2P.
 */
export function createVttSyncPeer(opts) {
  const ctx = {
    role: opts.role === "gm" ? "gm" : "player",
    campaignId: opts.campaignId,
    keypair: opts.keypair,
    store: opts.store,
    transport: opts.transport,
    roomKey: opts.roomKey,
    gmRouteId: opts.gmRouteId || opts.keypair.routeId,
    connectedPlayers: new Set(),
    assembler: createBlobAssembler(),
    onUpdate: opts.onUpdate,
    onBlobReceived: opts.onBlobReceived,
    onRejected: opts.onRejected,
  };
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
    flush: () => chain,
    close: () => { detach(); ctx.transport.close?.(); },
  };
}
