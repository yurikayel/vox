/** @file Hash router — dispatches to screen modules. */
import { closePostMoreMenu } from "./post-more-menu.js";
import { parseRoute, routeTitle } from "./route-parse.js";
import { setRoute } from "./navigation.js";
import { checkCantinaGate } from "./onboarding.js";
import { showHome, showCommunities, showTagFeed } from "./screens-home.js";
import { showCommunity, showTopic, showProposal, showVote } from "./screens-community.js";
import { showProfile, showHandleLookup, showWallet, showPixLookup } from "./screens-profile.js";
import { showPeople, showConnect } from "./screens-people.js";
import { showNetworkSettings, showStewardWizard, showLinkedAccounts } from "./screens-network.js";
import { showDmList, showDmThread } from "./screens-dm.js";
import { showStatus } from "./screens-status.js";
import { showNetworkWizard, showBackupWizard, showWalletWizard } from "./screens-guided.js";
import { showSyncScreen } from "./screens-sync.js";
import { showRecoveryPhrase } from "./screens-phrase.js";
import { showGuardians } from "./screens-guardians.js";
import { showGuardianRecover, showGuardianReturn } from "./screens-guardian-return.js";
import { showNotFound } from "./screens-not-found.js";

/** @type {Promise<typeof import("./screens-voxpedia.js")>|null} */
let voxpediaRoute = null;
/** @type {Promise<typeof import("./screens-ajuda-teste.js")>|null} */
let ajudaTesteRoute = null;
/** @type {Promise<typeof import("./screens-labs.js")>|null} */
let labsRoute = null;

function loadVoxpediaRoute() {
  voxpediaRoute ??= import("./screens-voxpedia.js");
  return voxpediaRoute;
}

function loadAjudaTesteRoute() {
  ajudaTesteRoute ??= import("./screens-ajuda-teste.js");
  return ajudaTesteRoute;
}

function loadLabsRoute() {
  labsRoute ??= import("./screens-labs.js");
  return labsRoute;
}
import { showAvisos, showComposeAviso } from "./aviso-flow.js";
import {
  showComposeCommunity,
  showComposeTopic,
  showComposeListing,
  showComposeProposal,
  showComposeReply,
} from "./screens-compose.js";

const ROUTE_DISPATCH_TABLE = {
  home: (r) => showHome(r.feed),
  vote: () => showVote(),
  "tag-feed": (r) => showTagFeed(r.slug),
  communities: () => showCommunities(),
  people: (r) => showPeople(r.query),
  connect: (r) => showConnect(r.routeId, r.invite),
  perfil: (r) => showProfile(null, r.tab),
  "pix-lookup": (r) => showPixLookup(r.query),
  "network-settings": () => showNetworkSettings(),
  "linked-accounts": () => showLinkedAccounts(),
  "steward-wizard": () => showStewardWizard(),
  "handle-lookup": (r) => showHandleLookup(r.slug),
  "dm-list": () => showDmList(),
  "dm-thread": (r) => showDmThread(r.address),
  voxpedia: async () => { (await loadVoxpediaRoute()).showVoxpedia(); },
  download: () => { window.location.href = "download.html"; },
  revolucao: () => { window.location.href = "revolucao.html"; },
  "ajuda-teste": async () => { (await loadAjudaTesteRoute()).showAjudaTeste(); },
  status: () => showStatus(),
  "labs-frames": async () => { (await loadLabsRoute()).showLabsFrames(); },
  "labs-mofn": async () => { (await loadLabsRoute()).showLabsMofn(); },
  "labs-dungeon": async () => { (await loadLabsRoute()).showLabsDungeon(); },
  dungeon: async (r) => { (await loadLabsRoute()).showDungeonScreen(r); },
  community: (r) => showCommunity(r.id, r.tab),
  "community-avisos": (r) => showAvisos(r.communityId),
  "compose-aviso": (r) => showComposeAviso(r.communityId),
  proposal: (r) => showProposal(r.communityId, r.proposalId),
  topic: (r) => showTopic(r.id, r.communityId),
  profile: (r) => showProfile(r.address, r.tab),
  wallet: () => showWallet(),
  "wallet-wizard": () => showWalletWizard(),
  "network-wizard": () => showNetworkWizard(),
  "backup-wizard": () => showBackupWizard(),
  "recovery-phrase": () => showRecoveryPhrase(),
  guardians: () => showGuardians(),
  "guardian-return": (r) => showGuardianReturn(r.query),
  "guardian-recover": () => showGuardianRecover(),
  "compose-community": () => showComposeCommunity(),
  "compose-listing": (r) => showComposeListing(r.communityId),
  "compose-proposal": (r) => showComposeProposal(r.communityId),
  "compose-topic": (r) => showComposeTopic(r.communityId),
  "compose-reply": (r) => showComposeReply(r.topicId, r.communityId, r.parentId),
  sync: (r) => showSyncScreen(r),
  "not-found": () => showNotFound(),
};

/**
 * Atualiza `document.title` e move o foco para o h1 da tela (tabindex -1, sem entrar na ordem de Tab).
 * Sem h1 na tela, o foco não se mexe.
 *
 * @param {{name?: string}} route Descritor da rota aplicada.
 * @param {Document} [doc] Documento (injetável nos testes).
 * @returns {boolean} `true` se um h1 recebeu o foco.
 */
export function announceRoute(route, doc = globalThis.document) {
  if (!doc) return false;
  doc.title = routeTitle(route);
  const h1 = doc.querySelector("#app-root h1") || doc.querySelector("h1");
  if (!h1) return false;
  if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
  h1.focus({ preventScroll: true });
  return true;
}

/**
 * Aplica a rota atual: fecha menus, checa portão e despacha para a tela.
 *
 * @returns {Promise<void>}
 */
export async function routeImpl() {
  closePostMoreMenu();
  checkCantinaGate();
  const r = parseRoute();
  const handler = ROUTE_DISPATCH_TABLE[r.name] || (() => showHome());
  const result = await handler(r);
  announceRoute(r);
  return result;
}

/**
 * Registra {@link routeImpl} no desvio de {@link navigation.route}.
 *
 * @returns {void}
 */
export function wireRoute() {
  setRoute(routeImpl);
}

/**
 * Re-rota quando o hash da URL muda.
 *
 * @returns {void}
 */
export function setupHashchangeListener() {
  window.addEventListener("hashchange", () => routeImpl());
}
