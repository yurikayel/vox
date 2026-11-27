/**
 * @file Contrato de CSS das telas v4 (sv-*.css): lê os tokens `--sa-*` de `agora.css`, resolve `var()`, mede contraste
 * (WCAG 2.x) e confere alvo de toque mínimo e ausência de `!important`. Sem navegador: tudo é análise de texto.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CSS_DIR = new URL("../../client/css/", import.meta.url);
const REM_PX = 16;

/**
 * Lê uma folha de `client/css/`.
 * @param {string} name Nome do arquivo (ex.: `"agora.css"`).
 * @returns {string} Conteúdo da folha.
 */
export function readCss(name) {
  return readFileSync(new URL(name, CSS_DIR), "utf8");
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Corpo da(s) regra(s) cujo seletor (ou um dos seletores separados por vírgula) é exatamente `selector`.
 * Blocos `@media` são percorridos; o corpo de várias ocorrências é concatenado.
 * @param {string} css Texto da folha.
 * @param {string} selector Seletor completo (ex.: `".sv-camp-enter"`).
 * @returns {string} Declarações juntas, ou texto vazio se não houver regra.
 */
export function ruleBody(css, selector) {
  const bodies = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(m[2].trim());
  }
  return bodies.join("; ");
}

function declarations(body) {
  const out = new Map();
  for (const part of body.split(";")) {
    const at = part.indexOf(":");
    if (at > 0) out.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim());
  }
  return out;
}

/**
 * Tokens `--sa-*` de `agora.css` para um tema: o bloco `:root` base mais `:root[data-color-mode="<mode>"]`.
 * @param {"dark"|"light"} [mode="dark"] Tema.
 * @returns {Map<string, string>} Nome (`--sa-surface`) → valor como escrito na folha.
 */
export function readSaTokens(mode = "dark") {
  const css = readCss("agora.css");
  const tokens = new Map();
  for (const selector of [":root", `:root[data-color-mode="${mode}"]`]) {
    for (const [name, value] of declarations(ruleBody(css, selector))) if (name.startsWith("--sa-")) tokens.set(name, value);
  }
  return tokens;
}

/**
 * Resolve um valor de cor: `#rgb`/`#rrggbb` ou `var(--x[, fallback])`, seguindo cadeias de `var()`.
 * @param {string} value Valor declarado.
 * @param {Map<string, string>} tokens Tokens (`readSaTokens`).
 * @param {number} [depth=0] Profundidade (limite contra ciclos).
 * @returns {string|null} Hex minúsculo `#rrggbb`, ou `null` se não resolve (inclui cor literal que não é hex).
 */
export function resolveVar(value, tokens, depth = 0) {
  const raw = String(value || "").trim();
  if (depth > 10 || !raw) return null;
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1]}`.toLowerCase();
  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/i);
  if (!ref) return null;
  return resolveVar(tokens.get(ref[1]), tokens, depth + 1) ?? (ref[2] ? resolveVar(ref[2], tokens, depth + 1) : null);
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Razão de contraste WCAG 2.x entre duas cores hex (1 a 21).
 * @param {string} fg Cor do primeiro plano (`#rrggbb`).
 * @param {string} bg Cor do fundo (`#rrggbb`).
 * @returns {number} Razão de contraste.
 */
export function contrastRatio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Conta os `!important` fora de comentários.
 * @param {string} css Texto da folha.
 * @returns {number} Quantidade.
 */
export function countImportant(css) {
  return (stripComments(css).match(/!important/gi) || []).length;
}

/**
 * Falha se a folha usa `!important` fora de comentários.
 * @param {string} css Texto da folha.
 * @param {string} [label="folha"] Nome para a mensagem.
 * @returns {void}
 */
export function assertNoImportant(css, label = "folha") {
  assert.equal(countImportant(css), 0, `${label}: sem !important`);
}

function toPx(value) {
  const m = String(value || "").match(/^([\d.]+)(px|rem)$/i);
  if (!m) return 0;
  return m[2].toLowerCase() === "rem" ? Number(m[1]) * REM_PX : Number(m[1]);
}

/**
 * Falha se a regra de `selector` não declara `min-height` e `min-width` de pelo menos `minPx`.
 * @param {string} css Texto da folha.
 * @param {string} selector Seletor do elemento clicável.
 * @param {number} [minPx=44] Alvo mínimo em px (`rem` vale 16 px).
 * @returns {void}
 */
export function assertMinTarget(css, selector, minPx = 44) {
  const props = declarations(ruleBody(css, selector));
  for (const prop of ["min-height", "min-width"]) {
    assert.ok(props.has(prop), `${selector}: sem ${prop}`);
    assert.ok(toPx(props.get(prop)) >= minPx, `${selector}: ${prop} ${props.get(prop)} < ${minPx}px`);
  }
}

function definedProps() {
  const names = new Set();
  for (const file of ["agora.css", "style.css"]) for (const m of stripComments(readCss(file)).matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);
  return names;
}

/**
 * Falha se a folha usa `var(--x)` com `--x` não definida em `agora.css` nem em `style.css`; o fallback literal não conta.
 * @param {string} css Texto da folha.
 * @param {string} [label="folha"] Nome para a mensagem.
 * @returns {void}
 */
export function assertVarsDefined(css, label = "folha") {
  const defined = definedProps();
  const used = new Set([...stripComments(css).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `${label}: var() sem definição no tema`);
}
