import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(here, "../client");
const agoraCss = fs.readFileSync(path.join(clientRoot, "css/agora.css"), "utf8");

const { renderCirclesList, renderPageHead } = await import("../client/js/render/shell.js");
const { renderComposeTypeSelector, renderComposeSignaturePanel } = await import("../client/js/render/compose-chrome.js");
const { renderStatusPage } = await import("../client/js/render/status.js");
const render = await import("../client/js/render.js");

function fakeMain() {
  return { innerHTML: "" };
}

test("sovereign agora — tokens canônicos do DESIGN.md e aliases da camada anterior", () => {
  for (const token of ["--sa-primary: #78d6cf", "--sa-secondary: #e7c26b", "--sa-tertiary: #69dba9", "--sa-surface: #111316"]) {
    assert.ok(agoraCss.includes(token), `falta ${token}`);
  }
  assert.match(agoraCss, /--emerald-consensus:\s*var\(--sa-tertiary\)/);
  assert.match(agoraCss, /--aurora-gradient:\s*var\(--sa-gradient-sovereign\)/);
  assert.match(agoraCss, /:root:not\(#sa-brand\)\s*\{[\s\S]*--brand-chrome:\s*var\(--sa-primary-container\)/);
  assert.ok(!/rgba\(16, 185, 129/.test(agoraCss), "esmeralda antiga (#10b981) não deve sobrar");
});

test("sovereign agora — círculos territoriais só com dados locais, sem contagem inventada", () => {
  assert.equal(renderCirclesList([]), "");
  const html = renderCirclesList([
    { id: "pinheiros", name: "Pinheiros", unread: 3 },
    { id: "jardins", title: "Jardins" },
  ]);
  assert.ok(html.includes('href="#/c/pinheiros"'));
  assert.ok(html.includes("3 novas"));
  assert.ok(html.includes("Jardins"));
  assert.ok(html.includes("2 ativos"));
  assert.ok(!/civitas|nós/.test(html), "nenhuma métrica fictícia de população");
});

test("sovereign agora — cabeçalho de página sem etiquetas decorativas", () => {
  const html = renderPageHead({ title: "Teste", subtitle: "Sub", wide: true });
  assert.ok(html.includes('<h1 class="agora-page-title">Teste</h1>'));
  assert.ok(html.includes("agora-page-head--wide"));
  assert.ok(!html.includes("agora-kicker"));
  assert.ok(!agoraCss.includes(".agora-protocol-strip"));
  assert.ok(!agoraCss.includes(".agora-node-stele"));
});

test("sovereign agora — compositor: tipos de registro mapeiam rotas existentes", () => {
  const html = renderComposeTypeSelector("proposal", "pinheiros");
  assert.ok(html.includes('href="#/compose/proposal?c=pinheiros"'));
  assert.ok(html.includes('href="#/compose/topic?c=pinheiros"'));
  assert.ok(html.includes('href="#/compose/community"'));
  assert.match(html, /agora-compose-type is-active"[^>]*aria-current="page"/);
  assert.ok(renderComposeSignaturePanel().includes("Ed25519"));
});

test("sovereign agora — saúde do nó mostra pares reais e mantém IDs de hidratação", () => {
  const main = fakeMain();
  renderStatusPage(main, {
    gatewayHealth: { state: "all_ok", gateways: {} },
    relayStatus: { online: true },
    rtcStatus: { remotePeersConnected: 3 },
  });
  assert.ok(main.innerHTML.includes("3 pares"));
  assert.ok(main.innerHTML.includes('id="status-storage-bar"'));
  assert.ok(main.innerHTML.includes('id="status-sw-cache"'));
});

test("sovereign agora — onboarding Stitch preserva fluxos e IDs", () => {
  const container = { innerHTML: "" };
  render.renderOAuthEnrich(container);
  const html = container.innerHTML;
  for (const id of ["form-oauth-custom-name", "oauth-custom-name-input", "form-oauth-restore-passphrase", "btn-oauth-skip", "btn-oauth-github"]) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  assert.ok(html.includes("Sua Chave."));
  assert.ok(html.includes("Fundamentos da Polis"));
});

test("sovereign agora — diretório de cidadãos usa tábuas com chave e ações P2P", () => {
  const main = fakeMain();
  render.renderPeopleSearch(main, {
    sections: { contacts: [{ routeId: "vx_c1", name: "Helena", handle: "helena", source: "contact" }], mesh: [], tour: [] },
    results: [],
    query: "",
  });
  assert.ok(main.innerHTML.includes("Diretório de Cidadãos"));
  assert.ok(main.innerHTML.includes("agora-citizen"));
  assert.ok(main.innerHTML.includes('href="#/dm/vx_c1"'));
  assert.ok(main.innerHTML.includes("@helena"));
});
