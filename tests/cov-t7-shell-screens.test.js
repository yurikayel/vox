/**
 * @file Cobertura T7 de `render/shell.js`, `app/screens-voxpedia.js`, `app/screens-ajuda-teste.js` e
 * `data/test-route-ids.js`, com DOM em memória.
 */
import "./setup.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as shell from "../client/js/render/shell.js";
import { showVoxpedia } from "../client/js/app/screens-voxpedia.js";
import { showAjudaTeste } from "../client/js/app/screens-ajuda-teste.js";
import { TEST_ROUTE_IDS } from "../client/js/data/test-route-ids.js";
import { applyFlags } from "../client/js/feature-flags.js";
import { FakeElement, installFakeDocument } from "./helpers/cov-t7-fake-dom.mjs";

let dom;
let mqMatches;
const realMatchMedia = globalThis.matchMedia;

beforeEach(() => {
  localStorage.clear();
  dom = installFakeDocument();
  const appRoot = new FakeElement("div");
  appRoot.id = "app-root";
  dom.document.body.appendChild(appRoot);
  const main = new FakeElement("main");
  main.id = "app-main";
  mqMatches = true;
  globalThis.matchMedia = () => ({ get matches() { return mqMatches; } });
  globalThis.window.matchMedia = globalThis.matchMedia;
  const origSet = Object.getOwnPropertyDescriptor(FakeElement.prototype, "innerHTML").set;
  Object.defineProperty(appRoot, "innerHTML", {
    configurable: true,
    get: () => appRoot._html,
    set: (h) => { origSet.call(appRoot, h); appRoot.children.push(main); },
  });
});
afterEach(() => {
  dom.restore();
  globalThis.matchMedia = realMatchMedia;
  applyFlags({});
});

const find = (id) => dom.document.getElementById(id);

test("TEST_ROUTE_IDS - lista congelada, única e só com chaves vx_", () => {
  assert.ok(Object.isFrozen(TEST_ROUTE_IDS));
  assert.equal(new Set(TEST_ROUTE_IDS).size, TEST_ROUTE_IDS.length);
  assert.ok(TEST_ROUTE_IDS.length > 100);
  assert.ok(TEST_ROUTE_IDS.every((id) => /^vx_[\w-]+$/.test(id)));
});

test("renderNetworkChip - só leitura, offline, aparelhos, entregues e rede ativa", () => {
  assert.match(shell.renderNetworkChip(null, null, { enabled: false }), /paused[\s\S]*Só leitura/);
  assert.match(shell.renderNetworkChip(null, { isOnline: false }, {}), /offline[\s\S]*Offline/);
  assert.match(shell.renderNetworkChip(null, { remotePeersConnected: 1 }, {}), /<span>1 aparelho<\/span>/);
  assert.match(shell.renderNetworkChip(null, { remotePeersConnected: 3 }, {}), /<span>3 aparelhos<\/span>/);
  assert.match(shell.renderNetworkChip({ blobsServed: 4 }, null, {}), /<span>4 entregues<\/span>/);
  assert.match(shell.renderNetworkChip(null, null, {}), /<span>Rede ativa<\/span>/);
});

test("renderMeshStatusChip - estado da malha segue o chip de rede", () => {
  const offline = shell.renderMeshStatusChip(shell.renderNetworkChip(null, { isOnline: false }, {}));
  assert.match(offline, /is-offline[\s\S]*Offline/);
  assert.match(shell.renderMeshStatusChip(shell.renderNetworkChip(null, null, { enabled: false })), /is-paused/);
  assert.match(shell.renderMeshStatusChip(shell.renderNetworkChip(null, null, {})), /is-active[\s\S]*Malha ativa/);
});

