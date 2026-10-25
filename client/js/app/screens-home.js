/** @file Home feed, communities list, tag feed. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as handles from "../handles.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as listingUi from "../listing-ui.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as brcode from "../brcode.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as oauthProfile from "../oauth-profile.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";
import { attachPostMoreMenuHandlers } from "../render/post-more-menu.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";

let postOverlayMenuHandlersBound = false;

/** Fecha popovers ⋯ utilitários (Apoiar/Salvar/…) ao clicar fora — só no hero foto. */
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

export async function showHome(feed = "for-you") {
  const activeFeed = feed === "following" ? "following" : "for-you";
  const user = await getActiveUser();
  const onboarding = user ? await ensureOnboardingSideEffects(user) : { dmJustSeeded: false };
  const main = render.renderShell({
    ...makeShellProps(user, "home"),
    activeFeed,
    showFeedNav: true,
  });
  render.renderLoading(main);

  try {
    const { items: remoteItems, gateway, demo } = await gql.fetchRecentTopics().catch(async () => mock.mockRecentTopics());
    const rawLocal = await cacheNode.getLocalPosts({ type: "topic" });
    const localPosts = rawLocal.filter((p) => p.type !== "listing");

    // Constrói mapa de títulos de comunidades para exibição limpa no feed
    const commMap = new Map();
    try {
      const commsRes = await gql.fetchCommunities().catch(() => mock.mockCommunities());
      for (const c of (commsRes?.items || [])) {
        if (c.id && c.title) commMap.set(c.id, c.title);
      }
      const localComms = await cacheNode.getLocalCommunities();
      for (const c of localComms) {
        if (c.id && c.title) commMap.set(c.id, c.title);
      }
    } catch {}

    const seen = new Set();
    const merged = [];
    for (const p of localPosts) {
      seen.add(p.id);
      merged.push(
        postOwnership.withOwnLocalFlag(
          {
            ...p,
            isLocalP2p: true,
            communityTitle: commMap.get(p.communityId) || p.communityTitle || "",
          },
          user
        )
      );
    }
    for (const p of (remoteItems || [])) {
      if (p.type !== "listing" && !seen.has(p.id)) {
        seen.add(p.id);
        merged.push({
          ...p,
          isLocalP2p: false,
          communityTitle: commMap.get(p.communityId) || p.communityTitle || "",
        });
      }
    }

    let finalTopics = merged;
    if (activeFeed === "following") {
      const watchedSet = new Set(social.getWatchedProfiles());
      finalTopics = merged.filter((p) => watchedSet.has(p.author || p.owner));
    }
    finalTopics = mod.filterFeedPosts(finalTopics);

    main.innerHTML = "";
    if (demo && !localPosts.length) render.renderDemoBanner(main);
    else if (gateway) render.renderGatewayBanner(main, gateway);
    render.renderFeed(main, finalTopics, { activeFeed, userRouteId: user || "" });
  } catch (e) {
    main.innerHTML = "";
    const rawLocal = await cacheNode.getLocalPosts({ type: "topic" });
    const localPosts = rawLocal.filter((p) => p.type !== "listing");
    const fb = mock.mockRecentTopics();
    let merged = [
      ...postOwnership.mapOwnLocalFlags(
        localPosts.map((p) => ({ ...p, isLocalP2p: true })),
        user
      ),
      ...fb.items.filter((p) => p.type !== "listing").map((p) => ({ ...p, isLocalP2p: false })),
    ];
    if (activeFeed === "following") {
      const watchedSet = new Set(social.getWatchedProfiles());
      merged = merged.filter((p) => watchedSet.has(p.author || p.owner));
    }
    merged = mod.filterFeedPosts(merged);
    render.renderDemoBanner(main);
    render.renderFeed(main, merged, { activeFeed, userRouteId: user || "" });
  }

  attachPostShareHandlers();
  attachPostMoreMenuHandlers();
  attachPostOverlayActionMenuHandlers();
  attachInlineComposerHandlers(() => showHome(activeFeed));
  attachWelcomeFeedHintHandlers();
  if (onboarding.dmJustSeeded && activeFeed === "for-you") {
    share.showToast("Vox Brasil te mandou uma mensagem — veja em Mensagens 💬");
  }
}

export async function showCommunities() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Comunidades"));
  render.renderLoading(main);

  try {
    const { items: remoteItems, gateway, demo } = await gql.fetchCommunities().catch(async () => mock.mockCommunities());
    const localComms = await cacheNode.getLocalCommunities();

    const seen = new Set();
    const merged = [];
    for (const c of localComms) {
      seen.add(c.id);
      merged.push(c);
    }
    for (const c of (remoteItems || [])) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push({ ...c, isLocalP2p: false });
      }
    }

    main.innerHTML = "";
    if (demo && !localComms.length) render.renderDemoBanner(main);
    else if (gateway) render.renderGatewayBanner(main, gateway);
    render.renderHome(main, merged);
  } catch (e) {
    main.innerHTML = "";
    const localComms = await cacheNode.getLocalCommunities();
    const fb = mock.mockCommunities();
    const merged = [...localComms, ...fb.items];
    render.renderDemoBanner(main);
    render.renderHome(main, merged);
  }
}

export async function showTagFeed(slug) {
  const cleanSlug = hashtags.slugifyTag(slug) || slug;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", `#${cleanSlug}`));
  render.renderLoading(main);
  try {
    const posts = postOwnership.mapOwnLocalFlags(await cacheNode.getPostsByTag(cleanSlug), user);
    render.renderTagFeed(main, cleanSlug, posts);
  } catch {
    render.renderTagFeed(main, cleanSlug, []);
  }
}
