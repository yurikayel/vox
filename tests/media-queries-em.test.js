/**
 * @file Pontos de quebra em `em`, não em px (WCAG 1.4.4/1.4.10): a media query de largura em px não acompanha a fonte
 * padrão do navegador; em `em` ela acompanha (1em = fonte padrão, 16 px por omissão), então com 16 px o layout é o
 * mesmo e com a fonte maior a quebra vem antes, em vez de a página rolar de lado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as css from "./helpers/css-contrato.js";

const SHEET = css.readCss("style.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** Exceções que ficam em px, cada uma com o motivo. Vazia: nenhuma query de `style.css` precisa de px. */
const EXCECOES_PX = new Map();

const COND = /\(\s*((?:min|max)-(?:device-)?(?:width|height))\s*:\s*([\d.]+)(px|em|rem)\s*\)/g;

/** Condições de dimensão de cada `@media` da folha: `{ feature, value, unit }`. */
function condicoes() {
  const out = [];
  for (const m of SHEET.matchAll(/@media([^{]*)\{/g)) {
    for (const c of m[1].matchAll(COND)) out.push({ prelude: m[1].trim(), feature: c[1], value: Number(c[2]), unit: c[3] });
  }
  return out;
}

test("nenhum @media de largura ou altura de style.css usa px (fora das exceções listadas)", () => {
  const emPx = condicoes().filter((c) => c.unit === "px" && !EXCECOES_PX.has(`${c.feature}: ${c.value}px`));
  assert.deepEqual(emPx.map((c) => `${c.feature}: ${c.value}px`), [], "cada ponto de quebra em px vira em (px/16)");
  for (const [chave, motivo] of EXCECOES_PX) assert.ok(motivo.length > 20, `a exceção ${chave} diz o motivo`);
});

test("a conversão é exata (px/16): com a fonte padrão de 16 px o layout não muda", () => {
  const por = new Map();
  for (const c of condicoes()) por.set(`${c.feature}: ${c.value}${c.unit}`, (por.get(`${c.feature}: ${c.value}${c.unit}`) ?? 0) + 1);
  const esperado = new Map([
    ["max-width: 30em", 3], // era 480px
    ["max-width: 32.5em", 1], // era 520px
    ["min-width: 32.5em", 1],
    ["max-width: 42.5em", 1], // era 680px
    ["max-width: 47.9375em", 5], // era 767px
    ["min-width: 48em", 5], // era 768px
    ["max-width: 51.25em", 1], // era 820px
  ]);
  for (const [chave, n] of esperado) assert.equal(por.get(chave) ?? 0, n, `${chave} aparece ${n}x`);
});
