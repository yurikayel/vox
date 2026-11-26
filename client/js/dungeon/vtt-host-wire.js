/**
 * @file Liga o par de sincronização do Mestre ao transporte escolhido (rede com a flag de laboratório, senão
 * `BroadcastChannel`); tirado de `dungeon-scene-actions.js` para o arquivo legado não crescer (SUB-08, fatia 2c).
 * @module dungeon/vtt-host-wire
 */
import { hydrateStateFromCampaign } from "./dungeon-persistence.js";
import { createVttSyncPeer } from "./vtt-sync.js";
import { chooseVttTransport } from "./vtt-rede-escolha.js";
import { wireFairplayDriver } from "./vtt-fairplay-wire.js";

/** Escolhe o transporte do Mestre (rede com a flag, senão mesma origem) e devolve-o; `null` se nada serve ou o par já existe. */
async function chooseHostTransport(state, opts, { pair, tableId }) {
  const chosen = await chooseVttTransport({
    tableId, peerId: pair.routeId, keypair: pair, initiate: false, ...opts.network,
    onConnection: (conn) => { state.vttConnection = conn; (state._onSyncUpdate || opts.onSyncUpdate)?.(); },
  });
  if (chosen && state.syncPeer) chosen.transport.close?.();
  return chosen && !state.syncPeer ? chosen.transport : null;
}

/**
 * Liga o par de sincronização do Mestre (e o condutor Fairplay, com a flag) à mesa recém-convidada.
 * @param {object} state Estado da sessão.
 * @param {object} opts Opções (`onSyncUpdate`, `network`).
 * @param {{pair: object, tableId: string, roomKey: string, store: object}} ctx Par de chaves, mesa, chave da sala e store.
 * @returns {Promise<void>} Resolve com o par ligado (ou sem efeito se não há transporte ou já existe par).
 */
export async function wireHostSyncPeer(state, opts, { pair, tableId, roomKey, store }) {
  const transport = await chooseHostTransport(state, opts, { pair, tableId });
  if (!transport) return;
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
      state.fairplayDriver?.onUpdate(camp);
    },
    onPeerCountChange: (count) => {
      state.connectedPeersCount = count;
      (state._onSyncUpdate || opts.onSyncUpdate)?.();
    },
    onFairplayAccessChange: () => {
      state.fairplayPendingPeers = state.syncPeer?.getPendingFairplayPeers() || [];
      state.fairplayNames = state.syncPeer?.getPeerNames?.() || {};
      (state._onSyncUpdate || opts.onSyncUpdate)?.();
    },
  });
  wireFairplayDriver(state, { peer: state.syncPeer, peerId: pair.routeId, store, campaignId: tableId });
}
