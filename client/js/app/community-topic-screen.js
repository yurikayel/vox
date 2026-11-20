/**
 * @file Tela de detalhe de tópico, resolução de respostas e ações de moderação do tópico.
 * @module app/community-topic-screen
 */
import * as welcomeProfile from "../vox-welcome-profile.js";
import { sanitizeMediaUrl } from "../shared/html.js";
import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as postOwnership from "../post-ownership.js";
import { filterChannelTopic } from "../community-channel.js";
import * as profileDirectory from "../profile-directory.js";
import { getCachedBskyPostById } from "../bsky-feed.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, shareTopicUnlessQuarantined } from "./context.js";
import { route } from "./navigation.js";
import { resolveCommunityMetadata, dispatchCommunityModAction } from "./community-metadata.js";

const MOD_ACTION_LABELS = {
  pin: "Tópico fixado no topo!",
  unpin: "Tópico desafixado.",
  lock: "Tópico trancado para novas respostas.",
  unlock: "Tópico reaberto.",
};

async function fetchRemoteTopicFallback(topicId, commIdParam) {
  let topic = null;
  let topicData = { body: "" };
  try { topic = await gql.fetchTopicById(topicId); } catch {}
  try {
    topicData = await gql.fetchTransactionData(topicId, { communityId: topic?.communityId || commIdParam });
  } catch {}
  return { topic: topic || { title: "Tópico", owner: "", communityId: commIdParam }, topicData };
}

/**
 * Carrega conteúdo do tópico para exibição (oficial, cache local, demo ou remoto).
 *
 * @param {string} topicId ID do tópico.
 * @param {string} commIdParam Comunidade de fallback quando o item não traz `communityId`.
 * @param {string} user Rota do usuário atual.
 * @returns {Promise<{ topic: object, topicData: { body?: string }, isOfficial: boolean, isLocal: boolean }>} Tópico e corpo resolvidos.
 */
export async function resolveTopicContent(topicId, commIdParam, user) {
  const isOfficial = topicId === welcomeProfile.OFFICIAL_WELCOME_TOPIC_ID || topicId === "vox-official-manifesto-welcome";
  if (isOfficial) {
    const welcome = welcomeProfile.getOfficialWelcomeTopic();
    return { topic: { ...welcome, isOfficial: true, isLocalP2p: true }, topicData: { body: welcome.body }, isOfficial, isLocal: true };
  }
  const local = (await cacheNode.getLocalPost(topicId)) || getCachedBskyPostById(topicId);
  if (local) {
    return {
      topic: postOwnership.withOwnLocalFlag({ ...local, owner: local.author, isLocalP2p: true }, user),
      topicData: { body: local.body },
      isOfficial: false,
      isLocal: true,
    };
  }
  const demo = mock.MOCK_DEMO_TOPICS.find((t) => t.id === topicId);
  if (demo) {
    return { topic: { ...demo, owner: demo.author, isLocalP2p: true }, topicData: { body: demo.body }, isOfficial: false, isLocal: true };
  }
  const remote = await fetchRemoteTopicFallback(topicId, commIdParam);
  return { topic: remote.topic, topicData: remote.topicData, isOfficial: false, isLocal: false };
}

async function resolveTopicReplies(topicId, isOfficial) {
  if (isOfficial) return { replies: mock.mockReplies(topicId).items || [], gateway: "", demo: true };
  try {
    const res = await gql.fetchReplies(topicId);
    return { replies: res.items, gateway: res.gateway, demo: false };
  } catch {
    return { replies: mock.mockReplies(topicId).items || [], gateway: "", demo: true };
  }
}

async function mergeTopicReplies(topicId, remoteReplies) {
  const local = await cacheNode.getLocalPosts({ type: "reply", replyTo: topicId });
  const seen = new Set();
  const merged = [];
  for (const r of local) { seen.add(r.id); merged.push({ ...r, owner: r.author, isLocalP2p: true }); }
  for (const r of remoteReplies) {
    if (!seen.has(r.id)) { seen.add(r.id); merged.push({ ...r, isLocalP2p: false }); }
  }
  if (!merged.length && mock.MOCK_REPLIES[topicId]) {
    for (const r of mock.MOCK_REPLIES[topicId]) merged.push({ ...r, owner: r.author, isLocalP2p: true });
  }
  return { merged, hasLocal: Boolean(local.length) };
}

