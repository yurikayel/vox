import * as gql from "./graphql.js";
import * as render from "./render.js";
import * as mock from "./mock.js";
import * as wallet from "./wallet.js";
import * as upload from "./upload.js";
import * as share from "./share.js";
import * as mod from "./moderation.js";
import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import * as cryptoDm from "./crypto-dm.js";
import * as inbox from "./inbox.js";
import * as handles from "./handles.js";
import * as localAccount from "./local-account.js";
import * as demoSeed from "./demo-seed.js";
import * as social from "./social.js";
import * as pixKeyHelper from "./pix-key.js";
import * as listing from "./listing.js";
import * as gov from "./governance.js";
import * as brcode from "./brcode.js";
import * as hashtags from "./hashtags.js";
import * as frames from "./frames.js";
import * as postOwnership from "./post-ownership.js";
import * as communityMirror from "./community-mirror.js";
import { attachInlineComposerHandlers } from "./inline-composer.js";

function parseRoute() {
  if (typeof window !== "undefined" && window.location?.search) {
    const q = new URLSearchParams(window.location.search);
    const paramHandle = q.get("h");
    if (paramHandle) return { name: "handle-lookup", slug: paramHandle };
  }

  const hash = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = hash.split("?");
  const parts = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const query = new URLSearchParams(queryPart || "");

  if (!parts.length) return { name: "home", feed: (query.get("feed") || "for-you").toLowerCase() };
  if (parts[0] === "communities") return { name: "communities" };
  if (parts[0] === "perfil") return { name: "perfil", tab: (query.get("tab") || "posts").toLowerCase() };
  if (parts[0] === "pix" && parts[1]) {
    return { name: "pix-lookup", query: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "settings" && parts[1] === "network") {
    return { name: "network-settings" };
  }
  if (parts[0] === "h" && parts[1]) {
    return { name: "handle-lookup", slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "tag" && parts[1]) {
    return { name: "tag-feed", slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "dm") {
    if (parts[1]) return { name: "dm-thread", address: decodeURIComponent(parts[1]) };
    return { name: "dm-list" };
  }
  if (parts[0] === "c" && parts[1]) {
    if (parts[2] === "proposal" && parts[3]) {
      return {
        name: "proposal",
        communityId: decodeURIComponent(parts[1]),
        proposalId: decodeURIComponent(parts[3]),
      };
    }
    let tab = (query.get("tab") || "").toLowerCase();
    if (!tab && (parts[2] === "listings" || parts[2] === "classificados" || parts[2] === "feira")) {
      tab = "listings";
    }
    if (!tab && (parts[2] === "governance" || parts[2] === "governanca")) {
      tab = "governance";
    }
    let finalTab = "posts";
    if (tab === "listings") finalTab = "listings";
    else if (tab === "governance" || tab === "governanca") finalTab = "governance";

    return {
      name: "community",
      id: decodeURIComponent(parts[1]),
      tab: finalTab,
    };
  }
  if (parts[0] === "t" && parts[1]) {
    return {
      name: "topic",
      id: decodeURIComponent(parts[1]),
      communityId: query.get("c") || "",
    };
  }
  if (parts[0] === "u" && parts[1]) {
    const raw = decodeURIComponent(parts[1]);
    if (raw.startsWith("@")) {
      return { name: "handle-lookup", slug: raw.slice(1) };
    }
    return { name: "profile", address: raw, tab: (query.get("tab") || "posts").toLowerCase() };
  }
  if (parts[0] === "wallet") return { name: "wallet" };
  if (parts[0] === "compose") {
    if (parts[1] === "community") return { name: "compose-community" };
    if (parts[1] === "listing") return { name: "compose-listing", communityId: query.get("c") || "" };
    if (parts[1] === "proposal") return { name: "compose-proposal", communityId: query.get("c") || "" };
    if (parts[1] === "topic") return { name: "compose-topic", communityId: query.get("c") || "" };
    if (parts[1] === "reply") {
      return {
        name: "compose-reply",
        topicId: query.get("t") || "",
        communityId: query.get("c") || "",
      };
    }
  }
  return { name: "home" };
}

async function getActiveUser() {
  try {
    const w = await wallet.getAddress();
    if (w) return w;
  } catch {}
  return await localAccount.getRouteId();
}

function makeShellProps(user, activeTab, title = "", subtitle = "", breadcrumb = null) {
  const settings = peers.getPeerSettings();
  const metrics = peers.getPeerMetrics();
  const rtcStatus = peers.getRtcStatus();
  return {
    title,
    subtitle,
    breadcrumb,
    walletAddress: user,
    activeTab,
    metrics,
    rtcStatus,
    settings,
  };
}

function attachPostShareHandlers() {
  document.querySelectorAll(".btn-share-post").forEach((btn) => {
    btn.addEventListener("click", () => {
      share.shareTopic({
        title: btn.dataset.title || "Post no Vox",
        topicId: btn.dataset.id,
      });
    });
  });
}

async function showHome(feed = "for-you") {
  const activeFeed = feed === "following" ? "following" : "for-you";
  const user = await getActiveUser();
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
    render.renderDemoBanner(main);
    render.renderFeed(main, merged, { activeFeed, userRouteId: user || "" });
  }

  attachPostShareHandlers();
  attachInlineComposerHandlers(() => showHome(activeFeed));
}

async function showCommunities() {
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

async function showCommunity(communityId, tab = "posts") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Comunidade"));
  render.renderLoading(main);

  let topics = [];
  let meta = { id: communityId, title: communityId, owner: "" };
  let demo = false;
  let gateway = "";

  try {
    const res = await gql.fetchTopics(communityId).catch(() => mock.mockTopics(communityId));
    topics = res.items;
    demo = res.demo;
    gateway = res.gateway;
  } catch (e) {
    const fb = mock.mockTopics(communityId);
    topics = fb.items;
    demo = true;
  }

  // Tenta carregar detalhes da comunidade da lista remota ou local
  try {
    const comms = await gql.fetchCommunities().catch(() => mock.mockCommunities());
    const found = comms?.items?.find((c) => c.id === communityId);
    if (found) meta = found;
  } catch {}

  const localComms = await cacheNode.getLocalCommunities();
  const localFound = localComms.find((c) => c.id === communityId);
  if (localFound) meta = { ...meta, ...localFound };

  if (!meta.commercialEnabled && communityId === mock.MOCK_DEMO_COMMUNITY_FEIRA.id) {
    meta = { ...mock.MOCK_DEMO_COMMUNITY_FEIRA, ...meta, commercialEnabled: true };
  }

  // Mescla tópicos locais com remotos
  const localTopics = await cacheNode.getLocalPosts({ type: "topic", communityId });
  const seenT = new Set();
  const mergedTopics = [];
  for (const t of localTopics) {
    seenT.add(t.id);
    mergedTopics.push(postOwnership.withOwnLocalFlag({ ...t, isLocalP2p: true }, user));
  }
  for (const t of topics) {
    if (!seenT.has(t.id)) {
      seenT.add(t.id);
      mergedTopics.push({ ...t, isLocalP2p: false });
    }
  }

  // Moderação
  let modActions = [];
  try {
    modActions = await mod.fetchModActions(communityId);
  } catch {}
  const filteredTopics = mod.applyFilters(mergedTopics, modActions, meta.owner, meta.moderators);
  const isUserMod = mod.isModerator(user, meta.owner, meta.moderators);

  // Checagem de Membresia (local ou remota)
  let isMember = false;
  if (user) {
    try {
      const localMems = await cacheNode.getLocalPosts({ type: "membership", communityId });
      isMember = localMems.some((m) => m.author === user);
      if (!isMember) {
        const mems = await gql.fetchUserMemberships(user);
        isMember = mems.some((m) => m.communityId === communityId);
      }
    } catch {}
  }

  // Ofertas (Classificados)
  let listings = [];
  if (tab === "listings") {
    try {
      const localListings = await cacheNode.getLocalPosts({ type: "listing", communityId });
      const demoListings = (demo || communityId === "demo-feira-local")
        ? (mock.mockListings(communityId).items || [])
        : [];
      const seenL = new Set();
      for (const l of localListings) {
        seenL.add(l.id);
        listings.push(l);
      }
      for (const l of demoListings) {
        if (!seenL.has(l.id)) {
          seenL.add(l.id);
          listings.push(l);
        }
      }
    } catch {}
  }

  // Governança (Propostas)
  let proposals = [];
  try {
    const localProposals = await cacheNode.getLocalPosts({ type: "governance-proposal", communityId });
    const demoProps = (demo || communityId === "demo-aprenda-vox")
      ? (mock.mockProposals(communityId).items || [])
      : [];
    const seenP = new Set();
    for (const p of localProposals) {
      seenP.add(p.id);
      proposals.push(p);
    }
    for (const p of demoProps) {
      if (!seenP.has(p.id)) {
        seenP.add(p.id);
        proposals.push(p);
      }
    }
  } catch {}

  const hasMergedFeira = proposals.some(
    (p) => p.state === "merged" && (p.diffText || "").includes("commercialEnabled: true")
  );
  if (hasMergedFeira) {
    meta = { ...meta, commercialEnabled: true };
  }

  main.innerHTML = "";
  if (demo && !localTopics.length && tab !== "listings" && tab !== "governance") render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderCommunity(main, communityId, filteredTopics, meta, {
    isMember,
    isMod: isUserMod,
    walletAddress: user,
    activeTab: tab,
    listings,
    proposals,
  });

  if (tab === "posts") {
    void communityMirror.tryMirrorCommunityToRelay(meta, filteredTopics);
  }

  attachCommunityListingHandlers(main);
  attachPostShareHandlers();

  // Eventos na tela da comunidade
  const btnShare = document.getElementById("btn-share-comm");
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      share.shareCommunity({ title: meta.title || communityId, communityId });
    });
  }

  const btnJoin = document.getElementById("btn-join-comm");
  if (btnJoin && !isMember) {
    btnJoin.addEventListener("click", async () => {
      btnJoin.disabled = true;
      btnJoin.textContent = "Gravando…";
      try {
        const signedMem = await localAccount.signPayload({
          id: `mem_${communityId}_${user}`,
          type: "membership",
          communityId,
          joinedAt: Date.now(),
        });
        await cacheNode.saveLocalPost(signedMem);
        peers.broadcastGossip(signedMem);

        if (wallet.hasWallet()) {
          try {
            const tags = upload.buildTags("membership", { "Community-Id": communityId });
            await upload.postData({ communityId, joinedAt: Date.now() }, tags);
          } catch {}
        }
        share.showToast("Você agora é membro desta comunidade!");
        btnJoin.textContent = "✓ Membro";
      } catch (err) {
        share.showToast(`Erro ao entrar: ${err.message}`, "error");
        btnJoin.disabled = false;
        btnJoin.textContent = "★ Entrar";
      }
    });
  }

  // Evento Ocultar para moderadores
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId} para todos os membros desta comunidade?`)) return;
      e.target.disabled = true;
      try {
        const tags = upload.buildTags("mod-action", {
          "Community-Id": communityId,
          Action: "hide",
          Target: targetId,
        });
        await upload.postData({ action: "hide", target: targetId, communityId }, tags);
        share.showToast("Ação de moderação enviada.");
        e.target.closest(".card")?.remove();
      } catch (err) {
        share.showToast(`Erro na moderação: ${err.message}`, "error");
        e.target.disabled = false;
      }
    });
  });
}

function attachCommunityListingHandlers(main) {
  main.querySelectorAll(".btn-copy-pix").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const pix = btn.dataset.pix;
      if (!pix) return;
      const price = btn.dataset.price || "";
      const authorName = btn.dataset.authorName || "Vendedor";
      const title = btn.dataset.title || "Oferta";
      const numAmount = brcode.parseNumericAmount(price);
      if (numAmount) {
        openZapModal({ pixKey: pix, authorName, title, defaultAmount: parseFloat(numAmount) });
      } else {
        try {
          await navigator.clipboard.writeText(pix);
          share.showToast("Chave Pix copiada!");
        } catch {
          share.showToast(`Pix: ${pix}`);
        }
      }
    });
  });

  main.querySelectorAll(".btn-share-listing").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      share.shareListing({
        title: btn.dataset.title || "Oferta na Feira",
        communityId: btn.dataset.comm || "demo-feira-local",
        priceLabel: btn.dataset.price || "",
      });
    });
  });
}

async function showTopic(topicId, commIdParam = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Tópico"));
  render.renderLoading(main);

  let topic = { title: "Tópico", owner: "", communityId: commIdParam };
  let replies = [];
  let topicData = { body: "" };

  const localTopic = await cacheNode.getLocalPost(topicId);
  if (localTopic) {
    topic = postOwnership.withOwnLocalFlag(
      { ...localTopic, owner: localTopic.author, isLocalP2p: true },
      user
    );
    topicData = { body: localTopic.body };
  } else {
    const demoFallback = mock.MOCK_DEMO_TOPICS.find((t) => t.id === topicId);
    if (demoFallback) {
      topic = { ...demoFallback, owner: demoFallback.author, isLocalP2p: true };
      topicData = { body: demoFallback.body };
    } else {
      try {
        const fetchedTopic = await gql.fetchTopicById(topicId);
        if (fetchedTopic) topic = fetchedTopic;
      } catch {}
      try {
        topicData = await gql.fetchTransactionData(topicId);
      } catch {}
    }
  }

  let gateway = "";
  let demo = false;
  try {
    const res = await gql.fetchReplies(topicId);
    replies = res.items;
    gateway = res.gateway;
  } catch {
    const fb = mock.mockReplies(topicId);
    replies = fb.items;
    demo = true;
    if (!topic.title || topic.title === "Tópico") {
      topic = { title: "Como funciona o Vox P2P?", owner: "demo-owner", communityId: commIdParam };
      topicData = { body: "Rede cooperativa e soberana sem servidores caros." };
    }
  }

  // Mescla respostas locais P2P
  const localReplies = await cacheNode.getLocalPosts({ type: "reply", replyTo: topicId });
  const seenR = new Set();
  const mergedReplies = [];
  for (const r of localReplies) {
    seenR.add(r.id);
    mergedReplies.push({ ...r, owner: r.author, isLocalP2p: true });
  }
  for (const r of replies) {
    if (!seenR.has(r.id)) {
      seenR.add(r.id);
      mergedReplies.push({ ...r, isLocalP2p: false });
    }
  }
  if (!mergedReplies.length && mock.MOCK_REPLIES[topicId]) {
    for (const r of mock.MOCK_REPLIES[topicId]) {
      mergedReplies.push({ ...r, owner: r.author, isLocalP2p: true });
    }
  }

  // Moderação
  const finalCommId = topic.communityId || commIdParam;
  let modActions = [];
  if (finalCommId) {
    try {
      modActions = await mod.fetchModActions(finalCommId);
    } catch {}
  }
  const filteredReplies = mod.applyFilters(mergedReplies, modActions);
  const isUserMod = mod.isModerator(user, "", "");

  main.innerHTML = "";
  if (demo && !localTopic && !localReplies.length) render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderTopic(main, topicId, topic, filteredReplies, {
    topicData,
    isMod: isUserMod,
    communityId: finalCommId,
  });

  // Carrega corpos das respostas que não vieram nas tags
  filteredReplies.forEach(async (r) => {
    if (!r.isLocalP2p && (!r.body || r.body.startsWith("("))) {
      const d = await gql.fetchTransactionData(r.id);
      if (d?.body) {
        const el = document.getElementById(`reply-${r.id}`);
        const p = el?.querySelector(".reply-body");
        if (p) p.textContent = d.body;
      }
    }
  });

  // Evento Compartilhar
  const btnShare = document.getElementById("btn-share-topic");
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      share.shareTopic({
        title: topic.title || "Tópico no Vox",
        topicId,
        communityId: finalCommId,
      });
    });
  }

  // Mod hide em replies
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId}?`)) return;
      e.target.disabled = true;
      try {
        const tags = upload.buildTags("mod-action", {
          "Community-Id": finalCommId,
          Action: "hide",
          Target: targetId,
        });
        await upload.postData({ action: "hide", target: targetId }, tags);
        share.showToast("Item ocultado.");
        e.target.closest(".reply-item")?.remove();
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        e.target.disabled = false;
      }
    });
  });
}

