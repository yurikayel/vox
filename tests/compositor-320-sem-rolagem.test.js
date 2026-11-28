/**
 * @file Compositor aberto a 320 px: o rodapé (ferramentas + contador + Ecoar + Postar) quebra de linha em vez de
 * estourar a largura (scrollWidth 464 antes do conserto), sem esconder ação e com alvo de toque de 44 px.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as css from "./helpers/css-contrato.js";

const SHEET = css.readCss("style.css");

/** Texto do bloco `@media` que começa na linha de comentário com a marca `F39`, até a chave que o fecha. */
function f39Block() {
  const start = SHEET.indexOf("/* F39");
  assert.ok(start >= 0, "bloco F39 existe");
  const open = SHEET.indexOf("{", start);
  assert.match(SHEET.slice(start, open), /@media \(max-width: 30em\)\s*$/, "vale a ≤30em, só por largura, e acompanha a fonte");
  let depth = 0;
  for (let i = open; i < SHEET.length; i++) {
    depth += SHEET[i] === "{" ? 1 : SHEET[i] === "}" ? -1 : 0;
    if (!depth) return SHEET.slice(open, i + 1);
  }
  return "";
}

test("a ≤30em a barra, as ferramentas e as ações do compositor quebram de linha", () => {
  const block = f39Block();
  for (const sel of [".inline-composer-toolbar", ".inline-composer-tools", ".inline-composer-actions"]) {
    assert.match(css.ruleBody(block, sel), /flex-wrap:\s*wrap/, `${sel} quebra`);
  }
  assert.match(css.ruleBody(block, ".inline-composer-actions"), /flex:\s*1 1 100%/, "as ações ocupam a própria linha");
  assert.match(css.ruleBody(block, ".inline-composer-actions"), /min-width:\s*0/);
});

test("nenhuma ação é escondida a 320 px e Ecoar e Postar mantêm 44 px de alvo", () => {
  const block = f39Block();
  assert.doesNotMatch(block, /display:\s*none|visibility:\s*hidden/, "o conserto não esconde ação");
  for (const sel of [".btn-inline-submit", ".btn-inline-echo"]) {
    assert.match(css.ruleBody(SHEET, sel), /min-height:\s*44px/, `${sel} 44px`);
  }
});
