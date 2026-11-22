/**
 * @file Consulta e validação de comunidades e atualizações de comunidade no cache persistente.
 */

import * as communityUpdates from "./community-updates.js";
import { getLocalPost, getLocalPosts } from "./cache-node-posts.js";

function buildLocalCommunityRecord(c) {
  const cid = c.communityId || c.id;
  return {
    id: cid,
    communityId: cid,
    title: c.title || cid,
    description: c.description || c.body || "",
    category: c.category || "",
    owner: c.author || "",
    image: c.image || c.avatar || "",
    avatar: c.avatar || c.image || "",
    language: c.language || "Português",
    visibility: c.visibility || "open",
    createdAt: c.createdAt || c.ts || null,
    commercialEnabled: Boolean(c.commercialEnabled),
    newKeyQuarantine: Boolean(c.newKeyQuarantine),
    isLocalP2p: true,
  };
}

/**
 * Comunidades criadas neste aparelho ou recebidas da malha, com as atualizações aceitas já aplicadas.
 * @returns {Promise<object[]>} Registros de comunidade (só os posts canônicos de criação).
 */
export async function getLocalCommunities() {
  const posts = await getLocalPosts({ type: "community" });
  const updates = await getLocalPosts({ type: communityUpdates.COMMUNITY_UPDATE_TYPE });
  const communities = [];
  for (const c of posts) {
    if (!communityUpdates.isCanonicalCommunityPost(c)) continue;
    communities.push(communityUpdates.applyCommunityUpdates(buildLocalCommunityRecord(c), updates));
  }
  return communities;
}

/**
 * PM-09: um `community_update` de quem não é dono nem moderador de uma comunidade
 * conhecida aqui não é gravado nem repassado. Comunidade desconhecida: aceita, e o
 * filtro de `applyCommunityUpdates` decide na hora de mostrar.
 * @param {object} update Item `community_update` recebido.
 * @returns {Promise<boolean>} Falso sem `communityId` ou se o autor não pode atualizar a comunidade conhecida.
 */
export async function isCommunityUpdateAcceptable(update) {
  if (!update?.communityId) return false;
  const { communityGossipHasRejectedImages } = await import("./shared/community-avatar-image.js");
  if (communityGossipHasRejectedImages(update)) return false;
  const post = await getLocalPost(communityUpdates.canonicalCommunityPostId(update.communityId));
  if (!post || post.type !== "community") return true;
  return communityUpdates.canUpdateCommunity(buildLocalCommunityRecord(post), update.author);
}
