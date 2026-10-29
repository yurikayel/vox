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
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";
import { attachPostMoreMenuHandlers } from "../render/post-more-menu.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";

let postOverlayMenuHandlersBound = false;
let quoteExternalBound = false;

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

function attachWelcomeFeedHintHandlers() {
  document.getElementById("btn-welcome-hint-dismiss")?.addEventListener("click", () => {
    welcomeProfile.markWelcomeIntroSeen();
    document.getElementById("welcome-feed-hint")?.remove();
  });
}

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

async function filterTopicsForActiveFeed(merged, activeFeed) {
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

function wireHomeInteractiveHandlers(activeFeed) {
  attachPostShareHandlers();
  attachPostMoreMenuHandlers();
  attachPostOverlayActionMenuHandlers();
  attachInlineComposerHandlers(() => showHome(activeFeed));
  attachWelcomeFeedHintHandlers();
  attachWelcomeTopicDismissHandlers(() => showHome(activeFeed));
  attachBskyManagerHandlers(() => showHome(activeFeed));
  attachQuoteExternalHandlers();
}

export async function showHome(feed = "for-you") {
  const validFeeds = ["for-you", "following", "external", "all"];
  const activeFeed = validFeeds.includes(feed) ? feed : "for-you";
  const user = await getActiveUser();
  const onboarding = user ? await ensureOnboardingSideEffects(user) : { dmJustSeeded: false };
  const main = render.renderShell({ ...makeShellProps(user, "home"), activeFeed, showFeedNav: true });
  render.renderLoading(main);
  const externalSubs = bskyFeed.loadBskySubscriptions();

  try {
    let remoteItems = [];
    let gateway = "";
    if (activeFeed === "following") {
      const watched = social.getWatchedProfiles();
      if (watched.length > 0) {
        const res = await gql.fetchTopicsByOwners(watched).catch(() => ({ items: [] }));
        remoteItems = res.items || [];
        gateway = res.gateway || "";
      }
    } else {
      const res = await gql.fetchRecentTopics().catch(async () => mock.mockRecentTopics());
      remoteItems = res.items || [];
      gateway = res.gateway || "";
    }
    const localPosts = (await cacheNode.getLocalPosts({ type: "topic" })).filter((p) => p.type !== "listing");
    const commMap = await buildCommunityTitleMap();
    const merged = mergeLocalAndRemoteTopics(localPosts, remoteItems, commMap, user);
    const filtered = await filterTopicsForActiveFeed(merged, activeFeed);
    const isWelcomeDismissed = localStorage.getItem("vox-welcome-post-dismissed") === "1";
    const welcomeTopic = welcomeProfile.getOfficialWelcomeTopic();
    const shouldIncludeWelcome = !isWelcomeDismissed && !filtered.some((p) => p.id === welcomeTopic.id);
    const withWelcome = shouldIncludeWelcome ? [welcomeTopic, ...filtered] : filtered;
    const finalTopics = mod.filterFeedPosts(withWelcome);

    main.innerHTML = "";
    if (gateway) render.renderGatewayBanner(main, gateway);
    render.renderFeed(main, finalTopics, { activeFeed, userRouteId: user || "", externalSubs });
  } catch {
    main.innerHTML = "";
    const localPosts = (await cacheNode.getLocalPosts({ type: "topic" })).filter((p) => p.type !== "listing");
    const fb = mock.mockRecentTopics();
    const merged = mergeLocalAndRemoteTopics(localPosts, fb.items, new Map(), user);
    const filtered = await filterTopicsForActiveFeed(merged, activeFeed);
    const isWelcomeDismissed = localStorage.getItem("vox-welcome-post-dismissed") === "1";
    const welcomeTopic = welcomeProfile.getOfficialWelcomeTopic();
    const shouldIncludeWelcome = !isWelcomeDismissed && !filtered.some((p) => p.id === welcomeTopic.id);
    const withWelcome = shouldIncludeWelcome ? [welcomeTopic, ...filtered] : filtered;
    const finalTopics = mod.filterFeedPosts(withWelcome);
    render.renderFeed(main, finalTopics, { activeFeed, userRouteId: user || "", externalSubs });
  }

  wireHomeInteractiveHandlers(activeFeed);
  if (onboarding.dmJustSeeded && activeFeed === "for-you") {
    share.showToast("Vox te mandou uma mensagem — veja em Mensagens 💬");
  }
}

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

export async function showCommunities() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Comunidades"));
  render.renderLoading(main);

  try {
    const { items: remoteItems, gateway, demo } = await gql.fetchCommunities().catch(async () => mock.mockCommunities());
    const localComms = await cacheNode.getLocalCommunities();
    const seen = new Set(localComms.map((c) => c.id));
    const merged = [
      ...localComms,
      ...(remoteItems || []).filter((c) => !seen.has(c.id)).map((c) => ({ ...c, isLocalP2p: false })),
    ];
    main.innerHTML = "";
    if (gateway) render.renderGatewayBanner(main, gateway);
    render.renderHome(main, merged);
  } catch {
    main.innerHTML = "";
    const localComms = await cacheNode.getLocalCommunities();
    const fb = mock.mockCommunities();
    render.renderHome(main, [...localComms, ...fb.items]);
  }
}

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
