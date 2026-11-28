/**
 * @file Restauração de backup `.voxrpg`: grava o pacote no `VttStore` sem apagar uma versão local mais nova
 * sem confirmação, e guarda o pacote pendente para o botão de confirmar.
 * @module dungeon/dungeon-restore
 */
import { hydrateStateFromCampaign } from "./dungeon-sync-bridge.js";

/**
 * Atualiza a lista de campanhas, o medidor de disco e o selo de persistência do estado.
 * @param {object} state Estado da sessão.
 * @param {object} store `VttStore`.
 * @returns {Promise<void>} Conclui com o estado atualizado.
 */
export async function refreshStoreSummary(state, store) {
  state.campaigns = await store.listCampaigns();
  state.storageUsage = await store.estimateUsage();
  state.persistenceReady = true;
}

/**
 * Diz se o aparelho já tem a mesma campanha com `lamport` maior que o da cópia restaurada.
 * @param {object} store `VttStore`.
 * @param {{ id: string, lamport?: number }} campaign Campanha do pacote.
 * @returns {Promise<object|null>} A campanha local mais nova, ou `null` quando restaurar não perde nada.
 */
export async function restoreConflict(store, campaign) {
  const local = await store.loadCampaign(campaign.id);
  return local && local.lamport > campaign.lamport ? local : null;
}

/**
 * Grava o pacote restaurado. Se a campanha local é mais nova, recusa e guarda o pacote em `state.pendingRestore`,
 * a menos que `opts.overwrite` seja `true`.
 * @param {object} state Estado da sessão.
 * @param {{ campaign: object, blobs: Map<string, Uint8Array> }} unpacked Pacote aberto.
 * @param {object} store `VttStore`.
 * @param {string} label Tipo do arquivo (`voxrpg-zip` ou `voxrpg-enc`).
 * @param {{ overwrite?: boolean }} [opts={}] `overwrite` confirma a troca da versão local mais nova.
 * @returns {Promise<{ ok: boolean, kind?: string, campaignId?: string, error?: string }>} Resultado.
 */
export async function saveRestoredPackage(state, unpacked, store, label, opts = {}) {
  const newer = opts.overwrite ? null : await restoreConflict(store, unpacked.campaign);
  if (newer) {
    state.pendingRestore = { unpacked, label };
    state.campaignNotice = `Este aparelho já tem "${newer.name}" mais recente que a cópia do arquivo. Nada foi trocado; confirme para substituir pela cópia do arquivo.`;
    return { ok: false, error: "local_mais_nova", campaignId: newer.id };
  }
  state.pendingRestore = null;
  for (const bytes of unpacked.blobs.values()) await store.putBlob(bytes);
  const saved = await store.saveCampaign(unpacked.campaign);
  hydrateStateFromCampaign(state, saved);
  await refreshStoreSummary(state, store);
  state.campaignNotice = `Campanha "${saved.name}" restaurada (${label}).`;
  return { ok: true, kind: label, campaignId: saved.id };
}

/**
 * Confirma a restauração guardada em `state.pendingRestore`, trocando a versão local pela do arquivo.
 * @param {object} state Estado da sessão.
 * @param {{ store: object }} opts Opções do controlador.
 * @returns {Promise<object|undefined>} Resultado da gravação, ou `undefined` sem restauração pendente.
 */
export async function confirmPendingRestore(state, opts) {
  const pending = state.pendingRestore;
  if (!pending) return undefined;
  return saveRestoredPackage(state, pending.unpacked, opts.store, pending.label, { overwrite: true });
}
