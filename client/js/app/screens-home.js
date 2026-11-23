/** @file Home feed, communities list, tag feed, and Bluesky external feed orchestration. */

import * as bskyFeed from "../bsky-feed.js";
import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as social from "../social.js";
import * as hashtags from "../hashtags.js";
import * as postOwnership from "../post-ownership.js";
import { attachInlineComposerHandlers } from "./inline-composer.js";
import { splitFeedBySphere } from "../civic-post.js";
import * as localAccount from "../identity/index.js";
import { loadCivicVotes, attachCivicVoteHandlers } from "./civic-actions.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";
import { attachPostMoreMenuHandlers } from "./post-more-menu.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
import { getCommunityLastSeenTs, computeCommunityUnreadCount } from "../community-unread.js";
import { resolveCommunityMetadata, checkCommunityMembership } from "./screens-community.js";

let postOverlayMenuHandlersBound = false;
let quoteExternalBound = false;

/**
 * Insere a citação no compositor da Ágora; devolve se havia compositor.
 *
 * @param {string} quoteText Texto citado.
 * @returns {boolean}
 */
function insertQuoteIntoComposer(quoteText) {
  const textarea = document.getElementById("inline-topic-body");
  const collapsed = document.querySelector("#feed-inline-composer .inline-composer-collapsed");
  const form = document.getElementById("form-inline-topic");

  if (!textarea || !form) return false;
  if (form.classList.contains("hidden") && collapsed) collapsed.click();
  textarea.value = quoteText + (textarea.value || "");
  textarea.focus();
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("feed-inline-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
  share.showToast("Citação inserida! Escreva sua análise cívica. ✍️");
  return true;
}

/**
 * Liga compartilhar citação externa.
 *
 * @returns {void}
 */
export function attachQuoteExternalHandlers() {
  if (quoteExternalBound) return;
  quoteExternalBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".btn-quote-external");
    if (!btn) return;
    const handle = btn.dataset.handle || btn.dataset.author || "@bluesky";
    const body = btn.dataset.body || "";
    const url = btn.dataset.url || "";
    const quoteText = bskyFeed.quoteExternalPostText({ authorHandle: handle, body, externalUrl: url });
    if (!insertQuoteIntoComposer(quoteText)) {
      try {
        sessionStorage.setItem("vox_quote_prefill", quoteText);
        window.location.hash = "#/compose/topic";
      } catch {}
    }
  });
}

/**
 * Liga menu de ações no overlay do post.
 *
 * @returns {void}
 */
export function attachPostOverlayActionMenuHandlers() {
  if (postOverlayMenuHandlersBound) return;
  postOverlayMenuHandlersBound = true;
  document.addEventListener("click", (e) => {
    if (e.target.closest(".post-actions-overlay .post-overlay-actions-more")) return;
    document.querySelectorAll(".post-actions-overlay .post-overlay-actions-more[open]").forEach((el) => {
      el.removeAttribute("open");
    });
  });
}

/**
 * Monta o mapa de identificador para título das comunidades.
 *
 * @returns {Promise<Map<string, string>>}
 */
async function buildCommunityTitleMap() {
  const commMap = new Map();
  try {
    const commsRes = await gql.fetchCommunities().catch(() => mock.mockCommunities());
    for (const c of commsRes?.items || []) {
      if (c.id && c.title) commMap.set(c.id, c.title);
    }
    const localComms = await cacheNode.getLocalCommunities();
    for (const c of localComms) {
      if (c.id && c.title) commMap.set(c.id, c.title);
    }
  } catch {}
  return commMap;
}

/**
 * Soma as respostas locais ao contador de cada tópico.
 *
 * @param {object[]} topics Tópicos.
 * @param {Object<string, number>} replyCounts Respostas por tópico.
 * @returns {object[]}
 */
function applyReplyCountsToTopics(topics, replyCounts) {
  if (!replyCounts || typeof replyCounts !== "object") return topics;
  for (const t of topics) {
    const extra = replyCounts[t.id] || 0;
    if (extra > 0 || !t.repliesCount) {
      t.repliesCount = (Number(t.repliesCount) || 0) + extra;
    }
  }
  return topics;
}

/**
 * Mescla posts locais e remotos da Ágora sem duplicar.
 *
 * @param {object[]} localPosts Posts do aparelho.
 * @param {object[]} remoteItems Posts dos gateways.
 * @param {Map<string, string>} commMap Títulos das comunidades.
 * @param {string} user Rota de quem vê.
 * @returns {object[]}
 */
