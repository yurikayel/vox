/**
 * @file Entrada P2P do jogador via convite `#/dungeon/entrar/:id?gm=...#k=...` (BroadcastChannel, mesma origem).
 * @module dungeon/dungeon-vtt-join
 */
import { hydrateStateFromCampaign } from "./dungeon-persistence.js";
import { getDefaultVttStore } from "./vtt-store.js";
import { createBroadcastChannelTransport, createVttSyncPeer } from "./vtt-sync.js";
import { generateVttKeypair, parseRoomInviteHref } from "./vtt-sync-codec.js";

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

/** @param {object} state @param {object} invite @param {object} opts */
function wirePlayerSyncPeer(state, invite, opts) {
  if (state.syncPeer?.close) state.syncPeer.close();
  const transport = createBroadcastChannelTransport(invite.tableId, state.vttKeypair.routeId);
  state.syncPeer = createVttSyncPeer({
    role: "player",
    campaignId: invite.tableId,
    keypair: state.vttKeypair,
    store: opts.store || getDefaultVttStore(),
    transport,
    roomKey: invite.roomKey,
    gmRouteId: invite.gmRouteId,
    onUpdate: (camp) => {
      hydrateStateFromCampaign(state, camp);
      state.campaignNotice = "Conectado à Mesa (visão de jogador).";
      opts.onCampaign?.(camp);
    },
    onRejected: () => { state.rollError = "Ação recusada pelo Mestre ou assinatura inválida."; },
  });
  state.syncPeer.join();
}

/**
 * Conecta a sessão como jogador P2P (sem clonar campanha local do GM).
 * @param {object} state Estado da sessão dungeon.
 * @param {string} locationHash `location.hash` com query `gm` e fragmento `#k=`.
 * @param {{ store?: object, onCampaign?: (campaign: object) => void }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function attachVttPlayerJoin(state, locationHash, opts = {}) {
  const invite = parseRoomInviteHref(locationHash || "");
  if (!invite) return { ok: false, error: "invalid_invite" };
  if (typeof globalThis.BroadcastChannel !== "function") {
    return { ok: false, error: "broadcast_channel_unavailable" };
  }
  const keypair = state.vttKeypair || await generateVttKeypair();
  stampPlayerJoinState(state, invite, keypair);
  wirePlayerSyncPeer(state, invite, { ...opts, store: opts.store || getDefaultVttStore() });
  return { ok: true };
}