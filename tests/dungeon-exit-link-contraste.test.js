/**
 * @file Contraste do link "Sair do Subversus · Voltar ao Vox" (`a.dungeon-exit-link`) sobre a faixa do Santuário
 * (`.dungeon-segregation-strip`). A faixa é escura nos dois temas (`#14181e`), mas o link e o contorno de foco usavam
 * `--sa-primary`, que no tema claro é o teal escuro `#006a65`: 2,76:1 sobre a faixa (mínimo 3:1 para o contorno de foco,
 * WCAG 2.4.11/1.4.11, e 4,5:1 para o texto). Mede a cascata de verdade (`helpers/css-cascata.js`: especificidade, ordem
 * das folhas, estado `:focus-visible` e ancestrais) e os tokens de cada tema (`helpers/css-tema.js`), nos quatro
 * caminhos de tema (atributo `data-color-mode` e `@media (prefers-color-scheme)`), resolvendo também a variável que a
 * própria faixa redefine.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChain, cascade } from "./helpers/css-cascata.js";
import { contrast, hexOf, resolveTheme } from "./helpers/css-tema.js";

const STRIP = "html > body > div.dungeon-sanctum > div.dungeon-segregation-strip";
const LINK = `${STRIP} > a.dungeon-exit-link`;
const ROUTES = [
  ["dark", "attr"],
  ["dark", "media"],
  ["light", "attr"],
  ["light", "media"],
];
const COLOR = /var\(--[a-z0-9-]+(?:\s*,[^)]*)?\)|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i;

/** `#rgb` vira `#rrggbb` (o `hexOf` compartilhado só lê 6 dígitos). */
const full = (v) => (/^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v);

/** Valor do que a cascata dá a `props` no elemento em `path` (com `states`), ou `null`. */
const winner = (path, props, states = []) => cascade(buildChain(path, states), props)?.value ?? null;

/** Falha por `assert` se `fg` sobre `bg` não chega a `min`:1 (sem o `assertRatio`, que ainda lança `Error`). */
function assertContrast(label, fg, bg, min) {
  assert.ok(fg && bg, `${label}: cor não resolveu (frente ${fg}, fundo ${bg})`);
  const ratio = contrast(fg, bg);
  assert.ok(ratio >= min, `${label}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}:1 (< ${min}:1)`);
}

/**
 * Cor `#rrggbb` de um valor do elemento `path`: se for `var(--x)`, procura `--x` declarada nos ancestrais (de baixo
 * para cima, sem a raiz) e só então nos tokens do tema, como o navegador herda variável.
 */
function resolveColor(raw, path, tokens) {
  const color = raw?.match(COLOR)?.[0];
  const name = color?.match(/^var\(\s*(--[a-z0-9-]+)/i)?.[1];
  if (!name) return color ? hexOf(tokens, full(color)) : null;
  const steps = path.split(/\s*>\s*/);
  for (let end = steps.length; end > 2; end -= 1) {
    const own = winner(steps.slice(0, end).join(" > "), [name]);
    if (own) return resolveColor(own, steps.slice(0, end - 1).join(" > "), tokens);
  }
  return hexOf(tokens, color);
}

describe("link de saída do Subversus sobre a faixa escura do Santuário", () => {
  for (const [theme, route] of ROUTES) {
    const where = route === "attr" ? "atributo data-color-mode" : "@media prefers-color-scheme (automático)";
    it(`tema ${theme} (${where}): contorno de foco do link com pelo menos 3:1 sobre a faixa`, () => {
      const tokens = resolveTheme(theme, route);
      const outline = winner(LINK, ["outline", "outline-color"], ["focus-visible"]);
      assert.ok(outline, "a cascata não achou contorno no :focus-visible");
      const bg = resolveColor(winner(STRIP, ["background", "background-color"]), STRIP, tokens);
      assertContrast(`${theme}/${route}: contorno (${outline})`, resolveColor(outline, LINK, tokens), bg, 3);
    });
    it(`tema ${theme} (${where}): texto do link com pelo menos 4,5:1 sobre a faixa`, () => {
      const tokens = resolveTheme(theme, route);
      const fg = resolveColor(winner(LINK, ["color"]), LINK, tokens);
      const bg = resolveColor(winner(STRIP, ["background", "background-color"]), STRIP, tokens);
      assertContrast(`${theme}/${route}: texto do link`, fg, bg, 4.5);
    });
  }
  it("a faixa continua sendo escura nos dois temas (o teste mede contra o fundo que a página pinta)", () => {
    for (const [theme, route] of ROUTES) {
      const bg = resolveColor(winner(STRIP, ["background", "background-color"]), STRIP, resolveTheme(theme, route));
      assert.equal(bg, "#14181e");
    }
  });
});