async function showProfile(address, activeTab = "posts") {
  const user = await getActiveUser();
  const targetAddress = address || user;
  const isSelf = targetAddress === user || targetAddress === (await localAccount.getRouteId());
  const main = render.renderShell(makeShellProps(user, "profile", "Perfil"));
  render.renderLoading(main);

  const memberships = await gql.fetchUserMemberships(targetAddress);
  const localMems = await cacheNode.getLocalPosts({ type: "membership" });
  for (const m of localMems) {
    if (m.author === targetAddress && !memberships.some((x) => x.communityId === m.communityId)) {
      memberships.push({ id: m.id, communityId: m.communityId });
    }
  }

  const handle = await gql.fetchHandleForAddress(targetAddress);
  let conflictInfo = null;
  if (handle) {
    const hRes = await gql.fetchHandle(handle);
    if (hRes?.isConflict) conflictInfo = hRes;
  }

  let dmPub = null;
  if (isSelf) {
    dmPub = await cryptoDm.getPublicJwk();
  }

  let balance = "0.000";
  if (wallet.hasWallet() && isSelf) {
    try {
      balance = await wallet.getBalance(await wallet.getAddress());
    } catch {
      balance = "0.000";
    }
  }

  const mockProf = mock.getMockProfile(targetAddress);
  let displayName = isSelf ? localAccount.getDisplayName() : "";
  let profileBio = "";
  let pixKey = "";
  if (isSelf) {
    pixKey = localAccount.getPixKey() || "";
  } else if (mockProf?.pixKey) {
    pixKey = mockProf.pixKey;
  }
  const pixKeyMasked = pixKey ? pixKeyHelper.maskForDisplay(pixKey) : "";

  if (mockProf) {
    displayName = mockProf.name;
    profileBio = mockProf.bio;
    if (!memberships.some((x) => x.communityId === "demo-aprenda-vox")) {
      memberships.push({ id: `mem_${targetAddress}`, communityId: "demo-aprenda-vox" });
    }
  }

  // Busca posts deste autor
  const localPosts = await cacheNode.getLocalPosts({ type: "topic" });
  let authorPosts = localPosts.filter((p) => (p.author || p.owner) === targetAddress);
  if (isSelf) authorPosts = postOwnership.mapOwnLocalFlags(authorPosts, user);
  if (!authorPosts.length && mockProf) {
    authorPosts = mock.MOCK_DEMO_TOPICS.filter((t) => t.author === targetAddress);
  }

  // Busca posts favoritados com estrela ⭐
  const starredSet = new Set(social.getStarredPostIds());
  const allAvailablePosts = [...localPosts, ...mock.MOCK_DEMO_TOPICS];
  const seenStarred = new Set();
  const starredPosts = [];
  for (const p of allAvailablePosts) {
    if (starredSet.has(p.id) && !seenStarred.has(p.id)) {
      seenStarred.add(p.id);
      starredPosts.push(p);
    }
  }

  const githubHandle = isSelf ? social.getLocalGithubHandle() : (mockProf?.githubHandle || "");
  const readme = isSelf ? social.getLocalReadme() : (mockProf?.readme || "");
  const pinnedPostId = isSelf ? social.getPinnedPostId(targetAddress) : (mockProf?.pinnedPostId || "");

  main.innerHTML = "";
  render.renderProfile(main, targetAddress, memberships, isSelf, JSON.stringify(dmPub), {
    handle: handle || "",
    isConflict: Boolean(conflictInfo?.isConflict),
    claimants: conflictInfo?.claimants || [],
    displayName,
    profileBio,
    stats: mockProf?.stats || null,
    posts: authorPosts,
    starredPosts,
    hasWallet: wallet.hasWallet(),
    balance,
    pixKey,
    pixKeyMasked,
    githubHandle,
    readme,
    activeTab,
    pinnedPostId,
  });

  bindProfileButtons(user, targetAddress, isSelf, dmPub, activeTab);
}

