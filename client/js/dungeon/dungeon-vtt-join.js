/**
 * @file Entrada P2P do jogador via convite `#/dungeon/entrar/:id?gm=...#k=...` (BroadcastChannel, mesma origem).
 * @module dungeon/dungeon-vtt-join
 */
import { hydrateStateFromCampaign } from "./dungeon-persistence.js";
import { createMemoryVttBackend, createVttStore } from "./vtt-store.js";
import { createBroadcastChannelTransport, createVttSyncPeer } from "./vtt-sync.js";
import { generateVttKeypair, parseRoomInviteHref } from "./vtt-sync-codec.js";
import { wireFairplayDriver } from "./vtt-fairplay-wire.js";

/** @param {object} state @param {object} invite @param {object} keypair */
function stampPlayerJoinState(state, invite, keypair) {
  state.vttKeypair = keypair;
  state.viewerRole = "player";
  state.joinMode = "p2p_player";
  state.campaignId = invite.tableId;
  state.tableId = invite.tableId;
  state.roomKey = invite.roomKey;
  state.gmRouteId = invite.gmRouteId;
  state.persistenceReady = true;
  state.campaignNotice = "Sincronizando com a Mesa do Mestre (aba paralela na mesma origem)…";
}

function createGuestStore(opts) {
  return opts.store || createVttStore(createMemoryVttBackend());
}

/** Avisa a tela de que o estado mudou (a mesma saída para atualização, aviso e status do Fairplay). */
function notifyJoin(state, opts, camp) {
  (opts.onCampaign || state._onSyncUpdate)?.(camp);
}

/** Callbacks do par jogador: estado da mesa, recusa de ops e aviso de que o Mestre não respondeu. */
function playerSyncCallbacks(state, opts) {
  return {
    onUpdate: (camp) => {
      hydrateStateFromCampaign(state, camp);
      state.campaignNotice = "Conectado à Mesa (visão de jogador).";
      state.fairplayHelloGaveUp = false;
      notifyJoin(state, opts, camp);
      state.fairplayDriver?.onUpdate(camp);
    },
    onHelloGaveUp: () => {
      state.fairplayHelloGaveUp = true;
      notifyJoin(state, opts);
    },
    onRejected: (msg) => {
      state.rollError = "Ação recusada pelo Mestre ou assinatura inválida.";
      state.fairplayDriver?.onRejected(msg);
    },
  };
}

/** @param {object} state @param {object} invite @param {object} opts */
function wirePlayerSyncPeer(state, invite, opts) {
  if (state.syncPeer?.close) state.syncPeer.close();
  const transport = createBroadcastChannelTransport(invite.tableId, state.vttKeypair.routeId);
  const store = createGuestStore(opts);
  state.syncPeer = createVttSyncPeer({
    role: "player",
    campaignId: invite.tableId,
    keypair: state.vttKeypair,
    store,
    transport,
    roomKey: invite.roomKey,
    gmRouteId: invite.gmRouteId,
    displayName: opts.displayName,
    ...playerSyncCallbacks(state, opts),
  });
  state.syncPeer.join();
  const onStatus = (status) => {
    state.fairplayAccess = status;
    notifyJoin(state, opts);
  };
  wireFairplayDriver(state, { peer: state.syncPeer, peerId: state.vttKeypair.routeId, store, campaignId: invite.tableId, onStatus });
}

/**
 * Conecta a sessão como jogador P2P em store isolado (sem sobrescrever o IndexedDB do Mestre na mesma origem).
 * @param {object} state Estado da sessão dungeon.
 * @param {string} locationHash `location.hash` com query `gm` e fragmento `#k=`.
 * @param {{ store?: object, displayName?: string, onCampaign?: (campaign: object) => void }} [opts] `displayName`: nome anunciado ao Mestre (vem da camada de app).
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function attachVttPlayerJoin(state, locationHash, opts = {}) {
  const invite = parseRoomInviteHref(locationHash || "");
  if (!invite) return { ok: false, error: "invalid_invite" };
  if (typeof globalThis.BroadcastChannel !== "function") {
    return { ok: false, error: "broadcast_channel_unavailable" };
  }
  if (state.joinMode === "p2p_player" && state.syncPeer && state.campaignId === invite.tableId && state.roomKey === invite.roomKey) {
    return { ok: true };
  }
  const keypair = state.vttKeypair || await generateVttKeypair();
  stampPlayerJoinState(state, invite, keypair);
  wirePlayerSyncPeer(state, invite, opts);
  return { ok: true };
}