/**
 * @file Entrada P2P do jogador via convite `#/dungeon/entrar/:id?gm=...#k=...` (BroadcastChannel na mesma origem, ou rede atrás da flag de laboratório).
 * @module dungeon/dungeon-vtt-join
 */
import { hydrateStateFromCampaign } from "./dungeon-persistence.js";
import { createMemoryVttBackend, createVttStore } from "./vtt-store.js";
import { createVttSyncPeer } from "./vtt-sync.js";
import { chooseVttTransport, loadRtcVttTransport, loadVttSignalingClient } from "./vtt-rede-escolha.js";
import { generateVttKeypair, parseRoomInviteHref } from "./vtt-sync-codec.js";
import { wireFairplayDriver } from "./vtt-fairplay-wire.js";

export { loadRtcVttTransport, loadVttSignalingClient };

/**
 * Texto de aviso para cada código de falha da entrada P2P.
 * @param {string} [code] Código de erro de {@link attachVttPlayerJoin}.
 * @returns {string} Mensagem para o jogador.
 */
export function joinFailureRollMessage(code) {
  if (code === "broadcast_channel_unavailable") {
    return "Convite P2P exige duas abas na mesma origem (BroadcastChannel indisponível neste contexto).";
  }
  if (code === "invalid_invite") return "Link de convite inválido ou incompleto.";
  return "Não foi possível entrar na mesa.";
}

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
function wirePlayerSyncPeer(state, invite, opts, transport) {
  if (state.syncPeer?.close) state.syncPeer.close();
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
 * @param {{ store?: object, displayName?: string, onCampaign?: (campaign: object) => void, network?: object }} [opts] `displayName`: nome anunciado ao Mestre (vem da camada de app); `network`: ajustes do transporte (testes).
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function attachVttPlayerJoin(state, locationHash, opts = {}) {
  const invite = parseRoomInviteHref(locationHash || "");
  if (!invite) return { ok: false, error: "invalid_invite" };
  if (state.joinMode === "p2p_player" && state.syncPeer && state.campaignId === invite.tableId && state.roomKey === invite.roomKey) {
    return { ok: true };
  }
  const keypair = state.vttKeypair || await generateVttKeypair();
  const chosen = await chooseVttTransport({
    tableId: invite.tableId, peerId: keypair.routeId, initiate: true, ...opts.network,
    onConnection: (conn) => { state.vttConnection = conn; notifyJoin(state, opts); },
  });
  if (!chosen) return { ok: false, error: "broadcast_channel_unavailable" };
  stampPlayerJoinState(state, invite, keypair);
  wirePlayerSyncPeer(state, invite, opts, chosen.transport);
  return { ok: true };
}