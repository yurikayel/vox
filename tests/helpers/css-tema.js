/**
 * @file Resolve o CSS do Vox como o navegador o carrega, por tema e por caminho de tema, para os testes de contraste:
 * variáveis `--x` de cada tema (atributo `data-color-mode`, `@media (prefers-color-scheme)` no modo automático, ou os
 * dois), cor hexadecimal de um valor com `var()` e a declaração que vence para um seletor (especificidade e depois a
 * ordem das folhas `style.css`, `agora.css` e `sv-*.css`). Só leitura de arquivos; nada de DOM.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/css");

/** Folhas `sv-*.css` em ordem alfabética (a ordem em que os testes as empilham depois de `agora.css`). */
export const SV_SHEETS = fs.readdirSync(CSS_DIR).filter((f) => /^sv-.*\.css$/.test(f)).sort();

/**
 * Lê uma folha de `client/css` sem comentários.
 * @param {string} name Nome do arquivo, por exemplo `agora.css`.
 * @returns {string} CSS sem comentários.
 */
export function readSheet(name) {
  return fs.readFileSync(path.join(CSS_DIR, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Blocos `{ selector, body }` de um nível, com chaves casadas (um `@media` volta como um bloco com o corpo inteiro).
 * @param {string} css CSS sem comentários.
 * @returns {{selector: string, body: string}[]}
 */
export function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let close = open;
    for (; close < css.length; close += 1) {
      depth += css[close] === "{" ? 1 : css[close] === "}" ? -1 : 0;
      if (depth === 0) break;
    }
    out.push({ selector: css.slice(i, open).trim(), body: css.slice(open + 1, close) });
    i = close + 1;
  }
  return out;
}

function addVars(body, into) {
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    const prop = decl.slice(0, colon).trim();
    if (colon > 0 && prop.startsWith("--")) into.set(prop, decl.slice(colon + 1).trim());
  }
}

const SELECTORS = {
  dark: { media: "prefers-color-scheme: dark", inMedia: ':root:not([data-color-mode="light"])', attr: '[data-color-mode="dark"]' },
  light: { media: "prefers-color-scheme: light", inMedia: ':root:not([data-color-mode="dark"])', attr: '[data-color-mode="light"]' },
};

function themeVars(css, theme, route, into) {
  const sel = SELECTORS[theme];
  for (const blk of blocks(css)) {
    if (blk.selector === ":root" || (route !== "media" && blk.selector.includes(sel.attr))) addVars(blk.body, into);
    else if (route !== "attr" && blk.selector.startsWith("@media") && blk.selector.includes(sel.media)) {
      for (const inner of blocks(blk.body)) if (inner.selector === sel.inMedia) addVars(inner.body, into);
    }
  }
}

/**
 * Variáveis de um tema, empilhando `style.css`, `agora.css` e as `sv-*.css` como o `index.html`.
 * Leitor legado: só enxerga o bloco do atributo no nível alto, então ignora o bloco `:root[data-color-mode="dark"]`
 * que `style.css` põe dentro de `@media (prefers-color-scheme: light)` (o escuro por atributo com o sistema claro fica
 * com o valor claro). Para esse caso e para a cascata de verdade, use `themeTokens` de `css-cascata.js`.
 * @param {"light"|"dark"} theme Tema.
 * @param {"attr"|"media"|"both"} [route="both"] `attr`: só o atributo `data-color-mode`; `media`: só o `@media`
 * (modo automático, sem atributo); `both`: os dois, o atributo vencendo.
 * @returns {Map<string, string>} Nome da variável para o valor declarado.
 */
export function resolveTheme(theme, route = "both") {
  const tokens = new Map();
  for (const file of ["style.css", "agora.css", ...SV_SHEETS]) themeVars(readSheet(file), theme, route, tokens);
  return tokens;
}

/**
 * Cor `#rrggbb` de um token ou valor, seguindo `var(--x, fallback)` até uma cor cheia.
 * @param {Map<string, string>} tokens Variáveis do tema.
 * @param {string} key Nome da variável (`--x`), cor `#rrggbb` ou `var(--x)`.
 * @param {number} [depth=0] Profundidade da recursão (uso interno).
 * @returns {string|null} Hexadecimal minúsculo, ou `null` se não resolveu.
 */