function bindProfileButtons(user, address, isSelf, dmPub, activeTab = "posts") {
  const formPixKey = document.getElementById("form-pix-key");
  if (formPixKey && isSelf) {
    formPixKey.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("input-pix-key");
      const rawVal = input?.value.trim() || "";
      const feedback = document.getElementById("pix-feedback");
      if (!rawVal) {
        localAccount.clearPixKey();
        share.showToast("Chave Pix removida do perfil.");
        showProfile(address, activeTab);
        return;
      }
      const validation = pixKeyHelper.validatePixKey(rawVal);
      if (!validation.valid) {
        if (feedback) feedback.innerHTML = `<span style="color:var(--danger);">${validation.error}</span>`;
        return;
      }
      localAccount.setPixKey(validation.normalized);
      share.showToast("Chave Pix salva no seu perfil local!");
      showProfile(address, activeTab);
    });
  }

  const btnClearPix = document.getElementById("btn-clear-pix");
  if (btnClearPix && isSelf) {
    btnClearPix.addEventListener("click", () => {
      localAccount.clearPixKey();
      share.showToast("Chave Pix removida.");
      showProfile(address, activeTab);
    });
  }

  const formGithub = document.getElementById("form-github-handle");
  if (formGithub && isSelf) {
    formGithub.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("input-github-handle")?.value.trim() || "";
      social.setLocalGithubHandle(val);
      share.showToast(val ? "Perfil do GitHub salvo!" : "GitHub removido.");
      showProfile(address, activeTab);
    });
  }

  const btnClearGithub = document.getElementById("btn-clear-github");
  if (btnClearGithub && isSelf) {
    btnClearGithub.addEventListener("click", () => {
      social.setLocalGithubHandle("");
      share.showToast("GitHub removido.");
      showProfile(address, activeTab);
    });
  }

  const btnToggleReadme = document.getElementById("btn-toggle-edit-readme");
  const formReadme = document.getElementById("form-edit-readme");
  const readmeView = document.getElementById("readme-view");
  if (btnToggleReadme && formReadme) {
    btnToggleReadme.addEventListener("click", () => {
      const isHidden = formReadme.style.display === "none";
      formReadme.style.display = isHidden ? "block" : "none";
      if (readmeView) readmeView.style.display = isHidden ? "none" : "block";
    });
  }

  const btnCancelReadme = document.getElementById("btn-cancel-readme");
  if (btnCancelReadme && formReadme) {
    btnCancelReadme.addEventListener("click", () => {
      formReadme.style.display = "none";
      if (readmeView) readmeView.style.display = "block";
    });
  }

  if (formReadme && isSelf) {
    formReadme.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("input-profile-readme")?.value || "";
      social.setLocalReadme(val);
      share.showToast("README.md atualizado!");
      showProfile(address, activeTab);
    });
  }

  const btnCopyRoute = document.getElementById("btn-copy-author-route");
  if (btnCopyRoute) {
    btnCopyRoute.addEventListener("click", (e) => {
      const routeToCopy = e.currentTarget.dataset.route || address;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(routeToCopy);
        share.showToast("ID de rota copiado!");
      }
    });
  }
  const btnCopyDmLink = document.getElementById("btn-copy-my-dm-link");
  if (btnCopyDmLink) {
    btnCopyDmLink.addEventListener("click", () => {
      const link = `${window.location.origin}${window.location.pathname}#/dm/${encodeURIComponent(address)}`;
      navigator.clipboard.writeText(link);
      share.showToast("Link copiado para a área de transferência!");
    });
  }

  const formDisplayName = document.getElementById("form-display-name");
  if (formDisplayName) {
    formDisplayName.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("input-display-name")?.value.trim();
      localAccount.setDisplayName(name);
      share.showToast("Nome local atualizado!");
      showProfile(address);
    });
  }

  const btnGenWallet = document.getElementById("btn-generate-wallet");
  if (btnGenWallet) {
    btnGenWallet.addEventListener("click", async () => {
      btnGenWallet.disabled = true;
      btnGenWallet.textContent = "Gerando carteira…";
      try {
        await wallet.generateNewWallet();
        await syncIdentity();
        share.showToast("Carteira Arweave gerada com sucesso!");
        showProfile(address);
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btnGenWallet.disabled = false;
        btnGenWallet.textContent = "⚡ Gerar Carteira Arweave";
      }
    });
  }

  const btnDiscWallet = document.getElementById("btn-disconnect-wallet");
  if (btnDiscWallet) {
    btnDiscWallet.addEventListener("click", () => {
      if (confirm("Desconectar carteira Arweave deste navegador?")) {
        wallet.removeWallet();
        share.showToast("Carteira desconectada.");
        showProfile(address);
      }
    });
  }

  const btnCopy = document.getElementById("btn-copy-dmpub");
  if (btnCopy && dmPub) {
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(dmPub));
      share.showToast("Chave pública Dm-Pub copiada!");
    });
  }

  const btnPub = document.getElementById("btn-publish-dmpub");
  if (btnPub && isSelf && dmPub) {
    btnPub.addEventListener("click", async () => {
      if (!wallet.hasWallet()) {
        share.showToast("Conecte uma carteira Arweave para anunciar on-chain.", "error");
        return;
      }
      btnPub.disabled = true;
      btnPub.textContent = "Anunciando on-chain…";
      try {
        const pubStr = JSON.stringify(dmPub);
        const tags = upload.buildTags("profile-key", { "Dm-Pub": pubStr });
        await upload.postData({ type: "profile-key", dmPub: pubStr }, tags);
        share.showToast("Chave pública anunciada com sucesso!");
        btnPub.textContent = "✓ Anunciada";
      } catch (err) {
        share.showToast(`Erro ao anunciar: ${err.message}`, "error");
        btnPub.disabled = false;
        btnPub.textContent = "🌐 Publicar Chave on-chain";
      }
    });
  }

  const formClaim = document.getElementById("form-claim-handle");
  if (formClaim && isSelf) {
    formClaim.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!wallet.hasWallet()) {
        share.showToast("Conecte uma carteira Arweave para reivindicar handle on-chain.", "error");
        return;
      }
      const raw = document.getElementById("input-handle-slug")?.value.trim();
      const check = handles.validateSlug(raw);
      if (!check.valid) {
        share.showToast(check.error, "error");
        return;
      }
      const btn = document.getElementById("btn-submit-handle");
      btn.disabled = true;
      btn.textContent = "Gravando handle…";
      try {
        const tags = upload.buildTags("handle", {
          Handle: check.slug,
          "Owner-Addr": user,
        });
        await upload.postData({ handle: check.slug, owner: user }, tags);
        handles.cacheHandleMapping(check.slug, user);
        share.showToast(`Handle @${check.slug} gravado com sucesso!`);
        showProfile(user);
      } catch (err) {
        share.showToast(`Erro ao gravar handle: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Salvar @handle";
      }
    });
  }
}

async function showHandleLookup(rawSlug) {
  const user = await getActiveUser();
  const slug = handles.normalizeSlug(rawSlug);
  const main = render.renderShell(makeShellProps(user, "profile", `@${slug || "handle"}`));
  render.renderLoading(main, `Buscando perfil de @${slug}…`);

  const validation = handles.validateSlug(slug);
  if (!validation.valid) {
    main.innerHTML = "";
    render.renderError(main, `Handle inválido: ${validation.error}`);
    return;
  }

  const result = await gql.fetchHandle(slug);
  if (!result || !result.primaryOwner) {
    main.innerHTML = `
      <div class="card">
        <h2>@${render.escapeHtml(slug)}</h2>
        <div class="empty">
          <p>Nenhum endereço encontrado para o perfil <code>@${render.escapeHtml(slug)}</code>.</p>
          <a class="btn btn-outline" href="#/">Voltar ao início</a>
        </div>
      </div>`;
    return;
  }

  if (result.isConflict) {
    main.innerHTML = "";
    render.renderHandleConflict(main, slug, result.claimants);
    return;
  }

  location.hash = `#/u/${encodeURIComponent(result.primaryOwner)}`;
}

async function showWallet() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Carteira"));

  let balance = "0.000";
  if (user) {
    try {
      balance = await wallet.getBalance(user);
    } catch {
      balance = "Indisponível";
    }
  }

  render.renderWallet(main, {
    address: user,
    balance,
    hasWallet: wallet.hasWallet(),
  });

  // Evento Gerar Carteira
  const btnGen = document.getElementById("btn-generate-wallet");
  if (btnGen) {
    btnGen.addEventListener("click", async () => {
      btnGen.disabled = true;
      btnGen.textContent = "Gerando par de chaves Arweave…";
      try {
        const { address } = await wallet.generateNewWallet();
        await syncIdentity();
        share.showToast(`Carteira criada com sucesso!`);
        showWallet();
      } catch (err) {
        share.showToast(`Erro ao gerar: ${err.message}`, "error");
        btnGen.disabled = false;
        btnGen.textContent = "⚡ Gerar Nova Carteira";
      }
    });
  }

  // Evento Importar Carteira
  const formImport = document.getElementById("form-import-wallet");
  if (formImport) {
    formImport.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("wallet-jwk-input")?.value.trim();
      try {
        const jwk = JSON.parse(input);
        wallet.saveJwk(jwk);
        await syncIdentity();
        share.showToast("Carteira importada e salva localmente!");
        showWallet();
      } catch (err) {
        share.showToast("JSON JWK inválido. Verifique o formato.", "error");
      }
    });
  }

  // Evento Desconectar Carteira
  const btnDisc = document.getElementById("btn-disconnect-wallet");
  if (btnDisc) {
    btnDisc.addEventListener("click", () => {
      if (confirm("Remover a carteira deste navegador? Certifique-se de ter backup.")) {
        wallet.removeWallet();
        share.showToast("Carteira removida do navegador.");
        showWallet();
      }
    });
  }
}

