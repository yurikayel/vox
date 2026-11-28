/**
 * @file Largura do painel "Rolagens" do Escudo (SUB-23/SUB-33): com a flag de selo ligada a tabela ganha a coluna
 * "Conferida" e passa de 254 para 337 px; sem rolagem própria a página inteira rola de lado a 320 e 360 px. A tabela
 * (`.sv-rolls-table`) fica dentro de `.sv-rolls-panels`, e é esse contêiner que precisa rolar na horizontal. Mede a
 * cascata de verdade (`helpers/css-cascata.js`: especificidade e ordem das folhas), não só o texto do arquivo.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChain, cascade } from "./helpers/css-cascata.js";

const PANELS = "html > body > section.sv-rolls > div.sv-rolls-tabs > div.sv-rolls-panels";
const PANEL = `${PANELS} > div.sv-rolls-panel.is-todas`;
const TABLE = `${PANEL} > table.sv-rolls-table`;

/** Valor que a cascata dá a `prop` no elemento em `path`, ou `null`. */
const winner = (path, prop) => cascade(buildChain(path), [prop])?.value ?? null;

describe("painel Rolagens: a tabela larga rola dentro do painel, não a página", () => {
  it("o contêiner das abas rola na horizontal (overflow-x: auto ou scroll)", () => {
    const value = winner(PANELS, "overflow-x");
    assert.ok(value && /^(auto|scroll)$/.test(value.trim()), `overflow-x em .sv-rolls-panels = ${value} (esperado auto ou scroll)`);
  });

  it("o contêiner não corta o conteúdo (overflow-x não é hidden nem clip)", () => {
    const value = winner(PANELS, "overflow-x");
    assert.ok(value, "sem regra de overflow-x em .sv-rolls-panels: a tabela empurra a página");
    assert.doesNotMatch(value, /hidden|clip/, `overflow-x = ${value} esconderia a coluna Conferida`);
  });

  it("a tabela segue com largura própria, sem encolher abaixo do conteúdo", () => {
    assert.notEqual(winner(TABLE, "table-layout"), "fixed", "table-layout: fixed comprimiria as colunas em vez de rolar");
    assert.notEqual(winner(TABLE, "overflow-x"), "hidden");
  });
});
