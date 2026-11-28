import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const SW_CACHE_ID = /vox-pwa-v7\.\d+(-[a-z0-9-]+)?/;

test("depurple paper - service worker cache id", () => {
  assert.match(sw, SW_CACHE_ID);
  assert.ok(sw.includes('"./js/media-lofi.js"'));
  assert.ok(sw.includes('"./js/perma-notary.js"'));
  assert.ok(sw.includes('"./js/labs/parado/civic-credential.js"'));
  assert.ok(sw.includes('"./js/dm-messenger.js"'));
  assert.ok(sw.includes('"./js/chat-bridge.js"'));
  assert.ok(sw.includes('"./js/qr-url.js"'));
  assert.ok(sw.includes('"./js/identity/account-backup-wrap.js"'));
  assert.ok(sw.includes('"./js/app/cantina-gate.js"'));
  assert.ok(sw.includes('"./js/community-mirror.js"'));
  assert.ok(sw.includes('"./js/community-seed-checklist.js"'));
  assert.ok(sw.includes('"./js/photo-tags.js"'));
  assert.ok(sw.includes('"./js/profile-note.js"'));
  assert.ok(sw.includes('"./js/repost-index.js"'));
  assert.ok(sw.includes('"./js/render/repost-btn.js"'));
  assert.ok(sw.includes('"./js/app/repost-ui.js"'));
  assert.ok(sw.includes('"./js/sky-theme.js"'));
  assert.ok(sw.includes('"./js/contribution-attestation.js"'));
  assert.ok(sw.includes('"./js/app/onboarding-oauth-ui.js"'));
  const shellOnly = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  assert.ok(shellOnly.includes("screens-ajuda-teste.js"), "F27: tela ajuda-teste no precache, a rota abre offline");
  // `render.js` reexporta estaticamente os dois: offline, sem eles no precache, o shell inteiro não sobe.
  assert.ok(shellOnly.includes("render/ajuda-teste.js"), "render ajuda-teste é importado de forma estática pelo shell: fica no precache");
  assert.ok(shellOnly.includes("render/voxpedia.js"), "render voxpedia é importado de forma estática pelo shell: fica no precache");
  assert.ok(!shellOnly.includes("aviso-flow.js"), "PM-01 passo 2: aviso-flow fora do precache");
});

function walkJsFiles(dir) {
  const res = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) res.push(...walkJsFiles(full));
    else if (ent.name.endsWith(".js")) res.push(full);
  }
  return res;
}

function getHtmlEntryPoints(baseRoot) {
  const pages = fs.readdirSync(baseRoot).filter((f) => f.endsWith(".html")).map((f) => path.join(baseRoot, f));
  for (const extra of ["download/index.html", "embed/demo.html", "embed/frame-demo.html"]) {
    if (fs.existsSync(path.join(baseRoot, extra))) pages.push(path.join(baseRoot, extra));
  }
  const entries = [];
  for (const page of pages) {
    for (const m of fs.readFileSync(page, "utf8").matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
      if (!/^https?:/.test(m[1])) entries.push(path.resolve(path.dirname(page), m[1]));
    }
  }
  return entries;
}

function resolveReachableJs(baseRoot) {
  const importRe = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
  const toRel = (abs) => "./" + path.relative(baseRoot, abs).split(path.sep).join("/");
  const live = new Set();
  const stack = getHtmlEntryPoints(baseRoot);
  while (stack.length) {
    const file = stack.pop();
    if (live.has(file) || !fs.existsSync(file)) continue;
    live.add(file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(importRe)) {
      const spec = m[1] || m[2] || m[3];
      if (spec?.startsWith(".")) stack.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...live].map(toRel));
}

