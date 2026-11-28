/**
 * @file Contraste do selo "DEMONSTRAÇÃO · ROTEIRO FIXO…" (`.dungeon-fiction-badge`) sobre a faixa do Santuário
 * (`.dungeon-segregation-strip`). A faixa é escura nos dois temas (`#14181e`) e o selo traz 12% de dourado atrás do texto,
 * mas o texto usava `--sa-secondary`, que no tema claro é o dourado escuro `#7a5c00`: 2,24:1 sobre o fundo do selo (mínimo
 * 4,5:1 para texto, WCAG 1.4.3). A razão sai de `contrast` e a falha é por `assert`, sem depender do `assertRatio`. Mede a cascata de verdade (`helpers/css-cascata.js`: especificidade, ordem das folhas, ancestrais) e os
 * tokens de cada tema (`helpers/css-tema.js`), nos quatro caminhos de tema (atributo `data-color-mode` e
 * `@media (prefers-color-scheme)`), resolvendo também a variável que a própria faixa define e misturando o fundo
 * translúcido do selo sobre a faixa.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChain, cascade } from "./helpers/css-cascata.js";
import { contrast, hexOf, resolveTheme } from "./helpers/css-tema.js";

const STRIP = "html > body > div.dungeon-sanctum > div.dungeon-segregation-strip";
const BADGE = `${STRIP} > span.dungeon-fiction-badge`;
const ROUTES = [
  ["dark", "attr"],
  ["dark", "media"],
  ["light", "attr"],
  ["light", "media"],
];
const COLOR = /var\(--[a-z0-9-]+(?:\s*,[^)]*)?\)|#[0-9a-f]{6}\b/i;
const RGBA = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i;

/** Valor que a cascata dá a `props` no elemento em `path`, ou `null`. */
const winner = (path, props) => cascade(buildChain(path), props)?.value ?? null;

/**
 * Cor `#rrggbb` de um valor do elemento `path`: se for `var(--x)`, procura `--x` nos ancestrais (de baixo para cima,
 * sem a raiz) e só então nos tokens do tema, como o navegador herda variável.
 */
function resolveColor(raw, path, tokens) {
  const color = raw?.match(COLOR)?.[0];
  const name = color?.match(/^var\(\s*(--[a-z0-9-]+)/i)?.[1];
  if (!name) return color ? hexOf(tokens, color) : null;
  const steps = path.split(/\s*>\s*/);
  for (let end = steps.length; end > 2; end -= 1) {
    const own = winner(steps.slice(0, end).join(" > "), [name]);
    if (own) return resolveColor(own, steps.slice(0, end - 1).join(" > "), tokens);
  }
  return hexOf(tokens, color);
}

/** Mistura `rgba(r, g, b, a)` sobre o fundo opaco `#rrggbb`. */
function blend(rgba, under) {
  const [, r, g, b, a] = rgba.match(RGBA).map(Number);
  const base = [1, 3, 5].map((i) => parseInt(under.slice(i, i + 2), 16));
  const mixed = [r, g, b].map((c, i) => Math.round(c * a + base[i] * (1 - a)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Fundo que o texto do selo enxerga: o translúcido do selo sobre a faixa. */
function badgeBackground(tokens) {
  const strip = resolveColor(winner(STRIP, ["background", "background-color"]), STRIP, tokens);
  const own = winner(BADGE, ["background", "background-color"]);
  return own && RGBA.test(own) ? blend(own, strip) : resolveColor(own, BADGE, tokens) ?? strip;
}

describe("selo de demonstração sobre a faixa escura do Santuário", () => {
  for (const [theme, route] of ROUTES) {
    const where = route === "attr" ? "atributo data-color-mode" : "@media prefers-color-scheme (automático)";
    it(`tema ${theme} (${where}): texto do selo com pelo menos 4,5:1 sobre o fundo dele`, () => {
      const tokens = resolveTheme(theme, route);
      const fg = resolveColor(winner(BADGE, ["color"]), BADGE, tokens);
      const bg = badgeBackground(tokens);
      assert.ok(fg && bg, `${theme}/${route}: cor não resolveu (frente ${fg}, fundo ${bg})`);
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${theme}/${route}: texto do selo ${fg} sobre ${bg} = ${ratio.toFixed(2)}:1 (< 4.5:1)`);
    });
  }
  it("a faixa continua escura nos dois temas e o selo tem fundo translúcido (o teste mede o que a página pinta)", () => {
    for (const [theme, route] of ROUTES) {
      const tokens = resolveTheme(theme, route);
      assert.equal(resolveColor(winner(STRIP, ["background", "background-color"]), STRIP, tokens), "#14181e");
      assert.match(winner(BADGE, ["background", "background-color"]) ?? "", RGBA, "o fundo do selo é rgba(...)");
    }
  });
});
