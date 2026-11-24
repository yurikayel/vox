/**
 * @file Telas de comunidade: página da comunidade (posts, avisos e termo de convivência). A entrada
 * na comunidade assina o termo vigente (`joinTermoFields`). Demais fluxos ficam em módulos focados.
 *
 * @module app/screens-community
 * @see client/js/app/community-termo-flow.js
 * @see client/js/app/aviso-flow.js
 */
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as i18n from "../i18n-pt-br.js";
import * as featureFlags from "../feature-flags.js";
import * as communityMirror from "../community-mirror.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import { computeCommunityNeighborStats } from "../render/community.js";
import * as newKeyGuard from "../new-key-guard.js";
import { markCommunitySeen } from "../community-unread.js";
import { parseRoute } from "./route-parse.js";
import { runButtonAction } from "./action-runner.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";
import { getRouteScope, route } from "./navigation.js";
import { resolveCommunityMetadata, checkCommunityMembership, dispatchCommunityModAction } from "./community-metadata.js";
import { loadCommunityMetaAndTopics, loadCommunityTabSpecifics, buildCommunityRecentPeople, resolveCommunitySeedChecklist } from "./community-data.js";
import { bindCommunityHeaderEvents } from "./community-controls.js";
import { attachCommunityListingHandlers, handleListingStatusUpdate, handleListingRetract } from "./community-listing-handlers.js";
import { resolveTopicContent } from "./community-topic-screen.js";

export {
  resolveCommunityMetadata,
  checkCommunityMembership,
  dispatchCommunityModAction,
  buildCommunityRecentPeople,
  attachCommunityListingHandlers,
  handleListingStatusUpdate,
  handleListingRetract,
  resolveTopicContent,
};

/**
 * Marca a aba ativa na navegação da comunidade.
 *
 * @param {HTMLElement} commEl Raiz da comunidade.
 * @param {string} tab Aba ativa.
 */
function updateCommunityTabIndicator(commEl, tab) {
  const nav = commEl.querySelector(".community-vox-nav");
  if (!nav) return;
  const target = (tab === "listings" || tab === "governance" || tab === "members") ? tab : "posts";
  nav.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === target);
  });
}

/**
 * Mostra o aviso de chaves novas retidas e liga o botão de revelar.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {string} communityId Comunidade.
 * @param {number} count Quantidade retida.
 * @param {string} tab Aba ativa.
 */
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

/**
 * Grava a entrada da pessoa na comunidade.
 *
 * @param {string} communityId Comunidade.
 * @param {string} user Rota de quem entra.
 * @param {HTMLElement} btn Botão de entrar.
 */