function mergeLocalAndRemoteTopics(localPosts, remoteItems, commMap, user) {
  const seen = new Set();
  const merged = [];
  for (const p of localPosts) {
    seen.add(p.id);
    merged.push(
      postOwnership.withOwnLocalFlag(
        { ...p, isLocalP2p: true, communityTitle: commMap.get(p.communityId) || p.communityTitle || "" },
        user,
      ),
    );
  }
  for (const p of remoteItems || []) {
    if (p.type !== "listing" && !seen.has(p.id)) {
      seen.add(p.id);
      merged.push({ ...p, isLocalP2p: false, communityTitle: commMap.get(p.communityId) || p.communityTitle || "" });
    }
  }
  return merged;
}

/**
 * Social (padrão) e Cívico dividem os posts Vox pela esfera — ver `civic-post.js`.
 * "Meu" voto/post usa o ID local (`vx_…`): `signPayload` sempre assina com ele como autor,
 * mesmo quando o usuário ativo é o endereço da carteira.
 */
async function filterTopicsBySphere(merged, activeFeed, user) {
  const votes = await loadCivicVotes();
  const me = (await localAccount.getRouteId().catch(() => "")) || user || "";
  const { social: socialPosts, civic } = splitFeedBySphere(merged, { votes, me });
  return activeFeed === "civic" ? civic : socialPosts;
}

/**
 * Filtra os tópicos conforme o feed ativo (para você, cívico, seguindo).
 *
 * @param {object[]} merged Tópicos mesclados.
 * @param {string} activeFeed Feed ativo.
 * @param {string} [user=""] Rota de quem vê.
 * @returns {Promise<object[]>}
 */
async function filterTopicsForActiveFeed(merged, activeFeed, user = "") {
  if (activeFeed === "for-you" || activeFeed === "civic") {
    return filterTopicsBySphere(merged, activeFeed, user);
  }
  if (activeFeed === "following") {
    const watchedSet = new Set(social.getWatchedProfiles());
    return merged.filter((p) => watchedSet.has(p.author || p.owner));
  }
  if (activeFeed === "external") {
    return await bskyFeed.fetchAggregatedBskyFeed().catch(() => []);
  }
  if (activeFeed === "all") {
    const bsky = await bskyFeed.fetchAggregatedBskyFeed().catch(() => []);
    return [...merged, ...bsky].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  return merged;
}

/**
 * Liga os botões de dispensar o tópico de boas-vindas.
 *
 * @param {Function} onDismiss Chamado depois de dispensar.
 */
function attachWelcomeTopicDismissHandlers(onDismiss) {
  document.querySelectorAll(".btn-dismiss-welcome-topic").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        localStorage.setItem("vox-welcome-post-dismissed", "1");
      } catch {}
      btn.closest(".post")?.remove();
      share.showToast("Post de boas-vindas dispensado.");
      if (typeof onDismiss === "function") onDismiss();
    });
  });
}

/**
 * Liga os tratadores interativos da Ágora.
 *
 * @param {string} activeFeed Feed ativo.
 */
function wireHomeInteractiveHandlers(activeFeed) {
  attachPostShareHandlers();
  attachPostMoreMenuHandlers();
  attachPostOverlayActionMenuHandlers();
  attachInlineComposerHandlers(() => showHome(activeFeed));
  attachWelcomeTopicDismissHandlers(() => showHome(activeFeed));
  attachBskyManagerHandlers(() => showHome(activeFeed));
  attachQuoteExternalHandlers();
}

/**
 * Busca nos gateways os itens remotos do feed ativo.
 *
 * @param {string} activeFeed Feed ativo.
 * @returns {Promise<{items: object[], gateway: string}>}
 */
async function fetchRemoteHomeItems(activeFeed) {
  if (activeFeed === "following") {
    const watched = social.getWatchedProfiles();
    if (watched.length > 0) {
      const res = await gql.fetchTopicsByOwners(watched).catch(() => ({ items: [] }));
      return { items: res.items || [], gateway: res.gateway || "" };
    }
    return { items: [], gateway: "" };
  }
  const res = await gql.fetchRecentTopics().catch(async () => mock.mockRecentTopics());
  return { items: res.items || [], gateway: res.gateway || "" };
}

/**
 * Diz se o tópico da comunidade pode aparecer (comunidade fechada exige ser membro).
 *
 * @param {string} cId Comunidade.
 * @param {string} user Rota de quem vê.
 * @param {Map<string, object|null>} commClosedCache Cache de metadados das comunidades.
 * @param {Map<string, boolean>} membershipCache Cache de participação.
 * @returns {Promise<boolean>}
 */
async function isCommunityTopicPermitted(cId, user, commClosedCache, membershipCache) {
  if (!cId || cId === "vox") return true;
  let meta = commClosedCache.get(cId);
  if (meta === undefined) {
    try {
      meta = await resolveCommunityMetadata(cId);
    } catch {
      meta = null;
    }
    commClosedCache.set(cId, meta);
  }
  if (!meta || (meta.visibility !== "closed" && meta.type !== "closed")) return true;
  if (!user) return false;
  let isMember = membershipCache.get(cId);
  if (isMember === undefined) {
    isMember = await checkCommunityMembership(cId, user, meta);
    membershipCache.set(cId, isMember);
  }
  return Boolean(isMember);
}

