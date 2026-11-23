/**
 * @file Aplica o pacote vindo da memória central: blobs, lápides, posts e cartões assinados, sem os itens de
 * antes da data de corte. Enquanto aplica, {@link isHydratingFromCentralMemory} segura o envio automático.
 *
 * @module central-memory-apply
 */
import * as hydrate from "./central-memory-hydrate.js";
import { isBeforeGenesisMs, isTestRouteId } from "./genesis.js";
import * as gossipProfile from "./peers-gossip-profile.js";
import { upsertAuthorCard } from "./central-memory-directory.js";

let hydratingDepth = 0;

/** Indica se HydratingFromCentralMemory.
 * @returns {*} Resultado da operação.
 */
export function isHydratingFromCentralMemory() {
  return hydratingDepth > 0;
}

/** Cartões da memória central passam pela mesma regra da malha: só entra o cartão assinado pelo dono. */
async function hydrateProfiles(profiles) {
  if (!Array.isArray(profiles)) return 0;
  let added = 0;
  for (const card of profiles) {
    if (await gossipProfile.applyDirectoryProfileCard(card)) added += 1;
  }
  return added;
}

/** Testes anteriores à data de corte ficam fora, mesmo que a memória central ainda os tenha. */
function afterGenesis(items) {
  if (!Array.isArray(items)) return items;
  return items.filter(
    (it) => !isBeforeGenesisMs(hydrate.itemTimestamp(it)) && !isTestRouteId(it?.routeId || it?.author || it?.owner),
  );
}

/**
 * Aplica localmente o pacote recebido da memória central.
 * @param {object} remote Pacote remoto
 * @returns {Promise<void>} Conclui quando aplicado.
 */
export async function applyRemoteBundle(remote) {
  hydratingDepth += 1;
  try {
    const blobsByHash = await hydrate.hydrateBlobs(remote.blobs);
    const tombCount = await hydrate.hydrateTombstones(remote.tombstones);
    const postCount = await hydrate.hydratePosts(afterGenesis(remote.posts), blobsByHash, upsertAuthorCard);
    const profCount = await hydrateProfiles(afterGenesis(remote.profiles));
    return tombCount + postCount + profCount;
  } finally {
    hydratingDepth = Math.max(0, hydratingDepth - 1);
  }
}