async function submitCommunityJoin(communityId, user, btn) {
  btn.disabled = true;
  btn.textContent = "Gravando…";
  try {
    const termoFields = await import("./community-termo-flow.js").then((m) => m.joinTermoFields(communityId)).catch(() => ({}));
    const signed = await localAccount.signPayload({ id: `mem_${communityId}_${user}`, type: "membership", communityId, joinedAt: Date.now(), ...termoFields });
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
    if (featureFlags.isFeatureEnabled("arweaveUpload") && wallet.hasWallet()) {
      try { await upload.postData(new Uint8Array(), upload.buildTags("membership", { "Community-Id": communityId })); } catch {}
    }
    share.showToast(i18n.joinedToast);
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  } catch (err) {
    share.showToast(`Erro ao participar: ${err.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Participar da Comunidade";
  }
}

/**
 * Grava a saída da pessoa da comunidade.
 *
 * @param {string} communityId Comunidade.
 * @param {string} user Rota de quem sai.
 * @param {HTMLElement} btn Botão de sair.
 */
async function submitCommunityLeave(communityId, user, btn) {
  await runButtonAction(btn, async () => {
    const signed = await localAccount.signPayload({ id: `mem_leave_${communityId}_${user}`, type: "membership_leave", communityId, leftAt: Date.now() });
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
    if (featureFlags.isFeatureEnabled("arweaveUpload") && wallet.hasWallet()) {
      try { await upload.postData(new Uint8Array(), upload.buildTags("membership_leave", { "Community-Id": communityId })); } catch {}
    }
    share.showToast(i18n.leftToast);
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  }, {
    busyText: "Gravando…",
    onError: (err) => share.showToast(`Erro ao sair: ${err.message}`, "error"),
  });
}

/**
 * Liga os botões de entrar e sair da comunidade.
 *
 * @param {string} communityId Comunidade.
 * @param {string} user Rota de quem vê.
 * @param {boolean} isMember Já é membro.
 */
function bindCommunityMembershipToggle(communityId, user, isMember) {
  const btnJoin = document.getElementById("btn-join-comm");
  if (btnJoin && !isMember) btnJoin.addEventListener("click", () => void submitCommunityJoin(communityId, user, btnJoin));
  const btnLeave = document.getElementById("btn-leave-comm");
  if (btnLeave && isMember) btnLeave.addEventListener("click", () => void submitCommunityLeave(communityId, user, btnLeave));
}

/**
 * Mostra os avisos de demonstração ou de gateway da comunidade.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {object} base Dados base da comunidade.
 * @param {string} tab Aba ativa.
 */
function renderCommunityBanners(main, base, tab) {
  if (base.demo && !base.localTopics.length && tab !== "listings" && tab !== "governance") {
    render.renderDemoBanner(main);
  } else if (base.gateway) {
    render.renderGatewayBanner(main, base.gateway);
  }
}

/**
 * Monta a página completa da comunidade.
 *
 * @param {{communityId: string, tab: string, user: string, base: object, specifics: object, meta: object, isMember: boolean, recentPeople: object[], memberCount: number, routeScope?: {signal: AbortSignal}|null}} options Dados já carregados da comunidade.
 */
async function mountFullCommunityPage({ communityId, tab, user, base, specifics, meta, isMember, recentPeople, memberCount, routeScope }) {
  const routeId = await localAccount.getRouteId();
  if (routeScope?.signal?.aborted) return; // trocou de rota durante a leitura do routeId
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
  bindCommunityHeaderEvents({ main, communityId, meta, user, peerSettings, filteredTopics: base.filteredTopics });
  bindCommunityMembershipToggle(communityId, user, isMember);
  if (tab === "posts") void import("./aviso-flow.js").then((m) => m.mountCommunityAvisoBanner(main, communityId)).catch(() => {});
  if (tab === "posts") void import("./community-termo-flow.js").then((m) => m.mountCommunityTermo(main, { communityId, meta, isMember, isMod: base.isUserMod })).catch(() => {});
}

/**
 * Monta as propriedades das abas da comunidade.
 *
 * @param {{communityId: string, meta: object, base: object, specifics: object, recentPeople: object[], isMember: boolean, memberCount: number}} options Dados já carregados da comunidade.
 * @returns {object}
 */
function buildCommunityTabProps({ communityId, meta, base, specifics, recentPeople, isMember, memberCount }) {
  return {
    communityId, commTitle: meta.title || communityId, meta, topics: base.filteredTopics,
    listings: specifics.listings, proposals: specifics.proposals, recentPeople, isMember, memberCount, isMod: base.isUserMod,
  };
}

/**
 * Monta página da comunidade e suas abas (`posts`, `listings`, `governance`, `members`).
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} [tab="posts"] Aba ativa.
 * @returns {Promise<void>}
 */
export async function showCommunity(communityId, tab = "posts") {
  const routeScope = getRouteScope(); // antes do 1º await: depois dele já pode ser a rota seguinte
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
  const recentPeople = await buildCommunityRecentPeople({ filteredTopics: base.filteredTopics, meta, user, isMember, tab, communityId });
  const memberCount = meta.memberCount != null ? Number(meta.memberCount) : (communityId === "vox" ? Math.max(1, recentPeople.length) : null);
  const tabProps = buildCommunityTabProps({ communityId, meta, base, specifics, recentPeople, isMember, memberCount });
  if (routeScope?.signal?.aborted) return; // a pessoa já foi para outra rota: não desenhar por cima dela

  if (existingComm && slot) {
    updateCommunityTabIndicator(existingComm, tab);
    slot.innerHTML = render.renderCommunityTabContent(tab, tabProps);
    attachCommunityListingHandlers(existingComm);
    attachPostShareHandlers();
    return;
  }
  await mountFullCommunityPage({ communityId, tab, user, base, specifics, meta, isMember, recentPeople, memberCount, routeScope });
}
