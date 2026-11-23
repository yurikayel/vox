/** @file Hash router — dispatches to screen modules. */
import { closePostMoreMenu } from "./post-more-menu.js";
import { parseRoute, routeTitle } from "./route-parse.js";
import { setRoute } from "./navigation.js";
import { checkCantinaGate } from "./onboarding.js";
import { showHome, showCommunities, showTagFeed } from "./screens-home.js";
import { showCommunity } from "./screens-community.js";
import { showTopic } from "./community-topic-screen.js";
import { showProposal, showVote } from "./screens-vote.js";
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
import { createScope } from "../shared/signals.js";

/** Escopo reativo da rota atual; descartado antes de montar a próxima. */
let currentRouteScope = null;

/**
 * Escopo da rota **atual** no momento da chamada.
 * Em telas async, capture o 2º argumento do handler (`handler(route, scope)`) **antes** de qualquer
 * `await` — não chame `getRouteScope()` depois do await (pode já ser a rota seguinte).
 * @returns {ReturnType<typeof createScope>|null}
 */
export function getRouteScope() {
  return currentRouteScope;
}

/** @type {Promise<typeof import("./screens-voxpedia.js")>|null} */
let voxpediaRoute = null;
/** @type {Promise<typeof import("./screens-ajuda-teste.js")>|null} */
let ajudaTesteRoute = null;
/** @type {Promise<typeof import("./screens-labs.js")>|null} */
let labsRoute = null;

/**
 * Carrega sob demanda a tela da Voxpédia.
 *
 * @returns {Promise<object>}
 */
function loadVoxpediaRoute() {
  voxpediaRoute ??= import("./screens-voxpedia.js");
  return voxpediaRoute;
}

/**
 * Carrega sob demanda a tela de ajuda e teste.
 *
 * @returns {Promise<object>}
 */
function loadAjudaTesteRoute() {
  ajudaTesteRoute ??= import("./screens-ajuda-teste.js");
  return ajudaTesteRoute;
}

/**
 * Carrega sob demanda as telas de laboratório.
 *
 * @returns {Promise<object>}
 */
function loadLabsRoute() {
  labsRoute ??= import("./screens-labs.js");
  return labsRoute;
}

/** @type {Promise<typeof import("./aviso-flow.js")>|null} */
let avisoRoute = null;
/** @type {Promise<typeof import("./screens-compose.js")>|null} */
let composeRoute = null;

/**
 * Carrega sob demanda o fluxo de avisos.
 *
 * @returns {Promise<object>}
 */
function loadAvisoRoute() {
  avisoRoute ??= import("./aviso-flow.js");
  return avisoRoute;
}

/**
 * Carrega sob demanda as telas de compor.
 *
 * @returns {Promise<object>}
 */
function loadComposeRoute() {
  composeRoute ??= import("./screens-compose.js");
  return composeRoute;
}

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
  "community-avisos": async (r) => { (await loadAvisoRoute()).showAvisos(r.communityId); },
  "compose-aviso": async (r) => { (await loadAvisoRoute()).showComposeAviso(r.communityId); },
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
  "compose-community": async () => { (await loadComposeRoute()).showComposeCommunity(); },
  "compose-listing": async (r) => { (await loadComposeRoute()).showComposeListing(r.communityId); },
  "compose-proposal": async (r) => { (await loadComposeRoute()).showComposeProposal(r.communityId); },
  "compose-topic": async (r) => { (await loadComposeRoute()).showComposeTopic(r.communityId); },
  "compose-reply": async (r) => {
    (await loadComposeRoute()).showComposeReply(r.topicId, r.communityId, r.parentId);
  },
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

const MAX_SCROLL_HISTORY = 50;
const scrollByHash = new Map();
let lastRenderedHash = "";
let pendingPopHash = null;

/**
 * Hash da rota atual, ou `#/` quando não há.
 *
 * @param {Window} [win=globalThis.window] Janela a consultar.
 * @returns {string}
 */
function currentRouteHash(win = globalThis.window) {
  return win?.location?.hash || "#/";
}

/**
 * Guarda a posição de rolagem vertical da rota atual (para restauração ao voltar no histórico).
 * @param {string} hash Hash da rota que está saindo da tela.
 * @param {Window} [win=globalThis.window] Janela alvo (injetável nos testes).
 * @returns {void}
 */
export function rememberRouteScroll(hash, win = globalThis.window) {
  if (!hash || !win) return;
  scrollByHash.delete(hash);
  scrollByHash.set(hash, Number(win.scrollY) || 0);
  if (scrollByHash.size > MAX_SCROLL_HISTORY) {
    scrollByHash.delete(scrollByHash.keys().next().value);
  }
}

/**
 * Restaura o scroll salvo em retorno pelo histórico (`popstate`) ou sobe para o topo em rota nova.
 * @param {string} hash Hash da rota recém-montada.
 * @param {boolean} isBack `true` quando a navegação veio de `popstate`.
 * @param {Window} [win=globalThis.window] Janela alvo (injetável nos testes).
 * @returns {number} Posição vertical aplicada.
 */
export function restoreRouteScroll(hash, isBack, win = globalThis.window) {
  const y = isBack && scrollByHash.has(hash) ? scrollByHash.get(hash) : 0;
  win?.scrollTo?.(0, y);
  return y;
}

/**
 * Limpa a memória de rolagem entre rotas (uso em testes).
 * @returns {void}
 */
export function __resetRouteScrollForTests() {
  scrollByHash.clear();
  lastRenderedHash = "";
  pendingPopHash = null;
}

/**
 * Aplica a rota atual: fecha menus, checa portão, despacha e restaura rolagem.
 *
 * @returns {Promise<void>}
 */
export async function routeImpl() {
  const nextHash = currentRouteHash();
  if (lastRenderedHash && lastRenderedHash !== nextHash) rememberRouteScroll(lastRenderedHash);
  const isBack = pendingPopHash !== null && pendingPopHash === nextHash;
  pendingPopHash = null;

  closePostMoreMenu();
  checkCantinaGate();
  currentRouteScope?.dispose();
  const scope = createScope();
  currentRouteScope = scope;
  const r = parseRoute();
  const handler = ROUTE_DISPATCH_TABLE[r.name] || ((_route, _scope) => showHome());
  const result = await handler(r, scope);
  announceRoute(r);
  lastRenderedHash = nextHash;
  restoreRouteScroll(nextHash, isBack);
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
 * Re-rota quando o hash da URL muda e marca retornos pelo histórico (`popstate`).
 *
 * @returns {void}
 */
export function setupHashchangeListener() {
  window.addEventListener("popstate", () => {
    pendingPopHash = currentRouteHash();
  });
  window.addEventListener("hashchange", () => routeImpl());
}