test("renderCirclesList - vazio, nome, não lidas e escape de HTML", () => {
  assert.equal(shell.renderCirclesList([]), "");
  assert.equal(shell.renderCirclesList([{ name: "sem id" }]), "");
  const html = shell.renderCirclesList([{ id: "c1", name: "<b>Praça</b>", unread: 1 }, { id: "c2", title: "Rua", unread: 3 }, { id: "c3" }]);
  assert.match(html, /3 ativos/);
  assert.match(html, /&lt;b&gt;Praça/);
  assert.match(html, /1 nova</);
  assert.match(html, /3 novas</);
  assert.match(shell.renderCirclesList([{ id: "c9" }]), /1 ativo</);
});

test("sumUnreadDms / formatDmBadge / renderFeedNav / renderPageHead / renderOpsNotice", () => {
  assert.equal(shell.sumUnreadDms([{ unreadCount: 2 }, { unreadCount: "3" }, null, {}]), 5);
  assert.deepEqual([0, -1, 7, 100].map(shell.formatDmBadge), ["", "", "7", "99+"]);
  assert.match(shell.renderFeedNav("civic"), /feed=civic" class="sidebar-feed-tab active"/);
  assert.match(shell.renderFeedNav("all"), /feed=all" class="sidebar-feed-tab active"/);
  const head = shell.renderPageHead({ title: "T&", subtitle: "S", actionsHtml: "<b>A</b>", id: "h1", wide: true });
  assert.match(head, /agora-page-head--wide" id="h1"[\s\S]*T&amp;[\s\S]*agora-page-sub[\s\S]*agora-page-actions/);
  assert.doesNotMatch(shell.renderPageHead({ title: "x" }), /agora-page-sub|agora-page-actions/);
  assert.equal(shell.renderOpsNotice(""), "");
  assert.match(shell.renderOpsNotice("<manutenção>"), /role="status">&lt;manutenção&gt;/);
});

test("renderShell - monta layout, devolve #app-main e chama os callbacks pós-montagem", () => {
  let mounted = 0;
  const off = shell.setAfterShellMount(() => { mounted += 1; });
  assert.equal(typeof shell.setAfterShellMount("não é função"), "function");
  const main = shell.renderShell({ activeTab: "dm", walletAddress: "vx_ana", breadcrumb: "<nav>x</nav>" });
  assert.equal(main.id, "app-main");
  assert.equal(mounted, 1);
  assert.deepEqual(main.inserted[0], ["afterbegin", "<nav>x</nav>"]);
  assert.match(dom.document.getElementById("app-root").innerHTML, /data-active-tab="dm"/);
  off();
  shell.renderShell({});
  assert.equal(mounted, 1);
});

test("renderShell - aviso operacional e modo demonstração entram antes do main", () => {
  applyFlags({ flags: {}, notice: "Janela de manutenção" });
  localStorage.setItem("vox-demo-mode", "1");
  const main = shell.renderShell({});
  const html = main.inserted.map((i) => i[1]).join("");
  assert.match(html, /Janela de manutenção/);
  assert.match(html, /Modo demonstração/);
  assert.equal(main.inserted.every((i) => i[0] === "beforebegin"), true);
});

test("comportamento da sidebar - recolhe no desktop, abre gaveta no celular e restaura o estado", () => {
  shell.renderShell({});
  const btn = find("sidebar-collapse-btn");
  const layout = dom.document.querySelector(".app-layout");
  btn.dispatch("click");
  assert.equal(layout.classes.has("sidebar-collapsed"), true);
  assert.equal(localStorage.getItem("vox-sidebar-collapsed"), "1");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  mqMatches = false;
  btn.dispatch("click");
  assert.equal(layout.classes.has("sidebar-drawer-open"), true);
  assert.equal(find("sidebar-backdrop").hidden, false);
  find("sidebar-backdrop").dispatch("click");
  assert.equal(layout.classes.has("sidebar-drawer-open"), false);
  assert.equal(find("sidebar-backdrop").hidden, true);
  mqMatches = true;
  shell.renderShell({});
  assert.equal(dom.document.querySelector(".app-layout").classes.has("sidebar-collapsed"), true);
});

test("alternador de tema - cada clique avança o modo, grava e atualiza o botão", () => {
  shell.renderShell({});
  const btn = find("theme-mode-toggle");
  const before = btn.getAttribute("aria-label");
  btn.dispatch("click");
  const stored = localStorage.getItem("vox-color-mode");
  assert.ok(["light", "dark"].includes(stored));
  assert.notEqual(btn.getAttribute("aria-label"), before);
  btn.dispatch("click");
  assert.notEqual(localStorage.getItem("vox-color-mode"), stored);
});

test("gaveta de identidade - abre, fecha por botão/fundo/Escape/link e copia o ID", async () => {
  shell.renderShell({ walletAddress: "vx_ana" });
  const drawer = find("agora-identity-drawer");
  const toggle = find("agora-identity-toggle");
  toggle.dispatch("click");
  assert.equal(drawer.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  find("agora-drawer-close").dispatch("click");
  assert.equal(drawer.hidden, true);
  toggle.dispatch("click");
  find("agora-drawer-backdrop").dispatch("click");
  assert.equal(drawer.hidden, true);
  toggle.dispatch("click");
  dom.document.dispatch("keydown", { key: "Escape" });
  assert.equal(drawer.hidden, true);
  toggle.dispatch("click");
  drawer.dispatch("click", { target: { closest: () => ({}) } });
  assert.equal(drawer.hidden, true);
  toggle.dispatch("click");
  drawer.dispatch("click", { target: { closest: () => null } });
  assert.equal(drawer.hidden, false);
  const copy = find("agora-copy-id");
  const target = { textContent: "" };
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("negado"); } } });
  await copy.listeners.click[0]({ target });
  assert.equal(target.textContent, "Selecione e copie");
});