async function showComposeCommunity() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Comunidade"));
  render.renderComposeCommunity(main);

  const form = document.getElementById("form-compose-community");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-comm");
      const id = document.getElementById("comm-id")?.value.trim().toLowerCase();
      const title = document.getElementById("comm-title")?.value.trim();
      const category = document.getElementById("comm-category")?.value.trim();
      const desc = document.getElementById("comm-desc")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Assinando…";
      try {
        const signed = await localAccount.signPayload({
          id: "c_" + id,
          type: "community",
          communityId: id,
          title,
          category,
          description: desc,
        });
        await cacheNode.saveLocalPost(signed);
        peers.broadcastGossip(signed);

        if (wallet.hasWallet()) {
          try {
            const tags = upload.buildTags("community", {
              "Community-Id": id,
              Title: title,
              Category: category,
              Description: desc,
            });
            await upload.postData({ id, title, category, description: desc }, tags);
          } catch {}
        }

        share.showToast("Comunidade criada na rede!");
        location.hash = `#/c/${encodeURIComponent(id)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Comunidade";
      }
    });
  }
}

async function showComposeTopic(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Novo Post"));
  render.renderComposeTopic(main, communityId);

  const form = document.getElementById("form-compose-topic");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-topic");
      const finalComm = communityId || document.getElementById("topic-comm-id")?.value.trim().toLowerCase() || "geral";
      const title = document.getElementById("topic-title")?.value.trim();
      const body = document.getElementById("topic-body")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Publicando…";
      try {
        const topicId = "top_" + Math.random().toString(36).slice(2, 10);
        const signed = await localAccount.signPayload({
          id: topicId,
          type: "topic",
          communityId: finalComm,
          title,
          body,
        });
        await cacheNode.saveLocalPost(signed);
        peers.broadcastGossip(signed);

        if (wallet.hasWallet()) {
          try {
            const tags = upload.buildTags("topic", {
              "Community-Id": finalComm,
              "Topic-Title": title,
              Title: title,
              "Local-Origin-Id": topicId,
            });
            await upload.postData({ title, body, communityId: finalComm }, tags);
          } catch {}
        }

        share.showToast("Post publicado na rede!");
        location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(finalComm)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Post";
      }
    });
  }
}

async function showComposeListing(communityId) {
  const targetComm = communityId || mock.MOCK_DEMO_COMMUNITY_FEIRA.id;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Oferta"));

  let meta = { id: targetComm, title: targetComm, commercialEnabled: false };
  try {
    const localC = await cacheNode.getLocalPost(targetComm);
    if (localC) {
      meta = { ...localC, commercialEnabled: Boolean(localC.commercialEnabled) };
    } else if (targetComm === mock.MOCK_DEMO_COMMUNITY_FEIRA.id) {
      meta = mock.MOCK_DEMO_COMMUNITY_FEIRA;
    } else {
      const commRes = await gql.fetchCommunity(targetComm).catch(() => null);
      if (commRes) meta = commRes;
    }
  } catch {}

  if (!listing.isCommercialEnabled(meta)) {
    main.innerHTML = `<div class="card"><div class="error">Esta comunidade não possui feira comunitária ativada por governança.</div><p style="margin-top:1rem;"><a href="#/c/${encodeURIComponent(targetComm)}" class="btn btn-outline btn-sm">← Voltar à comunidade</a></p></div>`;
    return;
  }

  const defaultPix = (await localAccount.getPixKey()) || "";
  render.renderComposeListing(main, targetComm, meta.title, { defaultPix });

  document.getElementById("form-compose-listing")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleComposeListingSubmit(user, targetComm);
  });
}

async function handleComposeListingSubmit(user, communityId) {
  const title = document.getElementById("listing-title")?.value?.trim() || "";
  const priceLabel = document.getElementById("listing-price")?.value?.trim() || "";
  const locationLabel = document.getElementById("listing-location")?.value?.trim() || "";
  const contactPix = document.getElementById("listing-pix")?.value?.trim() || "";
  const image = document.getElementById("listing-image")?.value?.trim() || "";
  const body = document.getElementById("listing-body")?.value?.trim() || "";

  const val = listing.validateListingInput({ title, body, priceLabel });
  if (!val.valid) return share.showToast(val.error, "error");

  let normalizedPix = "";
  if (contactPix) {
    const pixVal = pixKeyHelper.validatePixKey(contactPix);
    if (!pixVal.ok) {
      return share.showToast(`Chave Pix inválida: ${pixVal.errorPt}`, "error");
    }
    normalizedPix = pixVal.normalized;
  }

  const btn = document.getElementById("btn-submit-listing");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Publicando…";
  }

  try {
    const listingId = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const draft = listing.buildListingDraft({
      id: listingId,
      communityId,
      title,
      body,
      priceLabel,
      locationLabel,
      contactPix: normalizedPix,
      image,
      author: user,
      owner: user,
      listingStatus: "available",
    });
    const signed = await localAccount.signPayload(draft);
    const check = listing.validateSignedListingGossip(signed);
    if (!check.valid) {
      throw new Error(check.error || "Oferta inválida");
    }
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
    share.showToast("Oferta publicada na feira!");
    location.hash = `#/c/${encodeURIComponent(communityId)}?tab=listings`;
  } catch (err) {
    share.showToast(`Erro ao publicar oferta: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publicar na Feira";
    }
  }
}

async function showProposal(communityId, proposalId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Proposta de Governança"));
  render.renderLoading(main);

  const data = await fetchProposalData(communityId, proposalId, user);
  if (!data?.proposal) {
    main.innerHTML = `<div class="empty card"><p>Proposta não encontrada.</p><a href="#/c/${encodeURIComponent(communityId)}?tab=governance" class="btn btn-outline">← Voltar</a></div>`;
    return;
  }

  const { proposal, tally, userVote, isEligible, isMember } = data;
  main.innerHTML = "";
  render.renderProposalDetail(main, proposal, tally, {
    userVote,
    isEligible,
    community: { id: communityId, title: communityId },
    isMember,
    userAddress: user,
  });

  attachProposalVotingHandlers(proposal, user);
}

async function fetchProposalData(communityId, proposalId, user) {
  let proposal = await cacheNode.getLocalPost(proposalId);
  if (!proposal) {
    proposal = mock.MOCK_DEMO_PROPOSALS.find((p) => p.id === proposalId) || null;
  }
  if (!proposal) return null;

  const votes = await loadProposalVotes(proposalId);
  const localMems = await cacheNode.getLocalPosts({ type: "membership", communityId: proposal.communityId });
  const userMem = localMems.find((m) => m.author === user);
  const isMember = Boolean(userMem);
  const pCreatedAt = Number(proposal.createdAt || proposal.ts || 0);
  const isEligible = isMember && gov.isEligibleToVote({
    membershipTs: Number(userMem?.joinedAt || userMem?.ts || 0),
    proposalCreatedAt: pCreatedAt,
  });

  const tally = gov.computeTally({ proposal, votes, memberships: localMems, now: Date.now() });
  const userVote = votes.filter((v) => (v.author || v.owner) === user).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;

  return { proposal, votes, tally, userVote, isEligible, isMember };
}

async function loadProposalVotes(proposalId) {
  const localVotes = await cacheNode.getLocalPosts({ type: "governance-vote", proposalId });
  const mockVotesList = mock.MOCK_DEMO_VOTES[proposalId] || [];
  const seenV = new Set();
  const votes = [];
  for (const v of localVotes) {
    seenV.add(v.id || `${v.author}_${v.choice}`);
    votes.push(v);
  }
  for (const v of mockVotesList) {
    const key = v.id || `${v.author}_${v.choice}`;
    if (!seenV.has(key)) {
      seenV.add(key);
      votes.push(v);
    }
  }
  return votes;
}

function attachProposalVotingHandlers(proposal, user) {
  const buttons = document.querySelectorAll(".vote-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const choice = btn.dataset.choice;
      if (!choice || !user) return;
      buttons.forEach((b) => (b.disabled = true));
      btn.textContent = "Assinando…";
      try {
        const signedVote = await localAccount.signPayload({
          id: `vote_${proposal.id}_${user}_${Date.now()}`,
          type: "governance-vote",
          proposalId: proposal.id,
          choice,
          communityId: proposal.communityId,
          author: user,
          owner: user,
          ts: Date.now(),
        });
        await cacheNode.saveLocalPost(signedVote);
        peers.broadcastGossip(signedVote);
        share.showToast(`Voto "${choice}" registrado!`);
        showProposal(proposal.communityId, proposal.id);
      } catch (err) {
        share.showToast(`Erro ao votar: ${err.message}`, "error");
        buttons.forEach((b) => (b.disabled = false));
      }
    });
  });
}

async function showComposeProposal(communityId) {
  const targetComm = communityId || mock.MOCK_DEMO_COMMUNITY.id;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Proposta"));

  let commMeta = { id: targetComm, title: targetComm };
  try {
    const localC = await cacheNode.getLocalPost(targetComm);
    if (localC) commMeta = localC;
    else if (targetComm === mock.MOCK_DEMO_COMMUNITY.id) commMeta = mock.MOCK_DEMO_COMMUNITY;
  } catch {}

  render.renderComposeProposal(main, targetComm, commMeta.title);
  attachComposeProposalHandlers(targetComm, user);
}

function attachComposeProposalHandlers(communityId, user) {
  const form = document.getElementById("form-compose-proposal");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("prop-title")?.value || "";
    const body = document.getElementById("prop-body")?.value || "";
    const diffText = document.getElementById("prop-diff")?.value || "";

    const val = gov.validateProposalInput({ title, body, diffText, communityId });
    if (!val.valid) return share.showToast(val.error, "error");

    const btn = document.getElementById("btn-submit-proposal");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Publicando…";
    }
    await publishProposal({ communityId, title: val.title, body: val.body, diffText: val.diffText, user, btn });
  });
}

async function publishProposal({ communityId, title, body, diffText, user, btn }) {
  try {
    const now = Date.now();
    const signedProposal = await localAccount.signPayload({
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "governance-proposal",
      communityId,
      title,
      body,
      diffText,
      author: user,
      owner: user,
      createdAt: now,
      closesAt: now + 7 * 24 * 3600 * 1000,
      minQuorum: 2,
      state: "open",
      ts: now,
    });
    await cacheNode.saveLocalPost(signedProposal);
    peers.broadcastGossip(signedProposal);
    share.showToast("Proposta publicada na governança!");
    location.hash = `#/c/${encodeURIComponent(communityId)}/proposal/${encodeURIComponent(signedProposal.id)}`;
  } catch (err) {
    share.showToast(`Erro ao publicar proposta: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publicar Proposta Assinada";
    }
  }
}

async function showComposeReply(topicId, communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Responder"));
  render.renderComposeReply(main, topicId, communityId);

  const form = document.getElementById("form-compose-reply");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-reply");
      const body = document.getElementById("reply-body")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Enviando…";
      try {
        await persistLocalReply(topicId, communityId, body);
        share.showToast("Resposta enviada!");
        location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(communityId)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Enviar Resposta";
      }
    });
  }
}

async function persistLocalReply(topicId, communityId, body) {
  const replyId = "rep_" + Math.random().toString(36).slice(2, 10);
  const signed = await localAccount.signPayload({
    id: replyId,
    type: "reply",
    replyTo: topicId,
    communityId,
    body,
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  if (!wallet.hasWallet()) return signed;
  try {
    const tags = upload.buildTags("reply", {
      "Reply-To": topicId,
      "Community-Id": communityId,
      "Local-Origin-Id": replyId,
    });
    await upload.postData({ replyTo: topicId, body, communityId }, tags);
  } catch {}
  return signed;
}

async function loadInlineReplies(topicId) {
  let local = [];
  try {
    local = await cacheNode.getLocalPosts({ type: "reply", replyTo: topicId });
  } catch {
    local = [];
  }
  const seen = new Set();
  const out = [];
  for (const r of local) {
    seen.add(r.id);
    out.push({ ...r, isLocalP2p: true });
  }
  for (const r of mock.mockReplies(topicId).items) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function setCommentOpen(btn, panel, open) {
  panel.hidden = !open;
  panel.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle("active", open);
}

function closeOtherCommentPanels(keep) {
  document.querySelectorAll(".post-comments.is-open").forEach((panel) => {
    if (panel === keep) return;
    const article = panel.closest("article");
    const otherBtn = article?.querySelector(".btn-comment");
    if (otherBtn) setCommentOpen(otherBtn, panel, false);
  });
}

function fillCommentFeed(panel, replies) {
  const slot = panel.querySelector(".post-comments-feed");
  if (slot) slot.outerHTML = render.renderCommentList(replies);
  panel.dataset.loaded = "1";
}

async function togglePostComments(btn) {
  const article = btn.closest("article");
  const panel = article?.querySelector(".post-comments");
  if (!panel) return;
  const opening = panel.hasAttribute("hidden");
  if (!opening) {
    setCommentOpen(btn, panel, false);
    return;
  }
  closeOtherCommentPanels(panel);
  setCommentOpen(btn, panel, true);
  if (panel.dataset.loaded === "1") {
    panel.querySelector(".post-comment-input")?.focus();
    return;
  }
  const slot = panel.querySelector(".post-comments-feed");
  if (slot) slot.innerHTML = `<p class="post-comments-empty">Carregando respostas…</p>`;
  fillCommentFeed(panel, await loadInlineReplies(panel.dataset.topic));
  panel.querySelector(".post-comment-input")?.focus();
}

function appendInlineReply(panel, reply) {
  let list = panel?.querySelector(".post-comment-list");
  if (!list) {
    const feed = panel?.querySelector(".post-comments-feed");
    if (feed) feed.innerHTML = `<ul class="post-comment-list"></ul>`;
    list = panel?.querySelector(".post-comment-list");
  }
  panel?.querySelector(".post-comments-empty")?.remove();
  if (list) list.insertAdjacentHTML("beforeend", render.renderInlineReplyItem(reply));
}

function bumpReplyCount(article) {
  const el = article?.querySelector(".count-replies");
  if (!el) return;
  el.textContent = String((Number(el.textContent) || 0) + 1);
}

async function onInlineReplySubmit(form) {
  const body = form.querySelector(".post-comment-input")?.value.trim();
  if (!body) return;
  const btn = form.querySelector(".btn-inline-reply");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const signed = await persistLocalReply(form.dataset.topic, form.dataset.comm || "", body);
    appendInlineReply(form.closest(".post-comments"), signed);
    bumpReplyCount(form.closest("article"));
    form.reset();
    const panel = form.closest(".post-comments");
    if (panel) panel.dataset.loaded = "1";
    share.showToast("Resposta enviada!");
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Responder";
  }
}

function bindNetworkSettingsForm() {
  const form = document.getElementById("form-network-settings");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const paused = document.getElementById("net-pause")?.checked || false;
    const enabled = !paused;
    const maxMb = Number(document.getElementById("net-max-mb")?.value) || 25;
    const dailyCapMb = Number(document.getElementById("net-daily-cap")?.value) || 50;
    const wifiOnly = document.getElementById("net-wifi")?.checked || false;
    const commOnly = document.getElementById("net-comm-only")?.checked || false;
    const backgroundRelay = document.getElementById("net-bg-relay")?.checked || false;
    const webrtcEnabled = document.getElementById("net-webrtc")?.checked !== false;
    const customSignalingUrl = document.getElementById("net-signaling-url")?.value.trim() || "";
    const customRelayHttpUrl = document.getElementById("net-relay-http-url")?.value.trim() || "";
    const turnUrls = document.getElementById("net-turn-url")?.value.trim() || "";
    const turnUser = document.getElementById("net-turn-user")?.value.trim() || "";
    const turnPass = document.getElementById("net-turn-pass")?.value || "";

    localStorage.setItem("vox-custom-signaling-url", customSignalingUrl);
    inbox.saveRelayHttpUrl(customRelayHttpUrl);
    peers.saveCustomTurnConfig({ urls: turnUrls, username: turnUser, credential: turnPass });

    peers.savePeerSettings({
      enabled,
      maxMb,
      wifiOnly,
      commOnly,
      backgroundRelay,
      dailyCapMb,
      webrtcEnabled,
    });
    cacheNode.enforceMaxCacheSize(maxMb);
    share.showToast(enabled ? "Preferências salvas: nó leve ativo!" : "Preferências salvas: nó pausado.");
    showNetworkSettings();
  });
}

function bindNetworkSettingsButtons() {
  const btnClear = document.getElementById("btn-clear-cache");
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      if (confirm("Limpar todo o cache local de transações no navegador?")) {
        await cacheNode.clearCache();
        share.showToast("Cache local esvaziado.");
        showNetworkSettings();
      }
    });
  }

  const btnCheckRelay = document.getElementById("btn-check-relay");
  if (btnCheckRelay) {
    btnCheckRelay.addEventListener("click", async () => {
      btnCheckRelay.disabled = true;
      btnCheckRelay.textContent = "Verificando…";
      const status = await peers.checkDesktopRelay();
      btnCheckRelay.disabled = false;
      btnCheckRelay.textContent = "Verificar Relay Desktop";
      if (status.online) {
        share.showToast(`Relay desktop online! ${status.data?.cachedCount || 0} itens em disco.`);
      } else {
        share.showToast(`Relay HTTP não detectado em ${inbox.getRelayHttpUrl()}.`, "error");
      }
      showNetworkSettings();
    });
  }

  const btnReqNotif = document.getElementById("btn-request-notif");
  if (btnReqNotif) {
    btnReqNotif.addEventListener("click", async () => {
      const perm = await peers.requestNotificationPermission();
      if (perm === "granted") {
        share.showToast("Notificações de status permitidas!");
      } else {
        share.showToast("Permissão de notificação não concedida.", "error");
      }
      showNetworkSettings();
    });
  }

  const btnResetDemo = document.getElementById("btn-reset-demo");
  if (btnResetDemo) {
    btnResetDemo.addEventListener("click", async () => {
      btnResetDemo.disabled = true;
      btnResetDemo.textContent = "Restaurando…";
      await demoSeed.resetDemoSeed();
      share.showToast("Tour de demonstração restaurado com sucesso!");
      showNetworkSettings();
    });
  }
}

async function showNetworkSettings() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Sua rede"));

  const settings = peers.getPeerSettings();
  const metrics = peers.getPeerMetrics();
  const cacheStats = await cacheNode.getCacheStats();
  const relayStatus = await peers.checkDesktopRelay();
  const dailyUsage = peers.getDailyUsage();
  const notifPermission = "Notification" in window ? Notification.permission : "unsupported";
  const rtcStatus = peers.getRtcStatus();
  const customSignalingUrl = localStorage.getItem("vox-custom-signaling-url") || "";
  const customRelayHttpUrl = localStorage.getItem(inbox.RELAY_HTTP_STORAGE_KEY) || "";
  const relayHttpUrl = inbox.getRelayHttpUrl();
  const customTurn = peers.getCustomTurnConfig();

  render.renderNetworkSettings(main, {
    settings,
    metrics,
    cacheStats,
    relayStatus,
    dailyUsage,
    notifPermission,
    rtcStatus,
    customSignalingUrl,
    customRelayHttpUrl,
    customTurn,
    relayHttpUrl,
  });

  bindNetworkSettingsForm();
  bindNetworkSettingsButtons();
}

async function syncIdentity() {
  const user = await getActiveUser();
  if (user) {
    const dmPub = await cryptoDm.getPublicJwk();
    peers.announceIdentity(user, dmPub);
  }
}

async function pollInboxMessages(user) {
  if (!user) return 0;
  try {
    const sealedList = await inbox.pullMine(user);
    let count = 0;
    for (const env of sealedList) {
      try {
        const text = await cryptoDm.open(env);
        await cacheNode.saveDmMessage({
          id: env.id,
          peerAddress: env.from,
          from: env.from,
          to: env.to,
          text,
          ts: env.ts || Date.now(),
          status: "received",
        });
        await inbox.deleteSealed(user, env.id);
        count++;
      } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

async function showDmList() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Mensagens"));

  if (!user) {
    main.innerHTML = `<div class="card"><h2>Mensagens Diretas</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }

  await pollInboxMessages(user);
  const convs = await cacheNode.getDmConversations();
  render.renderDmList(main, convs, user);

  document.getElementById("btn-copy-my-dm-link")?.addEventListener("click", () => {
    const link = `${window.location.origin}${window.location.pathname}#/dm/${encodeURIComponent(user)}`;
    navigator.clipboard.writeText(link);
    share.showToast("Link copiado para a área de transferência!");
  });

  document.getElementById("form-new-dm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const peer = document.getElementById("dm-peer-input")?.value.trim();
    if (peer) location.hash = `#/dm/${encodeURIComponent(peer)}`;
  });

  document.getElementById("btn-pull-inbox")?.addEventListener("click", async () => {
    const pulled = await pollInboxMessages(user);
    share.showToast(pulled > 0 ? `${pulled} nova(s) mensagem(ns)!` : "Inbox verificado: sem novas mensagens.");
    showDmList();
  });
}

