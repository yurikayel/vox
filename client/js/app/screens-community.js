import * as welcomeProfile from "../vox-welcome-profile.js";
/** @file Community, topic, listings, proposals. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as listingUi from "../listing-ui.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as postOwnership from "../post-ownership.js";
import * as communityMirror from "../community-mirror.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as communitySeed from "../community-seed-checklist.js";
import { computeCommunityNeighborStats } from "../render/community.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import { buildProposalPossePayload, firePosseWebhooks, loadPosseWebhooks } from "../posse-dispatch.js";
import { buildChatSummaryCopy } from "../chat-bridge.js";
import { getCachedBskyPostById } from "../bsky-feed.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers, shareTopicUnlessQuarantined } from "./context.js";
import { route } from "./navigation.js";
import { openZapModal } from "./zap-modal.js";

function updateCommunityTabIndicator(commEl, tab) {
  const nav = commEl.querySelector(".community-vox-nav");
  if (!nav) return;
  const target = (tab === "listings" || tab === "governance" || tab === "members") ? tab : "posts";
  nav.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === target);
  });
}

async function fetchRawCommunityTopics(communityId) {
  try {
    const res = await gql.fetchTopics(communityId).catch(() => mock.mockTopics(communityId));
    return { topics: res.items, demo: res.demo, gateway: res.gateway };
  } catch {
    const fb = mock.mockTopics(communityId);
    return { topics: fb.items, demo: true, gateway: "" };
  }
}

async function resolveCommunityMetadata(communityId) {
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
    const localUpdates = await cacheNode.getLocalPosts({ type: "community_update", communityId });
    if (localUpdates?.length) meta = { ...meta, ...localUpdates[localUpdates.length - 1] };
  } catch {}
  if (!meta.commercialEnabled && communityId === mock.MOCK_DEMO_COMMUNITY_FEIRA.id) {
    meta = { ...mock.MOCK_DEMO_COMMUNITY_FEIRA, ...meta, commercialEnabled: true };
  }
  return meta;
}

function mergeTopicsWithLocalReplies(localTopics, topics, user, replyCounts) {
  const seen = new Set();
  const merged = [];
  for (const t of localTopics) {
    seen.add(t.id);
    merged.push(postOwnership.withOwnLocalFlag({ ...t, isLocalP2p: true }, user));
  }
  for (const t of topics) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      merged.push({ ...t, isLocalP2p: false });
    }
  }
  for (const t of merged) {
    const extra = replyCounts[t.id] || 0;
    if (extra > 0 || !t.repliesCount) {
      t.repliesCount = (Number(t.repliesCount) || 0) + extra;
    }
  }
  return merged;
}

async function loadCommunityMetaAndTopics(communityId, user) {
  const { topics, demo, gateway } = await fetchRawCommunityTopics(communityId);
  const meta = await resolveCommunityMetadata(communityId);
  const localTopics = await cacheNode.getLocalPosts({ type: "topic", communityId });
  const replyCounts = await cacheNode.getReplyCountsMap().catch(() => ({}));
  const merged = mergeTopicsWithLocalReplies(localTopics, topics, user, replyCounts);

  let modActions = [];
  try { modActions = await mod.fetchModActions(communityId); } catch {}
  const filteredTopics = mod.applyFilters(merged, modActions, meta.owner, meta.moderators);
  const isUserMod = mod.isModerator(user, meta.owner, meta.moderators);

  return { meta, filteredTopics, localTopics, demo, gateway, isUserMod };
}

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

async function loadCommunityTabSpecifics(communityId, tab, user, demo) {
  const listings = tab === "listings" ? await loadCommunityListings(communityId, user, demo) : [];
  const proposals = await loadCommunityProposals(communityId, demo);
  return { listings, proposals };
}

async function checkCommunityMembership(communityId, user) {
  if (!user) return false;
  try {
    const localMems = await cacheNode.getLocalPosts({ type: "membership", communityId });
    if (localMems.some((m) => m.author === user)) return true;
    const mems = await gql.fetchUserMemberships(user);
    return mems.some((m) => m.communityId === communityId);
  } catch {
    return false;
  }
}

function buildCommunityRecentPeople(filteredTopics, meta, user, isMember, tab) {
  const recentPeople = (tab === "posts" || tab === "members")
    ? peopleIndex.extractRecentAuthors(filteredTopics)
    : [];
  const peopleSet = new Set(recentPeople.map((p) => p.routeId));
  if (meta.owner && !peopleSet.has(meta.owner)) {
    const ownerName = profileDirectory.getAuthorDisplaySync(meta.owner) || meta.owner;
    recentPeople.unshift({ routeId: meta.owner, name: ownerName });
    peopleSet.add(meta.owner);
  }
  if (user && isMember && !peopleSet.has(user)) {
    const selfName = localAccount.getDisplayName() || user;
    recentPeople.push({ routeId: user, name: selfName });
  }
  return recentPeople;
}

function resolveCommunitySeedChecklist(communityId, user, meta, topicCount, peerSettings) {
  if (!user || !communitySeed.shouldOfferSeedRitual(communityId, user, meta)) return null;
  const seedState = communitySeed.loadSeedState(communityId);
  if (!communitySeed.isSeedComplete(seedState, { topicCount, peerEnabled: peerSettings.enabled })) {
    return {
      state: seedState,
      ctx: { topicCount, peerEnabled: peerSettings.enabled, commOnly: peerSettings.commOnly },
    };
  }
  communitySeed.finalizeSeedIfComplete(communityId, { topicCount, peerEnabled: peerSettings.enabled });
  return null;
}

function buildCommunityGenesisPayload(communityId, meta, topics) {
  return {
    type: "vox-community-genesis",
    version: 1,
    communityId,
    meta,
    exportedAt: Date.now(),
    topicsCount: topics.length,
    topics: topics.map((t) => ({
      id: t.id, title: t.title, body: t.body, author: t.author || t.owner, ts: t.ts, image: t.image, audio: t.audio, video: t.video,
    })),
  };
}

function bindGenesisExport(communityId, meta, filteredTopics) {
  const btn = document.getElementById("btn-export-comm-genesis");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const data = buildCommunityGenesisPayload(communityId, meta, filteredTopics);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comunidade-${communityId}-genesis.json`;
    a.click();
    URL.revokeObjectURL(url);
    share.showToast("Gênesis da comunidade exportado com sucesso!");
  });
}

function bindSeedAndNeighborControls(communityId, meta, peerSettings) {
  document.getElementById("btn-neighbor-comm-only")?.addEventListener("click", () => {
    peers.savePeerSettings({ ...peerSettings, commOnly: true, enabled: true });
    communitySeed.saveSeedState(communityId, { commOnlyNudgeSeen: true });
    share.showToast("Modo Apoiador: cache focado nas suas comunidades.");
    location.hash = "#/settings/network#net-comm-only-wrap";
  });
  document.getElementById("btn-seed-invite")?.addEventListener("click", () => {
    communitySeed.recordSeedInvite(communityId);
    share.shareCommunity({ title: meta.title || communityId, communityId });
    share.showToast(`Convite ${communitySeed.loadSeedState(communityId).invitesSent}/2 registrado.`);
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  });
  document.getElementById("btn-seed-dismiss")?.addEventListener("click", () => {
    communitySeed.dismissSeedRitual(communityId);
    share.showToast("Checklist dispensado — você pode reabrir em Configurações → Rede.");
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  });
}

async function uploadCommunityPhoto(file, communityId, meta) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  const updatePayload = {
    id: `comm_update_${communityId}_${Date.now()}`,
    type: "community_update",
    communityId,
    image: dataUrl,
    avatar: dataUrl,
    updatedAt: Date.now(),
  };
  const signed = await localAccount.signPayload(updatePayload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  const img = document.querySelector(".community-avatar-img");
  if (img) { img.src = dataUrl; img.style.display = "block"; }
  else {
    const box = document.querySelector(".community-avatar-box");
    if (box) box.innerHTML = `<img class="community-avatar-img" src="${dataUrl}" alt="${meta.title || communityId}" />`;
  }
  const fb = document.querySelector(".community-avatar-fallback");
  if (fb) fb.style.display = "none";
  share.showToast("Foto da comunidade atualizada!");
}

function bindCommunityPhotoInput(communityId, meta) {
  const input = document.getElementById("input-comm-photo-file");
  if (!input) return;
  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadCommunityPhoto(file, communityId, meta);
    } catch (err) {
      share.showToast(`Erro ao atualizar foto: ${err.message}`, "error");
    }
  });
}

async function submitCommunityJoin(communityId, user, btn) {
  btn.disabled = true; btn.textContent = "Gravando…";
  try {
    const signed = await localAccount.signPayload({ id: `mem_${communityId}_${user}`, type: "membership", communityId, joinedAt: Date.now() });
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
    if (wallet.hasWallet()) {
      try { await upload.postData(new Uint8Array(), upload.buildTags("membership", { "Community-Id": communityId })); } catch {}
    }
    share.showToast(i18n.joinedToast);
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  } catch (err) {
    share.showToast(`Erro ao participar: ${err.message}`, "error");
    btn.disabled = false; btn.textContent = "Participar da Comunidade";
  }
}

async function submitCommunityLeave(communityId, user, btn) {
  btn.disabled = true; btn.textContent = "Gravando…";
  try {
    const signed = await localAccount.signPayload({ id: `mem_leave_${communityId}_${user}`, type: "membership_leave", communityId, leftAt: Date.now() });
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
    if (wallet.hasWallet()) {
      try { await upload.postData(new Uint8Array(), upload.buildTags("membership_leave", { "Community-Id": communityId })); } catch {}
    }
    share.showToast(i18n.leftToast);
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  } catch (err) {
    share.showToast(`Erro ao sair: ${err.message}`, "error");
    btn.disabled = false; btn.textContent = "Sair da Comunidade";
  }
}

function bindCommunityMembershipToggle(communityId, user, isMember) {
  const btnJoin = document.getElementById("btn-join-comm");
  if (btnJoin && !isMember) {
    btnJoin.addEventListener("click", () => void submitCommunityJoin(communityId, user, btnJoin));
  }
  const btnLeave = document.getElementById("btn-leave-comm");
  if (btnLeave && isMember) {
    btnLeave.addEventListener("click", () => void submitCommunityLeave(communityId, user, btnLeave));
  }
}

function bindCommunityModHideButtons(communityId) {
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId}?`)) return;
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

function bindCommunityHeaderEvents(main, communityId, meta, user, isMember, peerSettings, filteredTopics) {
  document.querySelectorAll(".btn-community-add-contact").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.route;
      if (!id) return;
      contacts.addContact(id, btn.dataset.label || "");
      share.showToast("Contato adicionado.");
      btn.disabled = true; btn.textContent = "✓";
    });
  });

  const btnShare = document.getElementById("btn-share-comm");
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      share.shareCommunity({ title: meta.title || communityId, communityId });
      if (user && communitySeed.shouldOfferSeedRitual(communityId, user, meta)) {
        communitySeed.recordSeedInvite(communityId);
      }
    });
  }

  bindGenesisExport(communityId, meta, filteredTopics);
  bindSeedAndNeighborControls(communityId, meta, peerSettings);
  bindCommunityPhotoInput(communityId, meta);
  bindCommunityMembershipToggle(communityId, user, isMember);
  bindCommunityModHideButtons(communityId);
}

function renderCommunityBanners(main, base, tab) {
  if (base.demo && !base.localTopics.length && tab !== "listings" && tab !== "governance") {
    render.renderDemoBanner(main);
  } else if (base.gateway) {
    render.renderGatewayBanner(main, base.gateway);
  }
}

function mountFullCommunityPage(communityId, tab, user, base, specifics, meta, isMember, recentPeople, memberCount) {
  const main = render.renderShell(makeShellProps(user, "communities", "Comunidade"));
  render.renderLoading(main);
  main.innerHTML = "";
  renderCommunityBanners(main, base, tab);

  const peerSettings = peers.getPeerSettings();
  const neighborStats = computeCommunityNeighborStats({
    recentPeople, communityId, memberCount, gatewayState: gatewayTelemetry.getGatewayHealthState(),
    isDemo: Boolean(base.demo || meta.demo || communityId === mock.MOCK_DEMO_COMMUNITY.id),
  });
  const seedChecklist = resolveCommunitySeedChecklist(communityId, user, meta, base.filteredTopics.length, peerSettings);

  render.renderCommunity(main, communityId, base.filteredTopics, meta, {
    isMember, isMod: base.isUserMod, walletAddress: user, activeTab: tab, listings: specifics.listings,
    proposals: specifics.proposals, recentPeople, neighborStats, commOnly: peerSettings.commOnly,
    seedChecklist, mirrorStatus: communityMirror.getMirrorStatusForCommunity(communityId),
  });
  if (tab === "posts") void communityMirror.tryMirrorCommunityToRelay(meta, base.filteredTopics);
  attachCommunityListingHandlers(main);
  attachPostShareHandlers();
  bindCommunityHeaderEvents(main, communityId, meta, user, isMember, peerSettings, base.filteredTopics);
}

function buildCommunityTabProps(communityId, meta, base, specifics, recentPeople, isMember, memberCount) {
  return {
    communityId, commTitle: meta.title || communityId, meta, topics: base.filteredTopics,
    listings: specifics.listings, proposals: specifics.proposals, recentPeople, isMember, memberCount,
  };
}

export async function showCommunity(communityId, tab = "posts") {
  const user = await getActiveUser();
  const existingComm = document.querySelector(`.community-vox-page[data-community-id="${communityId}"]`);
  const slot = existingComm?.querySelector("#community-tab-content");

  const base = await loadCommunityMetaAndTopics(communityId, user);
  let meta = base.meta;
  const specifics = await loadCommunityTabSpecifics(communityId, tab, user, base.demo);
  if (specifics.proposals.some((p) => p.state === "merged" && (p.diffText || "").includes("commercialEnabled: true"))) {
    meta = { ...meta, commercialEnabled: true };
  }
  const isMember = await checkCommunityMembership(communityId, user);
  const recentPeople = buildCommunityRecentPeople(base.filteredTopics, meta, user, isMember, tab);
  const memberCount = meta.memberCount != null ? Number(meta.memberCount) : null;
  const tabProps = buildCommunityTabProps(communityId, meta, base, specifics, recentPeople, isMember, memberCount);

  if (existingComm && slot) {
    updateCommunityTabIndicator(existingComm, tab);
    slot.innerHTML = render.renderCommunityTabContent(tab, tabProps);
    attachCommunityListingHandlers(existingComm);
    attachPostShareHandlers();
    return;
  }
  mountFullCommunityPage(communityId, tab, user, base, specifics, meta, isMember, recentPeople, memberCount);
}

async function handleListingPixClick(btn) {
  const pix = btn.dataset.pix;
  if (!pix) return;
  const numAmount = brcode.parseNumericAmount(btn.dataset.price || "");
  if (numAmount) {
    openZapModal({
      pixKey: pix,
      authorName: btn.dataset.authorName || "Vendedor",
      title: btn.dataset.title || "Oferta",
      defaultAmount: parseFloat(numAmount),
    });
    return;
  }
  try {
    await navigator.clipboard.writeText(pix);
    share.showToast("Chave Pix copiada!");
  } catch {
    share.showToast(`Pix: ${pix}`);
  }
}

export function attachCommunityListingHandlers(main) {
  main.querySelectorAll(".btn-copy-pix").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.preventDefault(); void handleListingPixClick(btn); });
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
  main.querySelectorAll(".btn-listing-status").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.dataset.status) void handleListingStatusUpdate(btn.dataset.id, btn.dataset.status);
    });
  });
  main.querySelectorAll(".btn-listing-retract").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.preventDefault(); void handleListingRetract(btn.dataset.id); });
  });
}

export async function handleListingStatusUpdate(listingId, newStatus) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(listingId);
  if (!postOwnership.canMutateLocalPost(existing, user) || !listing.isListingItem(existing)) {
    share.showToast("Só é possível alterar ofertas suas.", "error");
    return;
  }
  const normalized = listing.normalizeListingStatus(newStatus);
  if (listing.normalizeListingStatus(existing.listingStatus) === normalized) return;

  try {
    const patch = listing.buildListingStatusUpdate(existing, normalized);
    const signed = await localAccount.signPayload(patch);
    const check = listing.validateSignedListingGossip(signed);
    if (!check.valid) throw new Error(check.error || "Oferta inválida");
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossipUpdate(signed);
    share.showToast(i18n.listingStatusUpdatedToast);
    route();
  } catch (err) {
    share.showToast(`Erro ao atualizar status: ${err.message}`, "error");
  }
}

export async function handleListingRetract(listingId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(listingId);
  if (!postOwnership.canMutateLocalPost(existing, user) || !listing.isListingItem(existing)) {
    share.showToast("Só é possível retirar ofertas suas.", "error");
    return;
  }
  const label = (existing.title || "esta oferta").slice(0, 80);
  if (!confirm(`${i18n.listingRetractConfirmPrefix} "${label}"? Esta ação não pode ser desfeita.`)) return;

  try {
    const tombstone = await postOwnership.createPostTombstone(existing);
    await cacheNode.saveTombstone(tombstone);
    peers.broadcastGossipDelete(tombstone);
    share.showToast(i18n.listingRetractedToast);
    route();
  } catch (err) {
    share.showToast(`Erro ao retirar oferta: ${err.message}`, "error");
  }
}

async function fetchRemoteTopicFallback(topicId, commIdParam) {
  let topic = null;
  let topicData = { body: "" };
  try { topic = await gql.fetchTopicById(topicId); } catch {}
  try {
    topicData = await gql.fetchTransactionData(topicId, {
      communityId: topic?.communityId || commIdParam,
    });
  } catch {}
  return { topic: topic || { title: "Tópico", owner: "", communityId: commIdParam }, topicData };
}

async function resolveTopicContent(topicId, commIdParam, user) {
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

async function resolveTopicReplies(topicId, isOfficial, _commIdParam) {
  let replies = [];
  let gateway = "";
  let demo = false;
  if (isOfficial) {
    return { replies: mock.mockReplies(topicId).items || [], gateway: "", demo: true };
  }
  try {
    const res = await gql.fetchReplies(topicId);
    replies = res.items;
    gateway = res.gateway;
  } catch {
    replies = mock.mockReplies(topicId).items || [];
    demo = true;
  }
  return { replies, gateway, demo };
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
    for (const r of mock.MOCK_REPLIES[topicId]) { merged.push({ ...r, owner: r.author, isLocalP2p: true }); }
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

    const authorLinks = document.querySelectorAll(`a.post-author[href="#/u/${encodeURIComponent(item.author)}"]`);
    authorLinks.forEach((link) => {
      if (card.name) link.textContent = card.name;
    });

    const avatarLinks = document.querySelectorAll(`a.avatar-link[href="#/u/${encodeURIComponent(item.author)}"]`);
    avatarLinks.forEach((alink) => {
      const img = alink.querySelector("img.avatar-img");
      if (card.avatarUrl && img) img.src = card.avatarUrl;
    });
  });
}

function bindTopicScreenEvents(topicId, topic, finalCommId) {
  document.getElementById("btn-share-topic")?.addEventListener("click", () => {
    shareTopicUnlessQuarantined({ title: topic.title || "Tópico no Vox", topicId, communityId: finalCommId });
  });

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

function hydrateMissingReplyBodies(filteredReplies, finalCommId) {
  filteredReplies.forEach(async (r) => {
    if (!r.isLocalP2p && (!r.body || r.body.startsWith("("))) {
      const d = await gql.fetchTransactionData(r.id, { communityId: finalCommId });
      if (d?.body) {
        const el = document.getElementById(`reply-${r.id}`);
        const p = el?.querySelector(".reply-body");
        if (p) p.textContent = d.body;
      }
    }
  });
}

export async function showTopic(topicId, commIdParam = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Tópico"));
  render.renderLoading(main);

  const { topic, topicData, isOfficial, isLocal } = await resolveTopicContent(topicId, commIdParam, user);
  const { replies: rawReplies, gateway, demo } = await resolveTopicReplies(topicId, isOfficial, commIdParam);
  const { merged: mergedReplies, hasLocal: hasLocalReplies } = await mergeTopicReplies(topicId, rawReplies);

  const finalCommId = topic.communityId || commIdParam;
  let modActions = [];
  if (finalCommId) { try { modActions = await mod.fetchModActions(finalCommId); } catch {} }
  const filteredReplies = mod.applyFilters(mergedReplies, modActions);
  const isUserMod = mod.isModerator(user, "", "");

  main.innerHTML = "";
  if (demo && !isLocal && !hasLocalReplies) render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderTopic(main, topicId, topic, filteredReplies, { topicData, isMod: isUserMod, communityId: finalCommId });
  hydrateMissingReplyBodies(filteredReplies, finalCommId);
  bindLiveProfileSync(topic.author || topic.owner, filteredReplies);
  bindTopicScreenEvents(topicId, topic, finalCommId);
}

export async function showProposal(communityId, proposalId) {
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
  attachProposalBridgeHandlers(proposal, tally);
}

export async function fetchProposalData(communityId, proposalId, user) {
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

export async function loadProposalVotes(proposalId) {
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

function attachProposalBridgeHandlers(proposal, tally) {
  const payload = buildProposalPossePayload(proposal, tally);
  document.getElementById("btn-proposal-copy-discord")?.addEventListener("click", async () => {
    const summary = buildChatSummaryCopy(payload, { format: "discord" });
    try {
      await navigator.clipboard.writeText(summary);
      share.showToast("Resumo da proposta copiado para Discord / Slack!");
    } catch {
      share.showToast(summary.slice(0, 120), "info");
    }
  });
  document.getElementById("btn-proposal-webhook-echo")?.addEventListener("click", async () => {
    const urls = loadPosseWebhooks();
    if (!urls.length) {
      share.showToast("Configure webhooks do Discord/Slack em Configurações → Rede.", "info");
      return;
    }
    const res = await firePosseWebhooks(payload, urls);
    share.showToast(
      res.sent > 0 ? `Proposta enviada para ${res.sent} webhook(s)!` : "Falha ao disparar webhook.",
      res.sent > 0 ? "info" : "error",
    );
  });
}

export function attachProposalVotingHandlers(proposal, user) {
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
