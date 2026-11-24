/**
 * LAN-03 prep — rota lazy `#/sobre` (AGPL-3.0-or-later + canal DPO/não-usuário honesto).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function createMockEl(tag = "div") {
  const attrs = new Map();
  return {
    tagName: tag.toUpperCase(),
    id: "",
    innerHTML: "",
    focused: 0,
    hasAttribute: (k) => attrs.has(k),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    focus() { this.focused += 1; },
    appendChild(c) { return c; },
    insertAdjacentHTML() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    remove() {},
  };
}

const mockRoot = createMockEl("div");
mockRoot.id = "app-root";
const mockMain = createMockEl("main");
mockMain.id = "app-main";
const activeH1 = createMockEl("h1");

globalThis.document = {
  title: "Vox",
  body: createMockEl("body"),
  createElement: (tag) => createMockEl(tag),
  getElementById: (id) => (id === "app-root" ? mockRoot : id === "app-main" ? mockMain : null),
  querySelector: (sel) => (sel.includes("h1") ? activeH1 : null),
  querySelectorAll: () => [],
};

const {
  VOX_LICENSE_ID,
  VOX_SOURCE_REPO_URL,
  VOX_PROPOSAL_URL,
  VOX_PRIVACY_URL,
  VOX_DPO_ISSUE_URL,
  renderAboutPage,
} = await import("../client/js/render/about.js");
const { parseRoute, routeTitle } = await import("../client/js/app/route-parse.js");
const { isReadFirstRoute } = await import("../client/js/app/read-first.js");
const { shouldShowCantinaGate } = await import("../client/js/app/cantina-gate.js");
const { routeImpl } = await import("../client/js/app/route.js");

test("LAN-03: renderAboutPage exibe AGPL-3.0-or-later, código-fonte e proposta", () => {
  const html = renderAboutPage();
  assert.equal(VOX_LICENSE_ID, "AGPL-3.0-or-later");
  assert.ok(html.includes("AGPL-3.0-or-later"));
  assert.ok(html.includes(VOX_SOURCE_REPO_URL));
  assert.ok(html.includes(VOX_PROPOSAL_URL));
  assert.match(html, /<h1>.*Sobre o Vox.*<\/h1>/);
  assert.ok(html.includes('href="#/"'));
});

test("LAN-03: renderAboutPage exibe privacy.html, canal DPO/não-usuário, aviso sensível e nota G2/G3", () => {
  const html = renderAboutPage();
  assert.ok(html.includes(VOX_PRIVACY_URL));
  assert.ok(html.includes(VOX_DPO_ISSUE_URL));
  assert.match(html, /não envie dados pessoais sensíveis em issue pública/i);
  assert.match(html, /e-mail dedicado/i);
  assert.match(html, /G2\/G3/);
});

test("LAN-03: renderAboutPage não contém placeholder de revisão de loja", () => {
  const html = renderAboutPage();
  assert.doesNotMatch(html, /revis[aã]o de loja|play\s*store|app\s*store|PM-39/i);
});

test("LAN-03: parseRoute e routeTitle reconhecem #/sobre sem exigir conta (read-first)", () => {
  const prevLoc = globalThis.location;
  const prevWin = globalThis.window;
  globalThis.location = { hash: "#/sobre", search: "" };
  globalThis.window = { location: globalThis.location };
  try {
    const parsed = parseRoute();
    assert.deepEqual(parsed, { name: "about" });
    assert.equal(routeTitle(parsed), "Sobre & DPO · Vox");
    assert.equal(isReadFirstRoute("about"), true);
    assert.equal(shouldShowCantinaGate("about", { getItem: () => null }), false);
  } finally {
    globalThis.location = prevLoc;
    globalThis.window = prevWin;
  }
});

test("LAN-03: route.js carrega about.js via import() dinâmico e sw.js mantém 0 byte no precache", () => {
  const routeSrc = fs.readFileSync(path.join(ROOT, "client/js/app/route.js"), "utf8");
  const swSrc = fs.readFileSync(path.join(ROOT, "client/sw.js"), "utf8");
  const shellSection = swSrc.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = swSrc.split("const UNPLUGGED_MODULES")[1].split("];")[0];

  assert.match(routeSrc, /import\(\s*["']\.\.\/render\/about\.js["']\s*\)/);
  assert.doesNotMatch(routeSrc, /^import\s+.*from\s+["']\.\.\/render\/about\.js["']/m);
  assert.match(swSrc, /const CACHE_NAME = "vox-pwa-v\d+\.\d+-[^"]+";/);
  assert.ok(!shellSection.includes("about.js"), "about.js não deve entrar em SHELL_ASSETS");
  assert.ok(!unpluggedSection.includes("about.js"), "about.js é alcançável e não entra em UNPLUGGED_MODULES");
});

test("LAN-03: routeImpl despacha #/sobre sob demanda, atualiza título e foca h1", async () => {
  const prevLoc = globalThis.location;
  const prevWin = globalThis.window;
  const loc = { hash: "#/sobre", search: "" };
  globalThis.location = loc;
  globalThis.window = { location: loc, scrollY: 0, scrollTo() {}, addEventListener() {}, removeEventListener() {} };
  mockMain.innerHTML = "";
  activeH1.focused = 0;
  try {
    await routeImpl();
    assert.ok(mockMain.innerHTML.includes("AGPL-3.0-or-later"));
    assert.ok(mockMain.innerHTML.includes(VOX_DPO_ISSUE_URL));
    assert.equal(globalThis.document.title, "Sobre & DPO · Vox");
    assert.equal(activeH1.focused, 1);
  } finally {
    globalThis.location = prevLoc;
    globalThis.window = prevWin;
  }
});

test("LAN-03: rodapé de shell.js contém link discreto para #/sobre", () => {
  const shellSrc = fs.readFileSync(path.join(ROOT, "client/js/render/shell.js"), "utf8");
  assert.ok(shellSrc.includes('<a href="#/sobre">Sobre &amp; DPO</a>'));
});