test("busca da topbar - envia para #/people com ou sem termo", () => {
  shell.renderShell({});
  const form = find("agora-search-form");
  find("agora-search-input").value = " ana silva ";
  const realLocation = globalThis.location;
  globalThis.location = { hash: "" };
  try {
    form.dispatch("submit", { preventDefault() {} });
    assert.equal(globalThis.location.hash, "#/people?q=ana%20silva");
    find("agora-search-input").value = " ";
    form.dispatch("submit", { preventDefault() {} });
    assert.equal(globalThis.location.hash, "#/people");
  } finally {
    globalThis.location = realLocation;
  }
});

test("updateTopBarSync, renderLoading, renderError, renderDemoBanner e renderGatewayBanner", () => {
  shell.renderShell({});
  const hint = find("top-sync-hint");
  shell.updateTopBarSync(true, "Baixando");
  assert.equal(hint.textContent, "Baixando");
  assert.equal(hint.classes.has("is-active"), true);
  shell.renderGatewayBanner(null, "x");
  assert.equal(hint.textContent, "Sincronizando conteúdos…");
  shell.renderGatewayBanner(null, "");
  assert.equal(hint.textContent, "Sincronizando…");
  shell.updateTopBarSync(false);
  assert.equal(hint.classes.has("is-active"), false);
  const el = new FakeElement();
  shell.renderLoading(el, "Aguarde <b>");
  assert.match(el.innerHTML, /aria-busy="true" aria-label="Aguarde &lt;b&gt;"/);
  shell.renderError(el, "<x>");
  assert.equal(el.innerHTML, '<div class="error">&lt;x&gt;</div>');
  shell.renderDemoBanner(el);
  assert.match(el.inserted[0][1], /Sem conexão com a rede/);
});

test("telas Voxpedia e Ajuda de teste - montam o shell com a aba certa e preenchem o main", async () => {
  await showVoxpedia();
  const rootHtml = () => dom.document.getElementById("app-root").innerHTML;
  assert.match(rootHtml(), /data-active-tab="voxpedia"/);
  const main = find("app-main");
  assert.match(main.innerHTML, /Voxpedia/i);
  await showAjudaTeste();
  assert.match(rootHtml(), /data-active-tab="voxpedia"/);
  assert.match(find("app-main").innerHTML, /Teste aberto/i);
});