/**
 * Filtra tópicos de comunidades fechadas.
 *
 * @param {unknown} topics
 * @param {string} user
 * @returns {Promise<unknown>}
 */
export async function filterClosedCommunityTopics(topics, user) {
  const commClosedCache = new Map();
  const membershipCache = new Map();
  const allowed = [];

  for (const t of topics) {
    const ok = await isCommunityTopicPermitted(t.communityId, user, commClosedCache, membershipCache);
    if (ok) allowed.push(t);
  }
  return allowed;
}

/**
 * Monta a lista de tópicos da Ágora com posts locais e remotos.
 *
 * @param {object[]} remoteItems Posts dos gateways.
 * @param {Map<string, string>} commMap Títulos das comunidades.
 * @param {string} user Rota de quem vê.
 * @param {string} activeFeed Feed ativo.
 * @returns {Promise<object[]>}
 */
async function assembleHomeFeedTopics(remoteItems, commMap, user, activeFeed) {
  const localPosts = (await cacheNode.getLocalPosts({ type: "topic" })).filter((p) => p.type !== "listing");
  const replyCounts = await cacheNode.getReplyCountsMap().catch(() => ({}));
  const merged = applyReplyCountsToTopics(
    mergeLocalAndRemoteTopics(localPosts, remoteItems, commMap, user),
    replyCounts,
  );
  const privacyFiltered = await filterClosedCommunityTopics(merged, user);
  const filtered = await filterTopicsForActiveFeed(privacyFiltered, activeFeed, user);
  const isWelcomeDismissed = localStorage.getItem("vox-welcome-post-dismissed") === "1";
  const welcomeTopic = welcomeProfile.getOfficialWelcomeTopic();
  const shouldIncludeWelcome = activeFeed !== "civic" && !isWelcomeDismissed && !filtered.some((p) => p.id === welcomeTopic.id);
  const withWelcome = shouldIncludeWelcome ? [welcomeTopic, ...filtered] : filtered;
  return mod.filterFeedPosts(withWelcome);
}

/**
 * Monta feed principal.
 *
 * @param {string} feed [optional]
 * @returns {void}
 */
export async function showHome(feed = "for-you") {
  const validFeeds = ["for-you", "civic", "following", "external", "all"];
  const activeFeed = validFeeds.includes(feed) ? feed : "for-you";
  const user = await getActiveUser();
  if (user) await ensureOnboardingSideEffects(user);
  const main = render.renderShell({ ...makeShellProps(user, "home"), activeFeed, showFeedNav: true });
  render.renderLoading(main);
  const externalSubs = bskyFeed.loadBskySubscriptions();
  let finalTopics = [];

  try {
    const { items: remoteItems, gateway } = await fetchRemoteHomeItems(activeFeed);
    const commMap = await buildCommunityTitleMap();
    finalTopics = await assembleHomeFeedTopics(remoteItems, commMap, user, activeFeed);

    main.innerHTML = "";
    if (gateway) render.renderGatewayBanner(main, gateway);
    render.renderFeed(main, finalTopics, { activeFeed, userRouteId: user || "", externalSubs });
  } catch {
    main.innerHTML = "";
    const fallbackItems = mock.mockRecentTopics()?.items || [];
    finalTopics = await assembleHomeFeedTopics(fallbackItems, new Map(), user, activeFeed);
    render.renderFeed(main, finalTopics, { activeFeed, userRouteId: user || "", externalSubs });
  }

  wireHomeInteractiveHandlers(activeFeed);
  const byId = new Map(finalTopics.map((t) => [t.id, t]));
  attachCivicVoteHandlers((id) => byId.get(id), user, () => showHome(activeFeed));
}

/**
 * Liga o botão de importar quem a pessoa segue no Bluesky.
 *
 * @param {Function} onRefresh Chamado depois de importar.
 */
function bindBskyImportButton(onRefresh) {
  const importBtn = document.getElementById("btn-import-bsky-follows");
  if (!importBtn || importBtn.dataset.wired) return;
  importBtn.dataset.wired = "1";
  importBtn.addEventListener("click", async () => {
    const input = document.getElementById("input-bsky-import-me");
    const val = input?.value?.trim();
    if (!val) return share.showToast("Digite seu @handle do Bluesky para importar.");
    importBtn.disabled = true;
    importBtn.textContent = "Importando...";
    try {
      const res = await bskyFeed.importBskyFollows(val, 50);
      share.showToast(`🎉 ${res.added} novos perfis importados com sucesso!`);
      if (input) input.value = "";
      if (onRefresh) onRefresh();
    } catch {
      share.showToast("Falha ao importar perfis do Bluesky.");
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = "📥 Puxar quem eu sigo";
    }
  });
}

