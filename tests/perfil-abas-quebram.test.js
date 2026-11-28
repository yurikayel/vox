/**
 * @file As abas do perfil (`.profile-grid-tabs`) quebram de linha quando não cabem, em vez de alargar a página
 * (WCAG 1.4.4 e 1.4.10). Cada aba é `flex: 1` e o texto em caixa alta cresce com a fonte padrão do navegador; sem
 * `flex-wrap`, a 320 px com fonte de 20 px a barra passava da tela em 35 px. Sem navegador: lê a regra das folhas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readCss, ruleBody } from "./helpers/css-contrato.js";

/** Última declaração da propriedade, na ordem em que as folhas são carregadas (style.css, agora.css). */
function valor(selector, prop) {
  const decls = ["style.css", "agora.css"].flatMap((f) => ruleBody(readCss(f), selector).split(";"));
  const hit = decls.map((d) => d.trim()).filter((d) => d.startsWith(`${prop}:`)).pop();
  return hit ? hit.slice(prop.length + 1).trim() : null;
}

test("a barra de abas do perfil é flex com quebra de linha", () => {
  assert.equal(valor(".profile-grid-tabs", "display"), "flex");
  assert.equal(valor(".profile-grid-tabs", "flex-wrap"), "wrap", "sem wrap as 5 abas alargam a página com a fonte maior");
});

test("nenhuma aba trava a largura nem proíbe quebra, o que anularia o wrap", () => {
  assert.notEqual(valor(".profile-grid-tab", "white-space"), "nowrap");
  assert.equal(valor(".profile-grid-tab", "min-width"), null);
  assert.equal(valor(".profile-grid-tab", "flex"), "1", "cada aba continua dividindo a linha por igual");
});