function bindLiveProfileSync(topicAuthor, filteredReplies) {
  const authors = new Set(filteredReplies.map((r) => r.author || r.owner).filter(Boolean));
  if (topicAuthor) authors.add(topicAuthor);
  return peers.onGossipPost((item) => {
    if (!item?.author || !authors.has(item.author)) return;
    const card = profileDirectory.getProfileCard(item.author);
    if (!card?.name && !card?.avatarUrl) return;
    document.querySelectorAll(`a.post-author[href="#/u/${encodeURIComponent(item.author)}"]`).forEach((link) => {
      if (card.name) link.textContent = card.name;
    });
    const safeAvatar = sanitizeMediaUrl(card.avatarUrl);
    document.querySelectorAll(`a.avatar-link[href="#/u/${encodeURIComponent(item.author)}"]`).forEach((alink) => {
      const img = alink.querySelector("img.avatar-img");
      if (safeAvatar && img) img.src = safeAvatar;
    });
  });
}

function bindTopicModToggleActions(finalCommId, topicId) {
  document.querySelectorAll(".btn-mod-action").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id: targetId, action } = btn.dataset;
      if (!targetId || !action) return;
      btn.disabled = true;
      try {
        await dispatchCommunityModAction(finalCommId, action, targetId);
        share.showToast(MOD_ACTION_LABELS[action] || "Ação de moderação aplicada.");
        route(parseRoute(location.hash.slice(1) || `/t/${topicId}`));
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
      }
    });
  });
}

function bindTopicModHideActions(finalCommId) {
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.id;
      if (!confirm(`Ocultar o item ${targetId}?`)) return;
      btn.disabled = true;
      try {
        await dispatchCommunityModAction(finalCommId, "hide", targetId);
        share.showToast("Item ocultado.");
        btn.closest(".reply-item, .card")?.remove();
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
      }
    });
  });
}

function bindTopicScreenEvents(topicId, topic, finalCommId) {
  document.getElementById("btn-share-topic")?.addEventListener("click", () => {
    shareTopicUnlessQuarantined({ title: topic.title || "Tópico no Vox", topicId, communityId: finalCommId });
  });
  bindTopicModToggleActions(finalCommId, topicId);
  bindTopicModHideActions(finalCommId);
}

function hydrateMissingReplyBodies(filteredReplies, finalCommId) {
  filteredReplies.forEach(async (r) => {
    if (!r.isLocalP2p && (!r.body || r.body.startsWith("("))) {
      const d = await gql.fetchTransactionData(r.id, { communityId: finalCommId });
      if (d?.body) {
        const p = document.getElementById(`reply-${r.id}`)?.querySelector(".reply-body");
        if (p) p.textContent = d.body;
      }
    }
  });
}

async function resolveTopicModeration(communityId, user, replies, topic = null) {
  if (!communityId) return { filteredReplies: replies, filteredTopic: topic, isUserMod: false };
  const meta = await resolveCommunityMetadata(communityId).catch(() => ({ owner: "" }));
  let modActions = [];
  try { modActions = await mod.fetchModActions(communityId); } catch {}
  const filteredReplies = mod.applyFilters(replies, modActions, meta.owner, meta.moderators, user);
  const filteredTopic = filterChannelTopic(mod.filterTopicForViewer(topic, modActions, meta.owner, meta.moderators, user), meta, user);
  return {
    filteredReplies,
    filteredTopic,
    isUserMod: mod.isModerator(user, meta.owner, meta.moderators),
    communityTitle: meta.title || "",
  };
}

/**
 * Monta a tela de visualização e respostas de um tópico.
 *
 * @param {string} topicId Identificador do tópico.
 * @param {string} [commIdParam=""] Identificador opcional da comunidade.
 * @returns {Promise<void>}
 */
export async function showTopic(topicId, commIdParam = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Tópico"));
  render.renderLoading(main);
  const { topic, topicData, isOfficial, isLocal } = await resolveTopicContent(topicId, commIdParam, user);
  const { replies: rawReplies, gateway, demo } = await resolveTopicReplies(topicId, isOfficial);
  const { merged: mergedReplies, hasLocal: hasLocalReplies } = await mergeTopicReplies(topicId, rawReplies);
  const finalCommId = topic.communityId || commIdParam;
  const { filteredReplies, filteredTopic, isUserMod, communityTitle } = await resolveTopicModeration(finalCommId, user, mergedReplies, topic);
  const currentTopic = filteredTopic || topic;

  main.innerHTML = "";
  if (demo && !isLocal && !hasLocalReplies) render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderTopic(main, topicId, currentTopic, filteredReplies, { topicData, isMod: isUserMod, communityId: finalCommId, communityTitle });
  hydrateMissingReplyBodies(filteredReplies, finalCommId);
  bindLiveProfileSync(currentTopic.author || currentTopic.owner, filteredReplies);
  bindTopicScreenEvents(topicId, currentTopic, finalCommId);
}
