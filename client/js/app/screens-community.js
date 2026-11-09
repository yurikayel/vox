import * as welcomeProfile from "../vox-welcome-profile.js";
import { confirmGovernanceVote } from "./vote-confirm.js";
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
import { computeCommunityNeighborStats, TOPICS_PAGE_SIZE } from "../render/community.js";
import { orderCommunityTopics } from "../community-topic-order.js";
import * as newKeyGuard from "../new-key-guard.js";
import * as communityUpdates from "../community-updates.js";
import { markCommunitySeen } from "../community-unread.js";
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

function mergeTopicsWithLocalReplies(localTopics, topics, user, replyCounts, replyActivity = {}) {
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
    const act = replyActivity[t.id];
    const extra = (act?.count != null) ? act.count : (replyCounts[t.id] || 0);
    if (extra > 0 || !t.repliesCount) {
      t.repliesCount = (Number(t.repliesCount) || 0) + extra;
    }
    if (act?.lastTs) {
      t.lastReplyTs = Math.max(Number(t.lastReplyTs) || 0, act.lastTs);
    }
  }
  return merged;
}

async function loadCommunityMetaAndTopics(communityId, user) {
  const { topics, demo, gateway } = await fetchRawCommunityTopics(communityId);
  const meta = await resolveCommunityMetadata(communityId);
  const localTopics = await cacheNode.getLocalPosts({ type: "topic", communityId });
  const replyCounts = await cacheNode.getReplyCountsMap().catch(() => ({}));
  const replyActivity = await cacheNode.getReplyActivityMap().catch(() => ({}));
  const merged = mergeTopicsWithLocalReplies(localTopics, topics, user, replyCounts, replyActivity);
  if (communityId === "vox" || meta.isOfficial) {
    const welcome = welcomeProfile.getOfficialWelcomeTopic();
    if (!merged.some((t) => t.id === welcome.id)) {
      merged.unshift(welcome);
    }
  }

  let modActions = [];
  try { modActions = await mod.fetchModActions(communityId); } catch {}
  const filtered = mod.applyFilters(merged, modActions, meta.owner, meta.moderators);
  const isUserMod = mod.isModerator(user, meta.owner, meta.moderators);
  const { visible, heldCount } = await applyNewKeyQuarantine(filtered, meta, communityId, user, isUserMod);
  const filteredTopics = orderCommunityTopics(visible, "active");

  return { meta, filteredTopics, localTopics, demo, gateway, isUserMod, heldCount };
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

function renderNewKeyHeldNotice(main, communityId, count, tab) {
  if (!count || tab !== "posts") return;
  main.insertAdjacentHTML("beforeend", render.renderNewKeyHeldNoticeHtml(count));
  main.querySelector(".btn-reveal-new-keys")?.addEventListener("click", () => {
    newKeyGuard.revealHeld(communityId);
    main.querySelector(".community-newkey-notice")?.remove();
    main.querySelector(".community-vox-page")?.remove();
    void showCommunity(communityId, tab);
  });
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

export async function checkCommunityMembership(communityId, user, meta = null) {
  if (!user) return false;
  if (meta?.owner && meta.owner.toLowerCase() === user.toLowerCase()) {
    return true;
  }
  try {
    const localLeaves = await cacheNode.getLocalPosts({ type: "membership_leave", communityId }).catch(() => []);
    const userLeaves = localLeaves.filter((m) => (m.author || m.owner) === user);
    const lastLeaveTs = userLeaves.length ? Math.max(...userLeaves.map((m) => Number(m.leftAt || m.ts || 0))) : 0;

    const localMems = await cacheNode.getLocalPosts({ type: "membership", communityId }).catch(() => []);
    const userMems = localMems.filter((m) => (m.author || m.owner) === user);
    const lastJoinTs = userMems.length ? Math.max(...userMems.map((m) => Number(m.joinedAt || m.ts || 0))) : 0;

    if (lastLeaveTs > 0 && lastLeaveTs >= lastJoinTs) {
      return false;
    }
    if (lastJoinTs > 0 && lastJoinTs > lastLeaveTs) {
      return true;
    }
    // Comunidade 'vox': todo mundo é membro no ato do login por padrão (a menos que tenha saído)!
    if (communityId === "vox") {
      return lastLeaveTs === 0;
    }
    const mems = await gql.fetchUserMemberships(user);
    return mems.some((m) => m.communityId === communityId);
  } catch {
    if (communityId === "vox") return true;
    return false;
  }
}

async function appendVoxDirectoryMembers(recentPeople, peopleSet) {
  try {
    const leaves = await cacheNode.getLocalPosts({ type: "membership_leave", communityId: "vox" }).catch(() => []);
    const leftSet = new Set(leaves.map((l) => l.author || l.owner));
    const discoverable = profileDirectory.listDiscoverableProfileCards();
    for (const card of discoverable) {
      if (card?.routeId && !leftSet.has(card.routeId) && !peopleSet.has(card.routeId)) {
        recentPeople.push({
          routeId: card.routeId,
          name: card.name || card.displayName || card.handle || card.routeId,
        });
        peopleSet.add(card.routeId);
      }
    }
  } catch {}
}

export async function buildCommunityRecentPeople(filteredTopics, meta, user, isMember, tab, communityId = "") {
  const isRelevantTab = tab === "posts" || tab === "members";
  const recentPeople = isRelevantTab ? peopleIndex.extractRecentAuthors(filteredTopics, 32) : [];
  const peopleSet = new Set(recentPeople.map((p) => p.routeId));

  if (communityId === "vox") {
    await appendVoxDirectoryMembers(recentPeople, peopleSet);
  }
  if (meta?.owner && !peopleSet.has(meta.owner)) {
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
  if (!communityUpdates.canUpdateCommunity(meta, await localAccount.getRouteId())) {
    share.showToast("Só o dono ou um moderador desta comunidade pode trocar a foto.", "error");
    return;
  }
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  const updatePayload = {
    id: `comm_update_${communityId}_${Date.now()}`,
    type: communityUpdates.COMMUNITY_UPDATE_TYPE,
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

export async function dispatchCommunityModAction(communityId, action, targetId) {
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
  if (wallet.hasWallet()) {
    try {
      const tags = upload.buildTags("mod-action", {
        "Community-Id": communityId,
        Action: action,
        Target: targetId,
      });
      await upload.postData({ action, target: targetId, communityId }, tags);
    } catch {}
  }
  return modActionPost;
}

function bindCommunityModHideButtons(communityId) {
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId}?`)) return;
      e.target.disabled = true;
      try {
        await dispatchCommunityModAction(communityId, "hide", targetId);
        share.showToast("Ação de moderação enviada.");
        e.target.closest(".card")?.remove();
      } catch (err) {
        share.showToast(`Erro na moderação: ${err.message}`, "error");
        e.target.disabled = false;
      }
    });
  });
}

function normalizeSearchText(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function filterTopicRows(rows, q, main) {
  let visibleCount = 0;
  const normQ = normalizeSearchText(q);
  rows.forEach((row) => {
    const text = normalizeSearchText(row.textContent);
    const matches = !normQ || text.includes(normQ);
    row.style.display = matches ? "" : "none";
    if (matches) visibleCount++;
  });
  const listEl = main.querySelector(".community-vox-topic-list");
  let emptySearchEl = main.querySelector(".community-topic-search-empty");
  if (visibleCount === 0 && q) {
    if (!emptySearchEl && listEl) {
      emptySearchEl = document.createElement("div");
      emptySearchEl.className = "empty community-topic-search-empty";
      emptySearchEl.innerHTML = `<p>Nenhum tópico encontrado para "${escapeHtml(q)}".</p>`;
      listEl.appendChild(emptySearchEl);
    }
  } else if (emptySearchEl) {
    emptySearchEl.remove();
  }
}

function bindCommunityTopicSearch(main) {
  const searchInput = main.querySelector("#input-comm-topic-search");
  if (!searchInput) return null;
  searchInput.addEventListener("input", (e) => {
    filterTopicRows(main.querySelectorAll(".community-topic-row"), e.target.value, main);
  });
  return searchInput;
}

function renderPagedTopicRows(listEl, topics, communityId) {
  listEl.innerHTML = topics
    .map((t) => render.renderCommunityTopicRow({ ...t, communityId }))
    .join("");
}

function updatePaginationControl(main, totalCount, currentLimit, onMore) {
  let paginationEl = main.querySelector(".community-topic-pagination");
  if (totalCount <= currentLimit) {
    if (paginationEl) paginationEl.remove();
    return;
  }
  const remaining = totalCount - currentLimit;
  const label = `Carregar tópicos anteriores (${remaining} ${remaining === 1 ? "restante" : "restantes"})`;
  if (!paginationEl) {
    paginationEl = document.createElement("div");
    paginationEl.className = "community-topic-pagination";
    paginationEl.style.cssText = "text-align:center; padding:12px 0 6px;";
    const feedEl = main.querySelector(".community-vox-feed");
    if (feedEl) feedEl.appendChild(paginationEl);
  }
  paginationEl.innerHTML = `<button type="button" class="btn btn-outline btn-sm btn-load-more-topics">${label}</button>`;
  paginationEl.querySelector(".btn-load-more-topics")?.addEventListener("click", onMore);
}

function refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput) {
  const listEl = main.querySelector(".community-vox-topic-list");
  if (!listEl) return;
  const ordered = orderCommunityTopics(filteredTopics, state.sort);
  if (state.sort === "pinned" && ordered.length === 0) {
    listEl.innerHTML = `<div class="empty community-vox-empty"><p>Nenhuma pauta ou tópico fixado no momento.</p></div>`;
    updatePaginationControl(main, 0, state.limit, null);
    return;
  }
  const slice = ordered.slice(0, state.limit);
  renderPagedTopicRows(listEl, slice, communityId);
  updatePaginationControl(main, ordered.length, state.limit, () => {
    state.limit += TOPICS_PAGE_SIZE;
    refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput);
  });
  if (searchInput && searchInput.value.trim()) {
    filterTopicRows(main.querySelectorAll(".community-topic-row"), searchInput.value, main);
  }
}

function bindCommunityTopicSort(main, onSortChange) {
  main.querySelectorAll(".btn-sort-topic").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.sort;
      if (!mode) return;
      main.querySelectorAll(".btn-sort-topic").forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      onSortChange(mode);
    });
  });
}

function bindCommunityTopicControls(main, communityId, filteredTopics) {
  const state = { sort: "active", limit: TOPICS_PAGE_SIZE };
  const searchInput = bindCommunityTopicSearch(main);
  bindCommunityTopicSort(main, (newSort) => {
    state.sort = newSort;
    state.limit = TOPICS_PAGE_SIZE;
    refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput);
  });
  const paginationBtn = main.querySelector(".btn-load-more-topics");
  if (paginationBtn) {
    paginationBtn.addEventListener("click", () => {
      state.limit += TOPICS_PAGE_SIZE;
      refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput);
    });
  }
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
  bindCommunityTopicControls(main, communityId, filteredTopics);
}

function renderCommunityBanners(main, base, tab) {
  if (base.demo && !base.localTopics.length && tab !== "listings" && tab !== "governance") {
    render.renderDemoBanner(main);
  } else if (base.gateway) {
    render.renderGatewayBanner(main, base.gateway);
  }
}

async function mountFullCommunityPage(communityId, tab, user, base, specifics, meta, isMember, recentPeople, memberCount) {
  const routeId = await localAccount.getRouteId();
  const main = render.renderShell(makeShellProps(user, "communities", "Comunidade"));
  render.renderLoading(main);
  main.innerHTML = "";
  renderCommunityBanners(main, base, tab);
  renderNewKeyHeldNotice(main, communityId, base.heldCount, tab);

  const peerSettings = peers.getPeerSettings();
  const neighborStats = computeCommunityNeighborStats({
    recentPeople, communityId, memberCount, gatewayState: gatewayTelemetry.getGatewayHealthState(),
    isDemo: Boolean(base.demo || meta.demo || communityId === mock.MOCK_DEMO_COMMUNITY.id),
  });
  const seedChecklist = resolveCommunitySeedChecklist(communityId, user, meta, base.filteredTopics.length, peerSettings);

  render.renderCommunity(main, communityId, base.filteredTopics, meta, {
    isMember, isMod: base.isUserMod, walletAddress: user, routeId, activeTab: tab, listings: specifics.listings,
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
  markCommunitySeen(communityId);
  const user = await getActiveUser();
  const existingComm = document.querySelector(`.community-vox-page[data-community-id="${communityId}"]`);
  const slot = existingComm?.querySelector("#community-tab-content");

  const base = await loadCommunityMetaAndTopics(communityId, user);
  let meta = base.meta;
  const specifics = await loadCommunityTabSpecifics(communityId, tab, user, base.demo);
  if (specifics.proposals.some((p) => p.state === "merged" && (p.diffText || "").includes("commercialEnabled: true"))) {
    meta = { ...meta, commercialEnabled: true };
  }
  const isMember = await checkCommunityMembership(communityId, user, meta);
  const recentPeople = await buildCommunityRecentPeople(base.filteredTopics, meta, user, isMember, tab, communityId);
  const memberCount = meta.memberCount != null ? Number(meta.memberCount) : (communityId === "vox" ? Math.max(1, recentPeople.length) : null);
  const tabProps = buildCommunityTabProps(communityId, meta, base, specifics, recentPeople, isMember, memberCount);

  if (existingComm && slot) {
    updateCommunityTabIndicator(existingComm, tab);
    slot.innerHTML = render.renderCommunityTabContent(tab, tabProps);
    attachCommunityListingHandlers(existingComm);
    attachPostShareHandlers();
    return;
  }
  await mountFullCommunityPage(communityId, tab, user, base, specifics, meta, isMember, recentPeople, memberCount);
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

const MOD_ACTION_LABELS = {
  pin: "Tópico fixado no topo!",
  unpin: "Tópico desafixado.",
  lock: "Tópico trancado para novas respostas.",
  unlock: "Tópico reaberto.",
};

function bindTopicModToggleActions(finalCommId, topicId) {
  document.querySelectorAll(".btn-mod-action").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.id;
      const action = btn.dataset.action;
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
        const el = document.getElementById(`reply-${r.id}`);
        const p = el?.querySelector(".reply-body");
        if (p) p.textContent = d.body;
      }
    }
  });
}

/** Moderação do tópico com dono/moderadores reais da comunidade (fail-closed sem metadados). */
async function resolveTopicModeration(communityId, user, replies, topic = null) {
  if (!communityId) return { filteredReplies: replies, filteredTopic: topic, isUserMod: false };
  const meta = await resolveCommunityMetadata(communityId).catch(() => ({ owner: "" }));
  let modActions = [];
  try { modActions = await mod.fetchModActions(communityId); } catch {}
  const filteredReplies = mod.applyFilters(replies, modActions, meta.owner, meta.moderators);
  const filteredTopic = topic ? mod.applyFilters([topic], modActions, meta.owner, meta.moderators)[0] || topic : topic;
  return {
    filteredReplies,
    filteredTopic,
    isUserMod: mod.isModerator(user, meta.owner, meta.moderators),
  };
}

export async function showTopic(topicId, commIdParam = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Tópico"));
  render.renderLoading(main);

  const { topic, topicData, isOfficial, isLocal } = await resolveTopicContent(topicId, commIdParam, user);
  const { replies: rawReplies, gateway, demo } = await resolveTopicReplies(topicId, isOfficial, commIdParam);
  const { merged: mergedReplies, hasLocal: hasLocalReplies } = await mergeTopicReplies(topicId, rawReplies);

  const finalCommId = topic.communityId || commIdParam;
  const { filteredReplies, filteredTopic, isUserMod } = await resolveTopicModeration(finalCommId, user, mergedReplies, topic);
  const currentTopic = filteredTopic || topic;

  main.innerHTML = "";
  if (demo && !isLocal && !hasLocalReplies) render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderTopic(main, topicId, currentTopic, filteredReplies, { topicData, isMod: isUserMod, communityId: finalCommId });
  hydrateMissingReplyBodies(filteredReplies, finalCommId);
  bindLiveProfileSync(currentTopic.author || currentTopic.owner, filteredReplies);
  bindTopicScreenEvents(topicId, currentTopic, finalCommId);
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

/**
 * Assina e propaga um voto de governança (mesmo formato usado pelo detalhe da pauta).
 * @returns {Promise<object>} voto assinado
 */
export async function castGovernanceVote(proposal, user, choice) {
  const normalized = gov.normalizeVoteChoice(choice);
  if (!normalized) throw new Error("Escolha de voto inválida");
  const signedVote = await localAccount.signPayload({
    id: `vote_${proposal.id}_${user}_${Date.now()}`,
    type: "governance-vote",
    proposalId: proposal.id,
    choice: normalized,
    communityId: proposal.communityId,
    author: user,
    owner: user,
    ts: Date.now(),
  });
  await cacheNode.saveLocalPost(signedVote);
  peers.broadcastGossip(signedVote);
  return signedVote;
}

export function attachProposalVotingHandlers(proposal, user) {
  const buttons = document.querySelectorAll(".vote-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const choice = btn.dataset.choice;
      if (!choice || !user) return;
      if (!(await confirmGovernanceVote(proposal, choice))) return;
      buttons.forEach((b) => (b.disabled = true));
      btn.textContent = "Assinando…";
      try {
        await castGovernanceVote(proposal, user, choice);
        share.showToast(`Voto "${choice}" registrado!`);
        showProposal(proposal.communityId, proposal.id);
      } catch (err) {
        share.showToast(`Erro ao votar: ${err.message}`, "error");
        buttons.forEach((b) => (b.disabled = false));
      }
    });
  });
}

async function buildVoteCommunityTitles() {
  const titles = new Map([["vox", mock.MOCK_OFFICIAL_COMMUNITY_VOX.title]]);
  const local = await cacheNode.getLocalCommunities().catch(() => []);
  for (const c of local) if (c?.id) titles.set(c.id, c.title || c.id);
  return titles;
}

/** Carrega todas as pautas de governança conhecidas por este aparelho, com apuração real. */
export async function loadVoteItems(user) {
  const proposals = await cacheNode.getLocalPosts({ type: "governance-proposal" }).catch(() => []);
  const titles = await buildVoteCommunityTitles();
  const items = [];
  for (const p of proposals) {
    const data = await fetchProposalData(p.communityId, p.id, user).catch(() => null);
    if (data) items.push(normalizeVoteItem(data, titles));
  }
  const order = { open: 0, merged: 1, rejected: 2, expired: 2 };
  items.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || (a.closesAt || 0) - (b.closesAt || 0));
  return items;
}

function normalizeVoteItem({ proposal, tally, userVote, isEligible, isMember }, titles) {
  return {
    id: proposal.id,
    communityId: proposal.communityId,
    communityTitle: titles.get(proposal.communityId) || proposal.communityId,
    title: proposal.title,
    body: proposal.body,
    author: proposal.author || proposal.owner || "",
    authorLabel: profileDirectory.getAuthorDisplaySync(proposal.author || proposal.owner || "") || "",
    createdAt: Number(proposal.createdAt || proposal.ts) || 0,
    closesAt: Number(proposal.closesAt) || 0,
    minQuorum: Number(proposal.minQuorum) || 1,
    state: tally.state,
    tally,
    userVote,
    isEligible,
    isMember,
    proposal,
  };
}

function bindVoteChoiceButtons(main, items, user, rerender) {
  main.querySelectorAll(".agora-vote-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = items.find((i) => i.id === btn.dataset.proposalId);
      if (!item || !user) {
        share.showToast("Crie sua identidade neste aparelho para votar.", "warning");
        return;
      }
      if (!(await confirmGovernanceVote(item.proposal, btn.dataset.voteChoice))) return;
      main.querySelectorAll(".agora-vote-btn").forEach((b) => (b.disabled = true));
      btn.textContent = "Assinando…";
      try {
        await castGovernanceVote(item.proposal, user, btn.dataset.voteChoice);
        share.showToast("Voto assinado e registrado neste aparelho.");
        rerender(true);
      } catch (err) {
        share.showToast(`Erro ao votar: ${err.message}`, "error");
        rerender(false);
      }
    });
  });
}

export async function showVote({ filter = "all" } = {}) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "vote", "Democracia Direta"));
  render.renderLoading(main);
  const items = await loadVoteItems(user);
  let activeFilter = filter;

  const paint = () => {
    main.innerHTML = render.renderVoteDashboard(items, { filter: activeFilter });
    main.querySelectorAll("[data-vote-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.voteFilter || "all";
        paint();
      });
    });
    bindVoteChoiceButtons(main, items, user, (reload) => (reload ? showVote({ filter: activeFilter }) : paint()));
  };
  paint();
}
