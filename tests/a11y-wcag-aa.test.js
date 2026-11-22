/**
 * LAN-22: Portão automatizado de regressão WCAG 2.2 AA (estrutura, foco, toque, contraste e movimento reduzido).
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderShell } from "../client/js/render/shell.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf8");
const STYLE_CSS = fs.readFileSync(path.join(ROOT, "client/css/style.css"), "utf8");
const AGORA_CSS = fs.readFileSync(path.join(ROOT, "client/css/agora.css"), "utf8");

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function findMatchingBrace(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function parseDeclarations(body, target = new Map()) {
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim();
    const val = decl.slice(colon + 1).trim();
    if (prop.startsWith("--") && val) target.set(prop, val);
  }
  return target;
}

function collectRuleBlocks(css) {
  const clean = stripCssComments(css);
  const blocks = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf("{", cursor);
    if (open < 0) break;
    const selector = clean.slice(cursor, open).trim();
    const close = findMatchingBrace(clean, open);
    if (close < 0) break;
    const body = clean.slice(open + 1, close);
    blocks.push({ selector, body });
    cursor = close + 1;
  }
  return blocks;
}

function extractRuleVars(css, selectorPred, mediaNeedle = null) {
  const vars = new Map();
  const blocks = collectRuleBlocks(css);
  for (const blk of blocks) {
    if (mediaNeedle && blk.selector.startsWith("@media") && blk.selector.includes(mediaNeedle)) {
      for (const inner of collectRuleBlocks(blk.body)) {
        if (selectorPred(inner.selector)) parseDeclarations(inner.body, vars);
      }
      continue;
    }
    if (!mediaNeedle && !blk.selector.startsWith("@") && selectorPred(blk.selector)) {
      parseDeclarations(blk.body, vars);
    }
  }
  return vars;
}

function mergeMaps(...maps) {
  const out = new Map();
  for (const m of maps) {
    for (const [k, v] of m) out.set(k, v);
  }
  return out;
}

function buildThemeMaps() {
  const isRoot = (s) => s === ":root";
  const isDarkAttr = (s) => s.includes('[data-color-mode="dark"]');
  const isLightAttr = (s) => s.includes('[data-color-mode="light"]');
  const isNotLight = (s) => s.includes(':root:not([data-color-mode="light"])');
  const isNotDark = (s) => s.includes(':root:not([data-color-mode="dark"])');
  const isBrand = (s) => s === ":root:not(#sa-brand)";

  const styleBase = extractRuleVars(STYLE_CSS, isRoot);
  const styleDark = mergeMaps(styleBase, extractRuleVars(STYLE_CSS, isNotLight, "prefers-color-scheme: dark"));
  const agoraBase = extractRuleVars(AGORA_CSS, isRoot);
  const agoraBrand = extractRuleVars(AGORA_CSS, isBrand);
  const agoraDark = mergeMaps(
    styleBase,
    agoraBase,
    extractRuleVars(AGORA_CSS, isNotLight, "prefers-color-scheme: dark"),
    extractRuleVars(AGORA_CSS, isDarkAttr),
    agoraBrand
  );
  const agoraLight = mergeMaps(
    styleBase,
    agoraBase,
    extractRuleVars(AGORA_CSS, isNotDark, "prefers-color-scheme: light"),
    extractRuleVars(AGORA_CSS, isLightAttr),
    agoraBrand
  );
  return { agoraDark, agoraLight, legacyLight: styleBase, legacyDark: styleDark };
}

function resolveColor(tokens, key, depth = 0) {
  if (depth > 10) return null;
  const raw = key.startsWith("#") ? key : tokens.get(key);
  if (!raw) return null;
  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const h = hexMatch[1];
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase() : `#${h.toLowerCase()}`;
  }
  const varMatch = raw.match(/^var\(\s*(--[a-z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)$/i);
  if (!varMatch) return null;
  return resolveColor(tokens, varMatch[1], depth + 1) ?? (varMatch[2] ? resolveColor(tokens, varMatch[2].trim(), depth + 1) : null);
}

function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(fgHex, bgHex) {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function assertContrastPairs(tokens, pairs, minRatio, themeName) {
  for (const [fgKey, bgKey] of pairs) {
    const fg = resolveColor(tokens, fgKey);
    const bg = resolveColor(tokens, bgKey);
    assert.ok(fg, `${themeName}: token ${fgKey} não resolveu para hex`);
    assert.ok(bg, `${themeName}: token ${bgKey} não resolveu para hex`);
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= minRatio, `${themeName}: ${fgKey} (${fg}) sobre ${bgKey} (${bg}) = ${ratio.toFixed(2)}:1 (< ${minRatio}:1)`);
  }
}

function captureShellHtml() {
  const prevDoc = globalThis.document;
  const dummyRoot = { innerHTML: "" };
  globalThis.document = {
    getElementById: (id) => (id === "app-root" ? dummyRoot : null),
    documentElement: { setAttribute() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  try {
    renderShell({ activeTab: "home" });
    return dummyRoot.innerHTML;
  } finally {
    globalThis.document = prevDoc;
  }
}

function collectDuplicateIds(html) {
  const seen = new Set();
  const dups = [];
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
    if (seen.has(m[1])) dups.push(m[1]);
    seen.add(m[1]);
  }
  return dups;
}

function findSkippedHeadings(html) {
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const skips = [];
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) skips.push(`h${levels[i - 1]} -> h${levels[i]}`);
  }
  return skips;
}

function findImgsMissingAlt(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => !/\balt\s*=/i.test(tag));
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function hasAccessibleName(attrs, innerText, labelFors) {
  if (/\b(?:aria-label|aria-labelledby|title)\s*=\s*"[^"]+"/i.test(attrs)) return true;
  if (innerText) return true;
  const idMatch = attrs.match(/\bid="([^"]+)"/i);
  return Boolean(idMatch && labelFors.has(idMatch[1]));
}

function findUnnamedInteractiveControls(html) {
  const labelFors = new Set([...html.matchAll(/<label\b[^>]*for="([^"]+)"/gi)].map((m) => m[1]));
  const bad = [];
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    if (!hasAccessibleName(m[1], stripTags(m[2]), labelFors)) bad.push(m[0].slice(0, 80));
  }
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    if (/\btype="hidden"/i.test(m[1])) continue;
    if (!hasAccessibleName(m[1], "", labelFors)) bad.push(m[0].slice(0, 80));
  }
  return bad;
}

function hasVisibleFocusReplacement(body) {
  const hasOutline = /\boutline\s*:\s*(?!none\b|0\b)[^;]+/i.test(body);
  const hasShadow = /\bbox-shadow\s*:\s*(?!none\b)[^;]+/i.test(body);
  return hasOutline || hasShadow;
}

function findUnsafelySuppressedFocusVisible(css) {
  const blocks = collectRuleBlocks(css);
  const bySelector = new Map();
  for (const blk of blocks) {
    if (!blk.selector.includes(":focus-visible")) continue;
    const prev = bySelector.get(blk.selector) || "";
    bySelector.set(blk.selector, `${prev};${blk.body}`);
  }
  const bad = [];
  for (const [sel, body] of bySelector) {
    if (/\boutline\s*:\s*(?:none|0)\b/i.test(body) && !hasVisibleFocusReplacement(body)) {
      bad.push(sel);
    }
  }
  return bad;
}

function extractMediaBlockBody(css, needle) {
  return collectRuleBlocks(stripCssComments(css))
    .filter((b) => b.selector.startsWith("@media") && b.selector.includes(needle))
    .map((b) => b.body)
    .join("\n");
}

function parseCssPx(raw) {
  const m = raw.match(/^([0-9.]+)(px|rem)$/i);
  if (!m) return 0;
  return m[2].toLowerCase() === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

function findRuleBody(css, selectorExact) {
  const matches = collectRuleBlocks(css).filter((b) => b.selector === selectorExact);
  return matches.map((m) => m.body).join(";");
}

describe("WCAG 2.2 AA — Documento e Landmarks (HTML + Shell)", () => {
  const shellHtml = captureShellHtml();

  it("html possui lang válido, skip-link para #app-main e CSS visível ao focar", () => {
    assert.match(INDEX_HTML, /<html\b[^>]*\blang="pt-BR"/i);
    assert.match(INDEX_HTML, /<a\b[^>]*class="skip-link"[^>]*href="#app-main"/i);
    assert.ok(INDEX_HTML.indexOf('href="#app-main"') < INDEX_HTML.indexOf('id="app-root"'));
    assert.match(AGORA_CSS, /\.skip-link\s*\{[\s\S]*?\.skip-link:focus-visible\s*\{/);
  });

  it("shell renderizado expõe landmarks header, nav e main#app-main sem IDs duplicados", () => {
    assert.match(shellHtml, /<header\b[^>]*class="agora-topbar"/);
    assert.match(shellHtml, /<nav\b[^>]*class="tab-nav"/);
    assert.match(shellHtml, /<main\b[^>]*id="app-main"/);
    assert.deepEqual(collectDuplicateIds(`${INDEX_HTML}\n${shellHtml}`), []);
  });

  it("hierarquia de cabeçalhos sem saltos e todas as imagens com alt", () => {
    const combined = `${INDEX_HTML}\n${shellHtml}`;
    assert.deepEqual(findSkippedHeadings(combined), []);
    assert.deepEqual(findImgsMissingAlt(combined), []);
  });

  it("botões e campos de formulário possuem nome acessível", () => {
    assert.deepEqual(findUnnamedInteractiveControls(`${INDEX_HTML}\n${shellHtml}`), []);
  });
});

describe("WCAG 2.2 AA — Foco de Teclado (:focus-visible)", () => {
  it("agora.css define regra global de :focus-visible com outline visível", () => {
    assert.match(
      AGORA_CSS,
      /:where\([^)]*\):focus-visible\s*\{[^}]*outline:\s*2px\s+solid/
    );
  });

  it("nenhuma regra :focus-visible em style.css ou agora.css suprime foco sem substituto visível", () => {
    assert.deepEqual(findUnsafelySuppressedFocusVisible(STYLE_CSS), []);
    assert.deepEqual(findUnsafelySuppressedFocusVisible(AGORA_CSS), []);
  });

  it("compose-textarea-seamless não bloqueia outline de foco com !important", () => {
    const body = findRuleBody(STYLE_CSS, ".compose-textarea-seamless");
    assert.ok(body.length > 0);
    assert.doesNotMatch(body, /outline\s*:\s*none\s*!important/i);
    assert.match(STYLE_CSS, /\.compose-textarea-seamless:focus-visible\s*\{[^}]*outline:\s*2px\s+solid/);
  });
});

describe("WCAG 2.2 AA — Alvos de Toque (SC 2.5.8)", () => {
  it("controles primários e ícones atendem >= 24px no desktop e >= 44px em toque/mobile", () => {
    const desktopTargets = [
      [AGORA_CSS, ".agora-topbar-icon", /height:\s*([0-9.]+(?:px|rem))/],
      [AGORA_CSS, ".agora-icon-btn", /height:\s*([0-9.]+(?:px|rem))/],
      [AGORA_CSS, ".agora-btn", /min-height:\s*([0-9.]+(?:px|rem))/],
      [STYLE_CSS, ".sidebar-collapse-btn", /height:\s*([0-9.]+(?:px|rem))/],
      [STYLE_CSS, ".post-lightbox-close", /height:\s*([0-9.]+(?:px|rem))/],
    ];
    for (const [css, sel, re] of desktopTargets) {
      const m = findRuleBody(css, sel).match(re);
      assert.ok(m, `tamanho ausente em ${sel}`);
      assert.ok(parseCssPx(m[1]) >= 24, `${sel} menor que 24px: ${m[1]}`);
    }
    const coarseAgora = extractMediaBlockBody(AGORA_CSS, "(pointer: coarse), (max-width: 767px)");
    assert.match(coarseAgora, /\.agora-btn[\s\S]*min-height:\s*44px/);
    assert.match(coarseAgora, /\.agora-topbar-icon[\s\S]*min-height:\s*44px/);
    const coarseStyle = extractMediaBlockBody(STYLE_CSS, "(pointer: coarse), (max-width: 767px)");
    assert.match(coarseStyle, /\.inline-composer-tool[\s\S]*min-height:\s*44px/);
  });
});

const AGORA_DARK_TEXT_PAIRS = [
  ["--sa-on-surface", "--sa-surface"], ["--sa-on-surface", "--sa-surface-container"], ["--sa-on-surface-variant", "--sa-surface"],
  ["--sa-outline", "--sa-surface"], ["--sa-outline", "--sa-surface-container"], ["--sa-outline", "--sa-surface-high"],
  ["--sa-primary", "--sa-surface"], ["--sa-on-primary", "--sa-primary"], ["--sa-on-primary-fixed", "--sa-primary-container"],
  ["--sa-secondary", "--sa-surface"], ["--sa-on-secondary", "--sa-secondary"], ["--sa-tertiary", "--sa-surface"],
  ["--sa-on-tertiary", "--sa-tertiary"], ["--sa-error", "--sa-surface"], ["--text", "--bg"],
  ["--text-muted", "--surface-1"], ["--danger", "--surface-1"], ["--success", "--surface-1"],
];

const AGORA_LIGHT_TEXT_PAIRS = [
  ["--sa-on-surface", "--sa-surface"], ["--sa-on-surface", "--sa-surface-container"], ["--sa-on-surface-variant", "--sa-surface"],
  ["--sa-outline", "--sa-surface"], ["--sa-outline", "--sa-surface-container"], ["--sa-outline", "--sa-surface-high"],
  ["--sa-primary", "--sa-surface"], ["--sa-on-primary-fixed", "--sa-primary"], ["--sa-on-primary-fixed", "--sa-primary-container"],
  ["--sa-on-primary-fixed", "--sa-tertiary-container"], ["--sa-secondary", "--sa-surface"], ["--sa-tertiary", "--sa-surface"],
  ["--sa-error", "--sa-surface"], ["--text-muted", "--sa-surface-container"], ["--danger", "--sa-surface-container"],
  ["--success", "--sa-surface-container"], ["--warning", "--warn-bg"],
];

const AGORA_UI_PAIRS = [["--sa-primary", "--sa-surface-container"], ["--sa-secondary", "--sa-surface-container"]];

const LEGACY_LIGHT_PAIRS = [
  ["--text", "--bg"], ["--text", "--surface-1"], ["--muted", "--bg"], ["--muted", "--surface-1"],
  ["--accent", "--surface-1"], ["--on-accent", "--accent"], ["--on-accent", "--success"], ["--danger", "--bg"],
  ["--danger", "--surface-1"], ["--success", "--bg"], ["--warning", "--surface-1"], ["--warning", "--warn-bg"],
];

const LEGACY_DARK_PAIRS = [
  ["--text", "--bg"], ["--muted", "--bg"], ["--muted", "--surface-1"],
  ["--link", "--bg"], ["--danger", "--surface-1"], ["--success", "--surface-1"],
];

describe("WCAG 2.2 AA — Contraste de Cores (SC 1.4.3 & 1.4.11)", () => {
  const themes = buildThemeMaps();

  it("Sovereign Agora Dark atende >= 4.5:1 para texto normal e >= 3.0:1 para foco/UI", () => {
    assertContrastPairs(themes.agoraDark, AGORA_DARK_TEXT_PAIRS, 4.5, "Sovereign Agora Dark");
    assertContrastPairs(themes.agoraDark, AGORA_UI_PAIRS, 3.0, "Sovereign Agora Dark UI");
  });

  it("Sovereign Agora Light atende >= 4.5:1 para texto normal e >= 3.0:1 para foco/UI", () => {
    assertContrastPairs(themes.agoraLight, AGORA_LIGHT_TEXT_PAIRS, 4.5, "Sovereign Agora Light");
    assertContrastPairs(themes.agoraLight, AGORA_UI_PAIRS, 3.0, "Sovereign Agora Light UI");
  });

  it("Base legada (style.css claro e escuro) atende >= 4.5:1 para texto semântico", () => {
    assertContrastPairs(themes.legacyLight, LEGACY_LIGHT_PAIRS, 4.5, "Legacy Light");
    assertContrastPairs(themes.legacyDark, LEGACY_DARK_PAIRS, 4.5, "Legacy Dark");
  });
});

describe("WCAG 2.2 AA — Movimento Reduzido (prefers-reduced-motion)", () => {
  it("CSS respeita prefers-reduced-motion: reduce e no-preference", () => {
    const reduceAgora = extractMediaBlockBody(AGORA_CSS, "prefers-reduced-motion: reduce");
    assert.ok(reduceAgora.length > 0, "agora.css precisa de @media (prefers-reduced-motion: reduce)");
    assert.match(reduceAgora, /transition\s*:\s*none/);
    const noPrefStyle = extractMediaBlockBody(STYLE_CSS, "prefers-reduced-motion: no-preference");
    assert.ok(noPrefStyle.length > 0, "style.css precisa condicionar animações infinitas a no-preference");
    assert.match(noPrefStyle, /animation\s*:/);
  });
});
