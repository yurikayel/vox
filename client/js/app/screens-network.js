/**
 * @file Fachada sob demanda (PM-01) das telas de rede, steward e contas vinculadas.
 *
 * As telas (`screens-network-view.js` e os submódulos `network-screen-*`) carregam por
 * `import()` na primeira visita à rota e ficam fora do grafo de boot e do precache
 * (`SHELL_ASSETS`). `syncIdentity` segue estático: roda no boot e em telas comuns.
 *
 * @module app/screens-network
 * @see client/js/app/screens-network-view.js
 */
import * as localAccount from "../identity/index.js";
import * as cryptoDm from "../crypto-dm.js";
import * as peers from "../peers.js";
import { myPeerId } from "../peers-base.js";
import { buildDmPubProof } from "../dm-pub-proof.js";

/**
 * Sincroniza identidade com relays e diretório.
 *
 * @returns {Promise<void>}
 */
export async function syncIdentity() {
  const routeId = await localAccount.getRouteId();
  if (!routeId) return;
  const dmPub = await cryptoDm.getPublicJwk();
  const proof = await buildDmPubProof(localAccount.signPayload, dmPub, myPeerId);
  const enrich = localAccount.getProfileEnrichment() || {};
  const displayName = localAccount.getDisplayName() || enrich.displayName || "";
  const avatarUrl = enrich.avatarUrl && enrich.avatarUrl.length <= 512 ? enrich.avatarUrl : "";
  peers.announceIdentity(routeId, { ...dmPub, displayName, avatarUrl, proof });
}

/** @type {Promise<typeof import("./screens-network-view.js")>|null} */
let viewModulePromise = null;

/**
 * Carrega sob demanda e memoiza a implementação das telas de rede.
 *
 * @returns {Promise<typeof import("./screens-network-view.js")>}
 */
function loadNetworkView() {
  viewModulePromise ??= import("./screens-network-view.js");
  return viewModulePromise;
}

/**
 * Monta configurações de rede e liga o botão de backup HTML offline.
 *
 * @returns {Promise<void>}
 */
export async function showNetworkSettings() {
  const view = await loadNetworkView();
  return view.showNetworkSettings();
}

/**
 * Abre o assistente steward.
 *
 * @returns {Promise<void>}
 */
export async function showStewardWizard() {
  const view = await loadNetworkView();
  return view.showStewardWizard();
}

/**
 * Abre a tela de contas vinculadas.
 *
 * @returns {Promise<void>}
 */
export async function showLinkedAccounts() {
  const view = await loadNetworkView();
  return view.showLinkedAccounts();
}