test("service worker - shell assets 100% complete and exist on disk", () => {
  const match = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, "SHELL_ASSETS array must be defined");
  const assets = match[1]
    .split("\n")
    .map((s) => s.trim().replace(/^['"]|['"],?$/g, ""))
    .filter((s) => s && !s.startsWith("//"));

  for (const a of assets) {
    if (a !== "./") {
      assert.ok(fs.existsSync(path.join(root, a)), `Asset ${a} in SHELL_ASSETS must exist on disk`);
    }
  }

  // PM-04: módulo que nenhum ponto de entrada carrega fica em UNPLUGGED_MODULES, fora do precache.
  const unpluggedMatch = sw.match(/const UNPLUGGED_MODULES = \[([\s\S]*?)\];/);
  const unplugged = unpluggedMatch
    ? unpluggedMatch[1].split("\n").map((s) => s.trim().replace(/^['"]|['"],?$/g, "")).filter(Boolean)
    : [];

  const reachableJs = resolveReachableJs(root);
  const allJs = walkJsFiles(path.join(root, "js"));
  for (const js of allJs) {
    const rel = "./" + path.relative(root, js).replace(/\\/g, "/");
    const accounted = assets.includes(rel) || unplugged.includes(rel) || reachableJs.has(rel);
    assert.ok(accounted, `Client JS file ${rel} must be in SHELL, UNPLUGGED or alcançável (PM-01 lazy)`);
    assert.ok(!(assets.includes(rel) && unplugged.includes(rel)), `${rel} não pode estar nas duas listas`);
  }
});

test("onboarding paper - modal sheet/card in CSS, neutral scrim", () => {
  assert.ok(css.includes(".modal-sheet"));
  assert.ok(css.includes(".modal-card"));
  assert.ok(css.includes("rgba(0, 0, 0, 0.5)"));
  const overlay = css.match(/\.modal-overlay\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!overlay.includes("backdrop-filter: blur"), "modal overlay must not blur");
});

test("onboarding paper - oauth modals use semantic classes not glass card", () => {
  const modals = ["js/render/oauth-modals.js", "js/render/genesis-entry.js", "js/render/welcome-pact.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  assert.ok(modals.includes("modal-sheet"));
  assert.ok(modals.includes("modal-card"));
  assert.ok(modals.includes("modal-feature"));
  assert.ok(!modals.includes('class="modal-dialog card"'));
  assert.ok(!modals.includes("pact-feature"));
  assert.ok(!/style="[^"]*(?:gradient|#312183|rgba\(49)/i.test(modals));
});

test("depurple paper - sidebar nav active not accent-soft fill", () => {
  const tabActive = css.match(/\.tab-item\.active\s*\{[^}]+\}/s)?.[0] ?? "";
  const feedTabActive = css.match(/\.sidebar-feed-tab\.active\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!tabActive.includes("accent-soft"), "tab-item.active");
  assert.ok(!feedTabActive.includes("accent-soft"), "sidebar-feed-tab.active");
  assert.ok(tabActive.includes("nav-active-bg"));
});

test("carbon parchment - base bg tokens and sky does not wash --bg", () => {
  assert.ok(css.includes("--bg-parchment: #f4f0e8"));
  assert.ok(css.includes("--bg-carbon: #18181a"));
  assert.ok(css.includes("--bg: var(--bg-parchment)"));
  const skyManha = css.match(/:root\[data-sky-period="manha"\]\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(!skyManha.includes("--bg:"), "sky period must not override --bg");
  assert.ok(!css.includes("#312183"), "purple brand chrome removed");
  assert.ok(!css.includes("#c8c0f0"));
  assert.ok(!css.includes("#0c0a18"), "purple-tint dark canvas removed");
});

test("depurple paper - dark surfaces neutral carbon stack", () => {
  assert.ok(css.includes("--surface-1: #222224"));
});

test("depurple paper - compose tab solid brand not gradient block", () => {
  const compose = css.match(/\.tab-item\.compose-tab\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.ok(compose.includes("brand-navy"));
  assert.ok(!compose.includes("accent-gradient"));
});
