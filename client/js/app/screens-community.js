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
import { buildProposalPossePayload, firePosseWebhooks, loadPosseWebhooks } from "../posse-dispatch.js";
import { buildChatSummaryCopy } from "../chat-bridge.js";
import { getCachedBskyPostById } from "../bsky-feed.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers, shareTopicUnlessQuarantined } from "./context.js";
import { route } from "./navigation.js";
import { openZapModal } from "./zap-modal.js";

export async function showCommunity(communityId, tab = "posts") {
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
      listings = listingUi.prepareListingsForTab(listings, user);
      listings = await listingUi.filterListingsByStoredTombstones(listings, cacheNode.getTombstone);
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

  const recentPeople =
    tab === "posts" || tab === "members"
      ? peopleIndex.extractRecentAuthors(filteredTopics)
      : [];

  const peerSettings = peers.getPeerSettings();
  const gatewayState = gatewayTelemetry.getGatewayHealthState();
  const memberCount = meta.memberCount != null ? Number(meta.memberCount) : null;
  const neighborStats = computeCommunityNeighborStats({
    recentPeople,
    communityId,
    memberCount,
    gatewayState,
    isDemo: Boolean(demo || meta.demo || communityId === mock.MOCK_DEMO_COMMUNITY.id),
  });

  let seedChecklist = null;
  if (user && communitySeed.shouldOfferSeedRitual(communityId, user, meta)) {
    const seedState = communitySeed.loadSeedState(communityId);
    const topicCount = filteredTopics.length;
    if (!communitySeed.isSeedComplete(seedState, { topicCount, peerEnabled: peerSettings.enabled })) {
      seedChecklist = {
        state: seedState,
        ctx: {
          topicCount,
          peerEnabled: peerSettings.enabled,
          commOnly: peerSettings.commOnly,
        },
      };
    } else {
      communitySeed.finalizeSeedIfComplete(communityId, { topicCount, peerEnabled: peerSettings.enabled });
    }
  }

  render.renderCommunity(main, communityId, filteredTopics, meta, {
    isMember,
    isMod: isUserMod,
    walletAddress: user,
    activeTab: tab,
    listings,
    proposals,
    recentPeople,
    neighborStats,
    commOnly: peerSettings.commOnly,
    seedChecklist,
    mirrorStatus: communityMirror.getMirrorStatusForCommunity(communityId),
  });

  if (tab === "posts") {
    void communityMirror.tryMirrorCommunityToRelay(meta, filteredTopics);
  }

  attachCommunityListingHandlers(main);
  attachPostShareHandlers();

  document.querySelectorAll(".btn-community-add-contact").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.route;
      const label = btn.dataset.label || "";
      if (!id) return;
      contacts.addContact(id, label);
      share.showToast("Contato adicionado.");
      btn.disabled = true;
      btn.textContent = "✓";
    });
  });

  // Eventos na tela da comunidade
  const btnShare = document.getElementById("btn-share-comm");
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      share.shareCommunity({ title: meta.title || communityId, communityId });
      if (user && communitySeed.shouldOfferSeedRitual(communityId, user, meta)) {
        communitySeed.recordSeedInvite(communityId);
      }
    });
  }

  const btnExportGenesis = document.getElementById("btn-export-comm-genesis");
  if (btnExportGenesis) {
    btnExportGenesis.addEventListener("click", () => {
      const genesisData = {
        type: "vox-community-genesis",
        version: 1,
        communityId,
        meta,
        exportedAt: Date.now(),
        topicsCount: filteredTopics.length,
        topics: filteredTopics.map((t) => ({
          id: t.id,
          title: t.title,
          body: t.body,
          author: t.author || t.owner,
          ts: t.ts,
          image: t.image,
          audio: t.audio,
          video: t.video,
        })),
      };
      const blob = new Blob([JSON.stringify(genesisData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comunidade-${communityId}-genesis.json`;
      a.click();
      URL.revokeObjectURL(url);
      share.showToast("Gênesis da comunidade exportado com sucesso!");
    });
  }

  document.getElementById("btn-neighbor-comm-only")?.addEventListener("click", () => {
    const next = { ...peerSettings, commOnly: true, enabled: true };
    peers.savePeerSettings(next);
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

  document.querySelector(".community-vox-seed a[href='#/settings/network']")?.addEventListener("click", () => {
    communitySeed.saveSeedState(communityId, { activeAck: true });
  });

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
        btnJoin.classList.add("is-member");
        btnJoin.setAttribute("aria-pressed", "true");
      } catch (err) {
        share.showToast(`Erro ao entrar: ${err.message}`, "error");
        btnJoin.disabled = false;
        btnJoin.textContent = "Entrar";
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

export function attachCommunityListingHandlers(main) {
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

  main.querySelectorAll(".btn-listing-status").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const status = btn.dataset.status;
      if (status) void handleListingStatusUpdate(btn.dataset.id, status);
    });
  });

  main.querySelectorAll(".btn-listing-retract").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      void handleListingRetract(btn.dataset.id);
    });
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

export async function showTopic(topicId, commIdParam = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Tópico"));
  render.renderLoading(main);

  let topic = { title: "Tópico", owner: "", communityId: commIdParam };
  let replies = [];
  let topicData = { body: "" };

  const isOfficialWelcome =
    topicId === welcomeProfile.OFFICIAL_WELCOME_TOPIC_ID ||
    topicId === "vox-official-manifesto-welcome";

  if (isOfficialWelcome) {
    const welcomeTopic = welcomeProfile.getOfficialWelcomeTopic();
    topic = { ...welcomeTopic, isOfficial: true, isLocalP2p: true };
    topicData = { body: welcomeTopic.body };
  } else {
    const localTopic = (await cacheNode.getLocalPost(topicId)) || getCachedBskyPostById(topicId);
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
          topicData = await gql.fetchTransactionData(topicId, {
            communityId: topic?.communityId || commIdParam,
          });
        } catch {}
      }
    }
  }

  let gateway = "";
  let demo = false;
  if (isOfficialWelcome) {
    const fb = mock.mockReplies(topicId);
    replies = fb.items;
    demo = true;
  } else {
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
      const d = await gql.fetchTransactionData(r.id, { communityId: finalCommId });
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
      shareTopicUnlessQuarantined({
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