/**
 * Liga os botões de sugestão do Bluesky.
 *
 * @param {Function} onRefresh Chamado depois de mudar o estado.
 */
function bindBskyChipActions(onRefresh) {
  document.querySelectorAll(".btn-add-suggestion").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (!btn.dataset.handle) return;
      bskyFeed.addBskySubscription(btn.dataset.handle);
      share.showToast(`Perfil @${btn.dataset.handle} adicionado! 🌐`);
      if (onRefresh) onRefresh();
    });
  });
  document.querySelectorAll(".btn-remove-bsky-sub").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (!btn.dataset.handle) return;
      bskyFeed.removeBskySubscription(btn.dataset.handle);
      share.showToast(`Perfil @${btn.dataset.handle} removido.`);
      if (onRefresh) onRefresh();
    });
  });
}

/**
 * Liga gestão de conta Bluesky no feed.
 *
 * @param {Function} onRefresh
 * @returns {void}
 */
export function attachBskyManagerHandlers(onRefresh) {
  const form = document.getElementById("form-add-bsky");
  if (form && !form.dataset.wired) {
    form.dataset.wired = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("input-bsky-handle");
      const val = input?.value?.trim();
      if (!val) return;
      bskyFeed.addBskySubscription(val);
      share.showToast(`Perfil @${val.replace(/^@/, "")} adicionado ao Vox! 🌐`);
      if (input) input.value = "";
      if (onRefresh) onRefresh();
    });
  }
  bindBskyImportButton(onRefresh);
  bindBskyChipActions(onRefresh);
}

/**
 * Acrescenta a cada comunidade a contagem de itens novos desde a última visita.
 *
 * @param {object[]} [communities=[]] Comunidades.
 * @returns {Promise<{enriched: object[], totalUnread: number}>}
 */
async function enrichCommunitiesWithUnread(communities = []) {
  let totalUnread = 0;
  const enriched = await Promise.all(
    communities.map(async (c) => {
      const lastSeen = getCommunityLastSeenTs(c.id);
      if (!lastSeen) return { ...c, unreadCount: 0 };
      const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: c.id }).catch(() => []);
      const unreadCount = computeCommunityUnreadCount(topics, lastSeen);
      totalUnread += unreadCount;
      return { ...c, unreadCount };
    }),
  );
  return { enriched, totalUnread };
}

/**
 * Monta listagem de comunidades.
 *
 * @returns {void}
 */
export async function showCommunities() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Comunidades"));
  render.renderLoading(main);

  try {
    const { items: remoteItems, gateway } = await gql.fetchCommunities().catch(async () => mock.mockCommunities());
    const localComms = await cacheNode.getLocalCommunities();
    const seen = new Set(localComms.map((c) => c.id));
    const officialVox = mock.MOCK_OFFICIAL_COMMUNITY_VOX;
    const hasVox = localComms.some((c) => c.id === "vox") || (remoteItems || []).some((c) => c.id === "vox");
    const merged = [
      ...(hasVox ? [] : [officialVox]),
      ...localComms,
      ...(remoteItems || []).filter((c) => !seen.has(c.id)).map((c) => ({ ...c, isLocalP2p: false })),
    ].sort((a, b) => (a.id === "vox" ? -1 : b.id === "vox" ? 1 : 0));
    const { enriched, totalUnread } = await enrichCommunitiesWithUnread(merged);
    main.innerHTML = "";
    if (gateway) render.renderGatewayBanner(main, gateway);
    render.renderHome(main, enriched, { totalUnread });
  } catch {
    main.innerHTML = "";
    const localComms = await cacheNode.getLocalCommunities();
    const fb = mock.mockCommunities();
    const list = [...localComms, ...fb.items].sort((a, b) => (a.id === "vox" ? -1 : b.id === "vox" ? 1 : 0));
    const { enriched, totalUnread } = await enrichCommunitiesWithUnread(list);
    render.renderHome(main, enriched, { totalUnread });
  }
}

/**
 * Monta feed por tag.
 *
 * @param {string} slug
 * @returns {void}
 */
export async function showTagFeed(slug) {
  const cleanSlug = hashtags.slugifyTag(slug) || slug;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", `#${cleanSlug}`));
  render.renderLoading(main);
  try {
    const posts = mod.filterFeedPosts(
      postOwnership.mapOwnLocalFlags(await cacheNode.getPostsByTag(cleanSlug), user),
    );
    render.renderTagFeed(main, cleanSlug, posts);
  } catch {
    render.renderTagFeed(main, cleanSlug, []);
  }
}
