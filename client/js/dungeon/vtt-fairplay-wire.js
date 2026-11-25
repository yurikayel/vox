/**
 * @file Liga o condutor Fairplay (ADR-040) ao par de sincronização da mesa, só com a flag de laboratório
 * `vox.lab.fairplay` ligada. Sem a flag, nada muda: nenhuma chave de sessão é criada e nada vai para o log.
 * @module dungeon/vtt-fairplay-wire
 */
import { createFairplayDriver } from "./vtt-fairplay-driver.js";
import { isFairplayLabEnabled } from "./vtt-fairplay-selo.js";

/**
 * Cria e inicia o condutor deste aparelho, guardando-o em `state.fairplayDriver`.
 * @param {object} state Estado da sessão dungeon (recebe `fairplayDriver`).
 * @param {{peer: object, peerId: string, store: object, campaignId: string, storage?: Storage}} opts
 *   Par de sincronização, identidade do aparelho na mesa, store da campanha e armazenamento da flag.
 * @returns {object|null} Condutor criado, ou `null` com a flag desligada ou se `peerId` não for o `routeId` do par.
 */
export function wireFairplayDriver(state, opts) {
  state.fairplayDriver?.close();
  state.fairplayDriver = null;
  if (!isFairplayLabEnabled(opts.storage)) return null;
  if (opts.peer?.routeId && opts.peer.routeId !== opts.peerId) return null; // o peerId é sempre o routeId da chave que assina
  const driver = createFairplayDriver({
    peerId: opts.peerId,
    dispatchOp: (op) => opts.peer.dispatchOp(op),
    loadCampaign: () => opts.store.loadCampaign(opts.campaignId),
  });
  state.fairplayDriver = driver;
  driver.start().catch(() => { state.fairplayDriver = null; });
  return driver;
}
