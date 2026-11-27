/**
 * @file Sincronização da identidade local com relays e diretório.
 *
 * Fica fora do assistente steward porque é chamada no boot e em telas comuns
 * (`app.js`, onboarding, perfil); o assistente em si carrega sob demanda (PM-01).
 *
 * @module app/network-identity-sync
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