async function handleSendDmSubmit(user, peerAddress, peerDmPub) {
  const input = document.getElementById("dm-message-input");
  const text = input?.value.trim();
  if (!text) return;
  const btn = document.getElementById("btn-send-dm");
  if (btn) btn.disabled = true;

  try {
    const envelope = await cryptoDm.seal(peerDmPub, text, { from: user, to: peerAddress });
    let status = "sent";
    const transport = peers.sendDirectMessageTransport(peerAddress, envelope);
    if (transport === "rtc") {
      status = "delivered";
    } else {
      try {
        await inbox.pushSealed(peerAddress, envelope);
        status = "queued-relay";
      } catch {
        status = "pending-retry";
      }
    }

    await cacheNode.saveDmMessage({
      id: envelope.id,
      peerAddress,
      from: user,
      to: peerAddress,
      text,
      ts: envelope.ts,
      status,
    });
    if (input) input.value = "";
    showDmThread(peerAddress);
  } catch (err) {
    share.showToast(`Erro ao cifrar: ${err.message}`, "error");
    if (btn) btn.disabled = false;
  }
}

async function showDmThread(peerAddress) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Conversa"));

  if (!user) {
    main.innerHTML = `<div class="card"><h2>Conversa Direta</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }

  await pollInboxMessages(user);
  const messages = await cacheNode.getDmMessages(peerAddress);
  const isRtcOnline = peers.isAddressConnectedRtc(peerAddress);
  let peerDmPub = gql.getCachedUserDmPub(peerAddress) || peers.getPeerDmPub(peerAddress);
  if (!peerDmPub) peerDmPub = await gql.fetchUserDmPub(peerAddress);

  render.renderDmThread(main, peerAddress, messages, user, {
    isRtcOnline,
    hasDmPub: Boolean(peerDmPub),
  });

  const c = document.getElementById("dm-thread-container");
  if (c) c.scrollTop = c.scrollHeight;

  document.getElementById("btn-save-manual-dmpub")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(document.getElementById("input-manual-dmpub")?.value.trim());
      gql.cacheUserDmPub(peerAddress, parsed);
      share.showToast("Chave Dm-Pub salva localmente!");
      showDmThread(peerAddress);
    } catch {
      share.showToast("JSON inválido.", "error");
    }
  });

  if (peerDmPub) {
    document.getElementById("form-send-dm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendDmSubmit(user, peerAddress, peerDmPub);
    });
  }
}

function initDmListeners() {
  peers.onDirectMessage(async (envelope) => {
    const user = await getActiveUser();
    if (!user || envelope.to !== user) return;
    try {
      const text = await cryptoDm.open(envelope);
      await cacheNode.saveDmMessage({
        id: envelope.id,
        peerAddress: envelope.from,
        from: envelope.from,
        to: envelope.to,
        text,
        ts: envelope.ts || Date.now(),
        status: "received",
      });
      const cur = parseRoute();
      if (cur.name === "dm-thread" && cur.address === envelope.from) {
        showDmThread(envelope.from);
      } else {
        share.showToast(`Nova mensagem de ${envelope.from.slice(0, 8)}…`);
      }
    } catch {}
  });
}

function checkCantinaGate() {
  const passed = localStorage.getItem("vox-cantina-v1");
  if (passed) {
    checkPactModal();
    return;
  }

  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderCantinaGate(modalContainer);

  const btnEnter = document.getElementById("btn-cantina-enter");
  if (btnEnter) {
    btnEnter.addEventListener("click", () => {
      localStorage.setItem("vox-cantina-v1", "true");
      render.closeCantinaGate(modalContainer);
      checkPactModal();
    });
  }
}

function checkPactModal() {
  const accepted = localStorage.getItem("vox-pact-accepted");
  if (accepted) return;

  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderPactModal(modalContainer);

  const btnAccept = document.getElementById("btn-pact-accept");
  if (btnAccept) {
    btnAccept.addEventListener("click", () => {
      localStorage.setItem("vox-pact-accepted", "true");
      render.closePactModal(modalContainer);
      share.showToast("Bem-vindo ao Vox! Rede ativa.");
    });
  }

  const btnSettings = document.getElementById("btn-pact-settings");
  if (btnSettings) {
    btnSettings.addEventListener("click", () => {
      localStorage.setItem("vox-pact-accepted", "true");
      render.closePactModal(modalContainer);
      location.hash = "#/settings/network";
    });
  }
}

async function showPixLookup(query) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Consulta Pix"));
  render.renderLoading(main);

  let foundProfile = null;
  const cleanQuery = String(query || "").trim();
  const myPix = localAccount.getPixKey();
  const myRouteId = await localAccount.getRouteId();

  if (myPix && (myPix.toLowerCase() === cleanQuery.toLowerCase() || pixKeyHelper.normalizePixKey(cleanQuery).normalized === myPix)) {
    foundProfile = {
      routeId: myRouteId,
      name: localAccount.getDisplayName() || "Você",
      handle: "",
      pixKey: myPix,
      pixKeyMasked: pixKeyHelper.maskForDisplay(myPix),
    };
  } else {
    const mockFound = mock.findMockByPixKey(cleanQuery);
    if (mockFound) {
      foundProfile = {
        routeId: mockFound.routeId,
        name: mockFound.name,
        handle: mockFound.handle,
        pixKey: mockFound.pixKey,
        pixKeyMasked: pixKeyHelper.maskForDisplay(mockFound.pixKey),
      };
    }
  }

  main.innerHTML = "";
  render.renderPixLookup(main, query, foundProfile);
}

async function showTagFeed(slug) {
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

async function route() {
  checkCantinaGate();
  const r = parseRoute();
  if (r.name === "home") return showHome(r.feed);
  if (r.name === "tag-feed") return showTagFeed(r.slug);
  if (r.name === "communities") return showCommunities();
  if (r.name === "perfil") return showProfile(null, r.tab);
  if (r.name === "pix-lookup") return showPixLookup(r.query);
  if (r.name === "network-settings") return showNetworkSettings();
  if (r.name === "handle-lookup") return showHandleLookup(r.slug);
  if (r.name === "dm-list") return showDmList();
  if (r.name === "dm-thread") return showDmThread(r.address);
  if (r.name === "community") return showCommunity(r.id, r.tab);
  if (r.name === "proposal") return showProposal(r.communityId, r.proposalId);
  if (r.name === "topic") return showTopic(r.id, r.communityId);
  if (r.name === "profile") return showProfile(r.address, r.tab);
  if (r.name === "wallet") return showWallet();
  if (r.name === "compose-community") return showComposeCommunity();
  if (r.name === "compose-listing") return showComposeListing(r.communityId);
  if (r.name === "compose-proposal") return showComposeProposal(r.communityId);
  if (r.name === "compose-topic") return showComposeTopic(r.communityId);
  if (r.name === "compose-reply") return showComposeReply(r.topicId, r.communityId);
  return showHome();
}

function initGossipListeners() {
  peers.onGossipPost((item) => {
    const cur = parseRoute();
    if (cur.name === "home") {
      showHome(cur.feed);
    } else if (cur.name === "community" && cur.id === item.communityId) {
      showCommunity(cur.id, cur.tab);
    } else if (cur.name === "proposal" && (cur.proposalId === item.proposalId || cur.proposalId === item.id)) {
      showProposal(cur.communityId, cur.proposalId);
    } else if (cur.name === "topic" && (cur.id === item.id || cur.id === item.replyTo)) {
      showTopic(cur.id, cur.communityId);
    } else if (cur.name === "tag-feed" && cur.slug) {
      showTagFeed(cur.slug);
    }
    if (item?.type === "topic") {
      const isUpdate = Boolean(item.editedAt && item.editedAt > 0);
      share.showToast(isUpdate ? "Publicação atualizada na rede." : `Novo post na rede: ${item.title?.slice(0, 24) || "..."}`);
    } else if (item?.type === "listing") {
      share.showToast(`Nova oferta na feira: ${item.title?.slice(0, 24) || "..."}`);
    } else if (item?.type === "governance-proposal") {
      share.showToast(`Nova proposta de governança: ${item.title?.slice(0, 24) || "..."}`);
    } else if (item?.type === "governance-vote") {
      share.showToast(`Novo voto registrado na proposta!`);
    } else if (item?.type === "frame-action") {
      share.showToast(`Nova interação no mini-app do post!`);
    }
  });

  peers.onGossipTombstone((tombstone) => {
    const cur = parseRoute();
    if (cur.name === "home") {
      showHome(cur.feed);
    } else if (cur.name === "community") {
      showCommunity(cur.id, cur.tab);
    } else if (cur.name === "topic" && cur.id === tombstone.id) {
      location.hash = "#/";
    } else if (cur.name === "tag-feed" && cur.slug) {
      showTagFeed(cur.slug);
    }
  });
}

function getOrCreateZapModalContainer() {
  let container = document.getElementById("zap-modal-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "zap-modal-container";
    document.body.appendChild(container);
  }
  return container;
}

function openZapModal({ pixKey, authorName = "Autor", title = "", defaultAmount = 5 } = {}) {
  if (!pixKey) return;
  const container = getOrCreateZapModalContainer();
  render.renderZapModal(container, { authorName, pixKey, title, defaultAmount });
  bindZapModalEvents(container, { pixKey, authorName });
}

function bindZapModalEvents(container, { pixKey, authorName }) {
  const overlay = container.querySelector("#zap-modal-overlay");
  const area = container.querySelector("#zap-payload-area");
  const customContainer = container.querySelector(".zap-custom-container");
  const customInput = container.querySelector("#zap-custom-input");

  const update = (amt) => {
    try {
      area.value = brcode.buildPixPayload({ key: pixKey, name: authorName, amount: amt, description: "Apoio Vox" });
    } catch {
      area.value = pixKey;
    }
  };

  container.querySelectorAll(".btn-zap-val").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".btn-zap-val").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-outline");
      });
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");

      const val = btn.dataset.val;
      if (val === "custom") {
        if (customContainer) customContainer.style.display = "block";
        const customAmt = customInput ? brcode.parseNumericAmount(customInput.value) : null;
        update(customAmt);
      } else {
        if (customContainer) customContainer.style.display = "none";
        update(parseFloat(val));
      }
    });
  });

  if (customInput) {
    customInput.addEventListener("input", () => {
      const parsed = brcode.parseNumericAmount(customInput.value);
      update(parsed);
    });
  }

  const copyBtn = container.querySelector("#btn-copy-zap-payload");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = area?.value || pixKey;
      try {
        await navigator.clipboard.writeText(text);
        share.showToast("⚡ Pix Copia e Cola copiado! Cole no seu banco.");
      } catch {
        share.showToast(`Pix: ${text}`);
      }
      render.closeZapModal(container);
    });
  }

  const closeBtn = container.querySelector(".btn-close-zap");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => render.closeZapModal(container));
  }
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) render.closeZapModal(container);
    });
  }
}

async function resolvePostForFrame(postId) {
  let post = await cacheNode.getLocalPost(postId);
  if (!post?.frame) {
    const tour = mock.mockRecentTopics()?.items || [];
    post = tour.find((p) => p.id === postId) || null;
  }
  return post;
}

async function executeFrameAction(frame, postId, index, label) {
  const user = await getActiveUser();
  const payload = frames.buildFrameActionPayload({
    postId,
    frameKind: frame.kind,
    buttonIndex: index,
    buttonLabel: label,
    userAddress: user,
  });
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);

  frames.saveUserFrameAction(postId, { buttonIndex: index, buttonLabel: label, author: user });
  const localAction = frames.getUserFrameAction(postId);
  const existing = await cacheNode.getLocalPosts({ type: "frame-action", postId });
  return frames.getFrameState(frame, existing, localAction);
}

async function handleFrameActionClick(btn) {
  const postId = btn.dataset.postId;
  const index = Number(btn.dataset.index) || 1;
  const label = btn.dataset.label || "";
  const action = btn.dataset.action || "post";
  const target = btn.dataset.target || "";

  if (action === "link" && target) {
    window.location.href = target;
    return;
  }

  const container = btn.closest(".vox-frame");
  const buttons = container ? container.querySelectorAll(".btn-frame-action") : [];
  buttons.forEach((b) => (b.disabled = true));

  try {
    const post = await resolvePostForFrame(postId);
    const parsed = frames.parseFrame(post?.frame);
    if (!parsed.valid) throw new Error(parsed.error);

    const state = await executeFrameAction(parsed.frame, postId, index, label);
    const contentEl = document.getElementById(`frame-content-${postId}`);
    if (contentEl) contentEl.innerHTML = render.renderFrameContentHtml(parsed.frame, state);

    buttons.forEach((b) => {
      b.disabled = false;
      b.classList.toggle("active", Number(b.dataset.index) === index);
    });
    const msg = parsed.frame.kind === "poll" ? `Voto "${label}" computado!` : parsed.frame.kind === "petition" ? "Abaixo-assinado assinado! ✓" : "Cálculo CLT atualizado!";
    share.showToast(msg);
  } catch (err) {
    buttons.forEach((b) => (b.disabled = false));
    share.showToast(`Erro no frame: ${err.message}`, "error");
  }
}

function getPostEditModalContainer() {
  let container = document.getElementById("post-edit-modal-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "post-edit-modal-container";
    document.body.appendChild(container);
  }
  return container;
}

function closePostEditModalUi() {
  const container = document.getElementById("post-edit-modal-container");
  if (container) render.closePostEditModal(container);
}

async function openPostEditModal(postId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(postId);
  if (!postOwnership.canMutateLocalPost(existing, user)) {
    share.showToast("Só é possível editar posts seus.", "error");
    return;
  }
  const container = getPostEditModalContainer();
  render.renderPostEditModal(container, {
    id: existing.id,
    title: existing.title || "",
    body: existing.body || "",
    hasImage: Boolean(existing.image),
  });
  const editTextarea = container.querySelector("#post-edit-text");
  const editChar = container.querySelector("#post-edit-char");
  const syncEditChar = () => {
    const len = editTextarea?.value?.length || 0;
    if (editChar) editChar.textContent = `${len} / 5000`;
  };
  editTextarea?.addEventListener("input", syncEditChar);
  editTextarea?.focus();
  const overlay = container.querySelector("#post-edit-modal-overlay");
  overlay?.addEventListener("click", (ev) => {
    if (ev.target === overlay) closePostEditModalUi();
  });
  container.querySelector(".btn-close-post-edit")?.addEventListener("click", closePostEditModalUi);
  container.querySelector(".btn-cancel-post-edit")?.addEventListener("click", closePostEditModalUi);
  overlay?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closePostEditModalUi();
  });
  container.querySelector("#form-post-edit")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById("btn-post-edit-save");
    const textRaw = document.getElementById("post-edit-text")?.value?.trim() || "";
    const { title, body } = postOwnership.deriveTopicTitleFromBody(textRaw);
    const removeImage = Boolean(document.getElementById("post-edit-remove-image")?.checked);
    if (!textRaw || !title || !body) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Salvando…";
    }
    try {
      const { sig: _s, pubKey: _p, ...rest } = existing;
      const signed = await localAccount.signPayload({
        ...rest,
        title,
        body,
        image: removeImage ? "" : rest.image || "",
        imageAlt: removeImage ? "" : rest.imageAlt || "",
        ts: rest.ts,
        editedAt: Date.now(),
      });
      await cacheNode.saveLocalPost(signed);
      peers.broadcastGossipUpdate(signed);
      closePostEditModalUi();
      share.showToast("Publicação atualizada.");
      route();
    } catch (err) {
      share.showToast(`Erro ao editar: ${err.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Salvar";
      }
    }
  });
}

