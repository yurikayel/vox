/**
 * @file Carregamento de tópicos, classificados, pautas, membros recentes e checklist de semente da comunidade.
 * @module app/community-data
 */
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as gql from "../graphql.js";
import * as mock from "../mock.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../identity/index.js";
import * as listingUi from "../listing-ui.js";
import * as communitySeed from "../community-seed-checklist.js";
import { orderCommunityTopics, mergeTopicsWithLocalReplies } from "../community-topic-order.js";
import { filterChannelTopics } from "../community-channel.js";
import * as newKeyGuard from "../new-key-guard.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import { resolveCommunityMetadata } from "./community-metadata.js";

/**
 * Busca os tópicos da comunidade nos gateways; sem rede, usa os de demonstração.
 *
 * @param {string} communityId
 * @returns {Promise<{topics: object[], demo: boolean, gateway: string}>}
 */
async function fetchRawCommunityTopics(communityId) {
  try {
    const res = await gql.fetchTopics(communityId).catch(() => mock.mockTopics(communityId));
    return { topics: res.items, demo: res.demo, gateway: res.gateway };
  } catch {
    const fb = mock.mockTopics(communityId);
    return { topics: fb.items, demo: true, gateway: "" };
  }
}

/** LAN-14: recolhe posts de chave nova sem PoW se a comunidade pediu; moderação vê tudo, marcado. */
async function applyNewKeyQuarantine(topics, meta, communityId, user, isUserMod) {
  const held = await newKeyGuard.heldByQuarantine(topics, meta, { viewer: user || "" });
  if (!held.size) return { visible: topics, heldCount: 0 };
  if (isUserMod || newKeyGuard.isHeldRevealed(communityId)) {
    return { visible: topics.map((t) => (held.has(t.id) ? { ...t, newKeyHeld: true } : t)), heldCount: 0 };
  }
  return { visible: topics.filter((t) => !held.has(t.id)), heldCount: held.size };
}

/**
 * Carrega metadados e tópicos filtrados/ordenados de uma comunidade.
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} user Rota do usuário atual.
 * @returns {Promise<{ meta: object, filteredTopics: object[], localTopics: object[], demo: boolean, gateway: string, isUserMod: boolean, heldCount: number }>} Estado base da comunidade.
 */
export async function loadCommunityMetaAndTopics(communityId, user) {
  const { topics, demo, gateway } = await fetchRawCommunityTopics(communityId);
  const meta = await resolveCommunityMetadata(communityId);
  const localTopics = await cacheNode.getLocalPosts({ type: "topic", communityId });
  const replyCounts = await cacheNode.getReplyCountsMap().catch(() => ({}));
  const replyActivity = await cacheNode.getReplyActivityMap().catch(() => ({}));
  const merged = mergeTopicsWithLocalReplies(localTopics, topics, user, replyCounts, replyActivity);
  if (communityId === "vox" || meta.isOfficial) {
    const welcome = welcomeProfile.getOfficialWelcomeTopic();
    if (!merged.some((t) => t.id === welcome.id)) merged.unshift(welcome);
  }
  let modActions = [];
  try { modActions = await mod.fetchModActions(communityId); } catch {}
  const filtered = filterChannelTopics(mod.applyFilters(merged, modActions, meta.owner, meta.moderators, user), meta, user);
  const isUserMod = mod.isModerator(user, meta.owner, meta.moderators);
  const { visible, heldCount } = await applyNewKeyQuarantine(filtered, meta, communityId, user, isUserMod);
  return { meta, filteredTopics: orderCommunityTopics(visible, "active"), localTopics, demo, gateway, isUserMod, heldCount };
}

/**
 * Junta os anúncios guardados no aparelho com os de demonstração (comunidades de exemplo).
 *
 * @param {string} communityId
 * @param {string} user Rota de quem vê.
 * @param {boolean} demo A comunidade é de demonstração.
 * @returns {Promise<object[]>}
 */
async function loadCommunityListings(communityId, user, demo) {
  try {
    const local = await cacheNode.getLocalPosts({ type: "listing", communityId });
    const isDemoComm = demo || communityId === "demo-feira-local";
    const demoItems = isDemoComm ? (mock.mockListings(communityId).items || []) : [];
    const seen = new Set();
    const items = [];
    for (const l of local) { seen.add(l.id); items.push(l); }
    for (const l of demoItems) { if (!seen.has(l.id)) { seen.add(l.id); items.push(l); } }
    const prepared = listingUi.prepareListingsForTab(items, user);
    return await listingUi.filterListingsByStoredTombstones(prepared, cacheNode.getTombstone);
  } catch {
    return [];
  }
}

