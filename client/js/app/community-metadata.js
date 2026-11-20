/**
 * @file Metadados, adesão (join/leave) e ações de moderação assinadas de comunidades.
 * @module app/community-metadata
 */
import * as gql from "../graphql.js";
import * as mock from "../mock.js";
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../identity/index.js";
import * as communityUpdates from "../community-updates.js";
import * as featureFlags from "../feature-flags.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as peers from "../peers.js";

/**
 * Resolve metadados da comunidade (cache local, atualizações assinadas e remoto).
 *
 * @param {string} communityId Identificador da comunidade.
 * @returns {Promise<object>} Metadados consolidados da comunidade.
 */
export async function resolveCommunityMetadata(communityId) {
  let meta = { id: communityId, title: communityId, owner: "" };
  try {
    const comms = await gql.fetchCommunities().catch(() => mock.mockCommunities());
    const found = comms?.items?.find((c) => c.id === communityId);
    if (found) meta = found;
  } catch {}
  const localComms = await cacheNode.getLocalCommunities();
  const localFound = localComms.find((c) => c.id === communityId);
  if (localFound) meta = { ...meta, ...localFound };
  try {
    const localUpdates = await cacheNode.getLocalPosts({ type: communityUpdates.COMMUNITY_UPDATE_TYPE, communityId });
    meta = communityUpdates.applyCommunityUpdates(meta, localUpdates);
  } catch {}
  if (!meta.commercialEnabled && communityId === mock.MOCK_DEMO_COMMUNITY_FEIRA.id) {
    meta = { ...mock.MOCK_DEMO_COMMUNITY_FEIRA, ...meta, commercialEnabled: true };
  }
  if (communityId === "vox" || communityId === mock.MOCK_OFFICIAL_COMMUNITY_VOX?.id) {
    meta = { ...mock.MOCK_OFFICIAL_COMMUNITY_VOX, ...meta };
  }
  return meta;
}

/**
 * Verifica se a rota é membro ativo da comunidade (respeitando saída soberana).
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} user Rota do usuário.
 * @param {object|null} [meta=null] Metadados da comunidade, quando já carregados.
 * @returns {Promise<boolean>} `true` se o usuário participa da comunidade.
 */
export async function checkCommunityMembership(communityId, user, meta = null) {
  if (!user) return false;
  if (meta?.owner && meta.owner.toLowerCase() === user.toLowerCase()) return true;
  try {
    const localLeaves = await cacheNode.getLocalPosts({ type: "membership_leave", communityId }).catch(() => []);
    const userLeaves = localLeaves.filter((m) => (m.author || m.owner) === user);
    const lastLeaveTs = userLeaves.length ? Math.max(...userLeaves.map((m) => Number(m.leftAt || m.ts || 0))) : 0;

    const localMems = await cacheNode.getLocalPosts({ type: "membership", communityId }).catch(() => []);
    const userMems = localMems.filter((m) => (m.author || m.owner) === user);
    const lastJoinTs = userMems.length ? Math.max(...userMems.map((m) => Number(m.joinedAt || m.ts || 0))) : 0;

    if (lastLeaveTs > 0 && lastLeaveTs >= lastJoinTs) return false;
    if (lastJoinTs > 0 && lastJoinTs > lastLeaveTs) return true;
    if (communityId === "vox") return lastLeaveTs === 0;
    const mems = await gql.fetchUserMemberships(user);
    return mems.some((m) => m.communityId === communityId);
  } catch {
    return communityId === "vox";
  }
}

/**
 * Executa ação moderativa assinada na comunidade e propaga pela malha.
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} action Tipo da ação moderativa (`hide`, `pin`, `unpin`, `lock`, `unlock`).
 * @param {string} targetId ID do post/tópico alvo.
 * @param {{ upload?: boolean }} [options] Opções de publicação opcional na Permaweb.
 * @returns {Promise<object>} Registro da ação moderativa criada.
 */
export async function dispatchCommunityModAction(communityId, action, targetId, { upload: toArweave = true } = {}) {
  const modActionPost = {
    id: `mod_${action}_${targetId}_${Date.now()}`,
    type: "mod-action",
    action,
    target: targetId,
    communityId,
    ts: Date.now(),
  };
  try {
    const signed = await localAccount.signPayload(modActionPost);
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
  } catch {
    await cacheNode.saveLocalPost(modActionPost).catch(() => {});
  }
  if (toArweave && featureFlags.isFeatureEnabled("arweaveUpload") && wallet.hasWallet()) {
    try {
      const tags = upload.buildTags("mod-action", { "Community-Id": communityId, Action: action, Target: targetId });
      await upload.postData({ action, target: targetId, communityId }, tags);
    } catch {}
  }
  return modActionPost;
}