async function handleDeletePost(postId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(postId);
  if (!postOwnership.canMutateLocalPost(existing, user)) {
    share.showToast("Só é possível apagar posts seus.", "error");
    return;
  }
  const label = (existing.title || "esta publicação").slice(0, 80);
  if (!confirm(`Apagar "${label}"? Esta ação não pode ser desfeita.`)) return;
  const tombstone = await postOwnership.createPostTombstone(existing);
  await cacheNode.saveTombstone(tombstone);
  peers.broadcastGossipDelete(tombstone);
  share.showToast("Publicação apagada.");
  const onTopic = location.hash.replace(/^#\/?/, "").startsWith(`t/${postId}`);
  if (onTopic) location.hash = "#/";
  else route();
}

function initSocialInteractions() {
  document.addEventListener("click", (e) => {
    const btnEdit = e.target.closest(".btn-post-edit");
    if (btnEdit) {
      e.preventDefault();
      openPostEditModal(btnEdit.dataset.id);
      return;
    }

    const btnDel = e.target.closest(".btn-post-delete");
    if (btnDel) {
      e.preventDefault();
      handleDeletePost(btnDel.dataset.id);
      return;
    }

    // Open Frames (v6.2 Mini-apps)
    const btnFrame = e.target.closest(".btn-frame-action:not([disabled])");
    if (btnFrame) {
      e.preventDefault();
      handleFrameActionClick(btnFrame);
      return;
    }

    const btnComment = e.target.closest(".btn-comment");
    if (btnComment) {
      e.preventDefault();
      togglePostComments(btnComment);
      return;
    }

    // Pix Zap / Apoiar post (v6.0)
    const btnZap = e.target.closest(".btn-zap-post:not(.disabled)");
    if (btnZap) {
      e.preventDefault();
      const pixKey = btnZap.dataset.pix;
      const authorName = btnZap.dataset.authorName || "Autor";
      const title = btnZap.dataset.title || "";
      openZapModal({ pixKey, authorName, title });
      return;
    }

    // Like button
    const btnLike = e.target.closest(".btn-like");
    if (btnLike) {
      e.preventDefault();
      const postId = btnLike.dataset.id;
      const baseCount = btnLike.dataset.count || 0;
      const res = social.toggleLike(postId, baseCount);
      btnLike.classList.toggle("active", res.liked);
      const icon = btnLike.querySelector(".icon-heart");
      if (icon) {
        icon.setAttribute("fill", res.liked ? "currentColor" : "none");
      }
      const countLabel = btnLike.querySelector(".count-likes");
      if (countLabel) {
        countLabel.textContent = res.count > 0 ? res.count : "";
      }
      return;
    }

    // Star button (GitHub UX)
    const btnStar = e.target.closest(".btn-star");
    if (btnStar) {
      e.preventDefault();
      const postId = btnStar.dataset.id;
      const baseCount = btnStar.dataset.count || 0;
      const res = social.toggleStar(postId, baseCount);
      btnStar.classList.toggle("active", res.starred);
      const icon = btnStar.querySelector(".icon-star");
      if (icon) {
        icon.setAttribute("fill", res.starred ? "currentColor" : "none");
      }
      const countLabel = btnStar.querySelector(".count-stars");
      if (countLabel) {
        countLabel.textContent = res.count > 0 ? res.count : "";
      }
      share.showToast(res.starred ? "Estrela adicionada ⭐ (nos seus Estrelados)!" : "Estrela removida.");
      return;
    }

    // Save/Bookmark button
    const btnSave = e.target.closest(".btn-save");
    if (btnSave) {
      e.preventDefault();
      const postId = btnSave.dataset.id;
      const saved = social.toggleSave(postId);
      btnSave.classList.toggle("active", saved);
      const icon = btnSave.querySelector(".icon-bookmark");
      if (icon) {
        icon.setAttribute("fill", saved ? "currentColor" : "none");
      }
      share.showToast(saved ? "Post salvo nos seus favoritos!" : "Post removido dos favoritos.");
      return;
    }

    // Copiar Markdown do post (GH-A)
    const btnCopyMd = e.target.closest(".btn-copy-md");
    if (btnCopyMd) {
      e.preventDefault();
      const mdText = render.formatPostMarkdown({
        id: btnCopyMd.dataset.id,
        title: btnCopyMd.dataset.title || "",
        body: btnCopyMd.dataset.body || "",
        authorDisplay: btnCopyMd.dataset.author || "",
        authorHandle: btnCopyMd.dataset.handle || "",
      });
      if (navigator.clipboard) {
        navigator.clipboard.writeText(mdText).then(() => {
          share.showToast("Post copiado em Markdown! 📋");
        }).catch(() => {
          share.showToast("Erro ao copiar.", "error");
        });
      }
      return;
    }

    // Watch / Acompanhar perfil (GitHub UX)
    const btnWatch = e.target.closest(".btn-watch-profile");
    if (btnWatch) {
      e.preventDefault();
      const routeId = btnWatch.dataset.route;
      const watching = social.toggleWatch(routeId);
      btnWatch.classList.toggle("btn-primary", !watching);
      btnWatch.classList.toggle("btn-outline", watching);
      btnWatch.textContent = watching ? "✓ Acompanhando" : "👁️ Acompanhar (Watch)";
      share.showToast(watching ? "Agora você acompanha este autor no feed Seguindo!" : "Deixou de acompanhar este autor.");
      return;
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest(".post-comment-composer");
    if (!form) return;
    e.preventDefault();
    onInlineReplySubmit(form);
  });
}

window.addEventListener("hashchange", () => route());
initDmListeners();
initGossipListeners();
initSocialInteractions();
syncIdentity();
demoSeed.ensureDemoSeed().finally(() => route());
