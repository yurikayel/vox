/**
 * @file Caixa de DM sem transbordo no celular: `.dm-inbox-item` é filho flex de `.dm-inbox-row` dentro de uma lista com
 * `overflow: hidden`. Sem `min-width: 0` no item, a prévia em uma linha (`white-space: nowrap`) fixa o tamanho mínimo do
 * item em ~1700 px e o conteúdo some cortado (medido em Chromium a 320 px). Usa a cascata de
 * `helpers/css-cascata.js` (ancestral, especificidade e ordem das folhas) e confere o `min-width` que vence e que a
 * prévia continua com reticências.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { buildChain, cascade } from "./helpers/css-cascata.js";

const ROW = "html > body > div.app-layout.agora-ui > div.dm-inbox-row";

/** Declaração que vence para `prop` no elemento `tail` dentro da linha da caixa de DM (ancestrais e especificidade contam). */
function winner(tail, prop) {
  return cascade(buildChain(`${ROW} > ${tail}`), [prop]);
}

/** `0`, `0px` e `0 !important` são o mesmo mínimo: zero. */
const isZero = (v) => /^0(?:px)?(?:\s*!important)?$/.test(String(v).trim());

test("a cascata acha o item da caixa de DM (a leitura tem o que ler)", () => {
  assert.ok(winner("div.dm-inbox-item", "min-width"), "nenhuma regra de min-width alcança .dm-inbox-item");
});

test("o item da caixa de DM encolhe (min-width: 0) em vez de seguir a prévia em uma linha", () => {
  const w = winner("div.dm-inbox-item", "min-width");
  assert.ok(isZero(w?.value), `min-width que vence: ${w?.value} (${w?.selector})`);
});

test("a prévia da DM continua em uma linha com reticências (o corte é o desenho, não um acidente)", () => {
  assert.equal(winner("div.dm-inbox-item > span.dm-inbox-preview", "white-space")?.value, "nowrap");
  assert.equal(winner("div.dm-inbox-item > span.dm-inbox-preview", "text-overflow")?.value, "ellipsis");
});