export function hexOf(tokens, key, depth = 0) {
  const raw = key.startsWith("#") || key.startsWith("var(") ? key : tokens.get(key);
  if (!raw || depth > 10) return null;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i);
  return ref ? hexOf(tokens, ref[1], depth + 1) : null;
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
 * Razão de contraste WCAG entre duas cores `#rrggbb`.
 * @param {string} a Cor.
 * @param {string} b Cor.
 * @returns {number} Razão de 1 a 21.
 */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Falha se `fg` sobre `bg` não chega a `min`:1 (texto 4.5, contorno e ícone 3).
 * @param {string} label Rótulo da mensagem de erro.
 * @param {string|null} fg Cor da frente.
 * @param {string|null} bg Cor do fundo.
 * @param {number} [min=4.5] Razão mínima.
 * @returns {void}
 */
export function assertRatio(label, fg, bg, min = 4.5) {
  if (!fg || !bg) throw new Error(`${label}: cor não resolveu (frente ${fg}, fundo ${bg})`);
  const ratio = contrast(fg, bg);
  if (ratio < min) throw new Error(`${label}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}:1 (< ${min}:1)`);
}

/** Especificidade de um seletor: ids, classes/atributos/pseudo-classes e elementos (`:where` vale 0). */
function specificity(selector) {
  const s = selector.replace(/:where\([^)]*\)/g, "").replace(/:(?:is|not|has)\(([^)]*)\)/g, " $1 ");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:[a-z-]+/g) || []).length;
  const elements = (s.replace(/\[[^\]]*\]/g, "").match(/(?:^|[\s>+~])[a-z][\w-]*/g) || []).length;
  return ids * 10000 + classes * 100 + elements;
}

const SIMPLE = /#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[a-z-]+/g;

/**
 * O seletor `listed` atinge o mesmo elemento, no mesmo estado, que `target`: o último pedaço dele traz tudo o que
 * `target` pede (id, classes, atributos e pseudo-classes; `:not(...)` é ignorado) e nenhuma pseudo-classe de estado
 * (`:hover`, `:active`…) que `target` não peça.
 */
function reaches(listed, target) {
  const last = listed.split(/[\s>+~]+/).pop().replace(/:not\([^)]*\)/g, "");
  const needles = target.match(SIMPLE) || [];
  const parts = last.match(SIMPLE) || [];
  const estados = parts.filter((p) => p.startsWith(":"));
  return needles.length > 0 && needles.every((n) => parts.includes(n)) && estados.every((p) => needles.includes(p));
}

/**
 * Valor de `prop` que vence para `selector` (um pedaço único, como `.dungeon-btn-primary` ou
 * `.dungeon-btn[disabled]`): entre as regras que atingem o mesmo elemento, a de maior especificidade e, no empate, a
 * que vem por último na ordem das folhas. Regras dentro de `@media` não entram.
 * Aproximação de um seletor simples: ignora ancestral, classe de variante e estado. Para o elemento inteiro com os
 * ancestrais (a cascata de verdade), use `cascade` de `css-cascata.js`.
 * @param {string} selector Seletor do elemento.
 * @param {string} prop Propriedade CSS.
 * @param {string[]} [files] Folhas na ordem de carga (padrão: `agora.css` e as `sv-*.css`).
 * @returns {string|null} Valor declarado, ou `null`.
 */
export function renderedDecl(selector, prop, files = ["agora.css", ...SV_SHEETS]) {
  let best = { spec: -1, value: null };
  for (const file of files) {
    for (const blk of blocks(readSheet(file))) {
      for (const listed of blk.selector.split(",").map((s) => s.trim())) {
        const m = reaches(listed, selector) && blk.body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
        const spec = m ? specificity(listed) : -1;
        if (m && spec >= best.spec) best = { spec, value: m[1].trim() };
      }
    }
  }
  return best.value;
}