/**
 * Junta as propostas de governança guardadas no aparelho com as de demonstração.
 *
 * @param {string} communityId
 * @param {boolean} demo A comunidade é de demonstração.
 * @returns {Promise<object[]>}
 */
async function loadCommunityProposals(communityId, demo) {
  try {
    const local = await cacheNode.getLocalPosts({ type: "governance-proposal", communityId });
    const isDemoComm = demo || communityId === "demo-aprenda-vox";
    const demoItems = isDemoComm ? (mock.mockProposals(communityId).items || []) : [];
    const seen = new Set();
    const items = [];
    for (const p of local) { seen.add(p.id); items.push(p); }
    for (const p of demoItems) { if (!seen.has(p.id)) { seen.add(p.id); items.push(p); } }
    return items;
  } catch {
    return [];
  }
}

/**
 * Carrega anúncios e propostas específicos da aba ativa da comunidade.
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} tab Aba selecionada.
 * @param {string} user Rota do usuário atual.
 * @param {boolean} demo Se a comunidade está em modo demo.
 * @returns {Promise<{ listings: object[], proposals: object[] }>} Itens da aba.
 */
export async function loadCommunityTabSpecifics(communityId, tab, user, demo) {
  const listings = tab === "listings" ? await loadCommunityListings(communityId, user, demo) : [];
  const proposals = await loadCommunityProposals(communityId, demo);
  return { listings, proposals };
}

/**
 * Acrescenta ao conjunto de pessoas recentes os perfis descobríveis do diretório Vox que não saíram da comunidade.
 *
 * @param {object[]} recentPeople Lista de pessoas a completar (alterada no lugar).
 * @param {Set<string>} peopleSet Rotas já presentes.
 */
async function appendVoxDirectoryMembers(recentPeople, peopleSet) {
  try {
    const leaves = await cacheNode.getLocalPosts({ type: "membership_leave", communityId: "vox" }).catch(() => []);
    const leftSet = new Set(leaves.map((l) => l.author || l.owner));
    for (const card of profileDirectory.listDiscoverableProfileCards()) {
      if (card?.routeId && !leftSet.has(card.routeId) && !peopleSet.has(card.routeId)) {
        recentPeople.push({ routeId: card.routeId, name: card.name || card.displayName || card.handle || card.routeId });
        peopleSet.add(card.routeId);
      }
    }
  } catch {}
}

/**
 * Monta lista de pessoas recentes na comunidade (incluindo diretório local no Vox).
 *
 * @param {{ filteredTopics: object[], meta: object, user: string, isMember: boolean, tab: string, communityId?: string }} params Dados da comunidade.
 * @returns {Promise<{ routeId: string, name: string }[]>} Lista de membros/autores recentes.
 */
export async function buildCommunityRecentPeople({ filteredTopics, meta, user, isMember, tab, communityId = "" }) {
  const isRelevantTab = tab === "posts" || tab === "members";
  const recentPeople = isRelevantTab ? peopleIndex.extractRecentAuthors(filteredTopics, 32) : [];
  const peopleSet = new Set(recentPeople.map((p) => p.routeId));
  if (communityId === "vox") await appendVoxDirectoryMembers(recentPeople, peopleSet);
  if (meta?.owner && !peopleSet.has(meta.owner)) {
    recentPeople.unshift({ routeId: meta.owner, name: profileDirectory.getAuthorDisplaySync(meta.owner) || meta.owner });
    peopleSet.add(meta.owner);
  }
  if (user && isMember && !peopleSet.has(user)) {
    recentPeople.push({ routeId: user, name: localAccount.getDisplayName() || user });
  }
  return recentPeople;
}

/**
 * Resolve o estado do checklist inicial da comunidade para quem administra.
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} user Rota do usuário.
 * @param {object} meta Metadados da comunidade.
 * @param {number} topicCount Total de tópicos visíveis.
 * @param {object} peerSettings Configurações de pares.
 * @returns {{ state: object, ctx: object }|null} Estado do checklist ou `null`.
 */
export function resolveCommunitySeedChecklist(communityId, user, meta, topicCount, peerSettings) {
  if (!user || !communitySeed.shouldOfferSeedRitual(communityId, user, meta)) return null;
  const seedState = communitySeed.loadSeedState(communityId);
  if (!communitySeed.isSeedComplete(seedState, { topicCount, peerEnabled: peerSettings.enabled })) {
    return { state: seedState, ctx: { topicCount, peerEnabled: peerSettings.enabled, commOnly: peerSettings.commOnly } };
  }
  communitySeed.finalizeSeedIfComplete(communityId, { topicCount, peerEnabled: peerSettings.enabled });
  return null;
}
