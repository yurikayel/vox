/**
 * @file Base da UI v4 (F0): toda folha `sv-*.css` da lista do carregador existe, abre com `@file`, sem `!important` e só com
 * `var()` do tema; o carregador a injeta uma vez; a catraca impede as folhas legadas de crescer.
 * Também prova o helper de contrato de CSS (contraste, alvo de 44 px, `!important`, tokens `--sa-*`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as loader from "../client/js/dungeon/dungeon-layout-style.js";

const helper = await import("./helpers/css-contrato.js").catch(() => null);
const cssUrl = (name) => new URL(`../client/css/${name}`, import.meta.url);
const lines = (name) => readFileSync(cssUrl(name), "utf8").split("\n").length - 1;

function fakeDoc() {
  const links = new Map();
  const appended = [];
  return {
    links,
    appended,
    head: { appendChild: (el) => { appended.push(el.id); links.set(el.id, el); } },
    getElementById: (id) => links.get(id) ?? null,
    createElement: () => ({ id: "", rel: "", href: "" }),
  };
}

test("o carregador exporta SV_SHEETS e cada folha dela existe, tem @file, sem !important e só var() do tema", () => {
  assert.ok(helper, "tests/helpers/css-contrato.js existe");
  assert.ok(Array.isArray(loader.SV_SHEETS), "o carregador exporta SV_SHEETS");
  assert.equal(new Set(loader.SV_SHEETS.map((s) => s.id)).size, loader.SV_SHEETS.length, "ids de <link> únicos");
  for (const { href } of loader.SV_SHEETS) {
    const name = href.replace(/^css\//, "");
    assert.match(name, /^sv-[\w-]+\.css$/, `${href}: nome sv-*.css`);
    assert.ok(existsSync(cssUrl(name)), `${name} existe`);
    const css = helper.readCss(name);
    assert.match(css, /^\/\*\s*@file /, `${name}: cabeçalho @file`);
    helper.assertNoImportant(css, name);
    helper.assertVarsDefined(css, name);
  }
});

test("carregador: ensureSvSheets linka cada folha uma única vez; a 2ª chamada não injeta nada", () => {
  assert.equal(typeof loader.ensureSvSheets, "function", "ensureSvSheets existe");
  const sheets = [{ id: "sv-a-stylesheet", href: "css/sv-a.css" }, { id: "sv-b-stylesheet", href: "css/sv-b.css" }];
  const doc = fakeDoc();
  loader.ensureSvSheets(doc, sheets);
  assert.deepEqual(doc.appended, ["sv-a-stylesheet", "sv-b-stylesheet"], "1ª chamada injeta cada folha");
  loader.ensureSvSheets(doc, sheets);
  assert.deepEqual(doc.appended, ["sv-a-stylesheet", "sv-b-stylesheet"], "2ª chamada não injeta nada");
  assert.deepEqual([...doc.links.values()].map((l) => [l.id, l.rel, l.href]), sheets.map((s) => [s.id, "stylesheet", s.href]));
  const one = fakeDoc();
  loader.ensureSvSheets(one, sheets.slice(0, 1));
  loader.ensureSvSheets(one, sheets.slice(0, 1));
  assert.equal(one.appended.length, 1, "lista de 1 folha: a 2ª chamada não injeta");
  loader.ensureSvSheets({ createElement: () => assert.fail("sem head não cria link") }, sheets);
});

test("carregador: ensureDungeonLayoutStyles liga o layout e chama ensureSvSheets; lista vazia não injeta folha sv-*", () => {
  const empty = fakeDoc();
  loader.ensureDungeonLayoutStyles(empty, []);
  assert.deepEqual(empty.appended, ["dungeon-layout-stylesheet"], "lista vazia: só o layout, nenhum <link> sv-*");
  const sheets = [{ id: "sv-a-stylesheet", href: "css/sv-a.css" }];
  const doc = fakeDoc();
  loader.ensureDungeonLayoutStyles(doc, sheets);
  loader.ensureDungeonLayoutStyles(doc, sheets);
  assert.deepEqual(doc.appended, ["dungeon-layout-stylesheet", "sv-a-stylesheet"], "layout, depois a folha da lista, uma vez cada");
  const padrao = fakeDoc();
  loader.ensureDungeonLayoutStyles(padrao);
  assert.deepEqual(padrao.appended, ["dungeon-layout-stylesheet", ...loader.SV_SHEETS.map((s) => s.id)], "o padrão usa SV_SHEETS");
});

test("catraca: as folhas legadas não crescem em linhas nem em !important", () => {
  assert.ok(helper, "helper existe");
  assert.ok(lines("agora.css") <= 4658, `agora.css ${lines("agora.css")} linhas (teto 4658)`);
  assert.ok(helper.countImportant(helper.readCss("agora.css")) <= 41, "agora.css: teto de 41 !important");
  assert.ok(lines("dungeon-layout.css") <= 368, `dungeon-layout.css ${lines("dungeon-layout.css")} linhas (teto 368)`);
  assert.ok(helper.countImportant(helper.readCss("dungeon-layout.css")) <= 4, "dungeon-layout.css: teto de 4 !important");
});

test("helper: tokens --sa-* por tema, resolveVar e contraste batem com valores conhecidos", () => {
  assert.ok(helper, "helper existe");
  const dark = helper.readSaTokens("dark");
  const light = helper.readSaTokens("light");
  assert.equal(dark.get("--sa-surface"), "#111316");
  assert.equal(light.get("--sa-surface"), "#f3f1ec", "o bloco do tema claro sobrescreve o base");
  assert.equal(helper.resolveVar("var(--sa-on-surface)", dark), "#e2e2e6");
  assert.equal(helper.resolveVar("var(--nao-existe, #abc)", dark), "#aabbcc", "fallback");
  assert.equal(helper.resolveVar("rgb(0,0,0)", dark), null, "cor literal que não é hex não resolve");
  assert.equal(Math.round(helper.contrastRatio("#000000", "#ffffff")), 21);
  assert.ok(helper.contrastRatio(helper.resolveVar("var(--sa-on-surface)", dark), helper.resolveVar("var(--sa-surface)", dark)) >= 4.5);
});

test("helper: assertVarsDefined aceita token do tema e reprova variável indefinida, mesmo com fallback", () => {
  assert.ok(helper, "helper existe");
  assert.doesNotThrow(() => helper.assertVarsDefined(".a { color: var(--sa-on-surface); background: var(--surface-1) }"));
  assert.throws(() => helper.assertVarsDefined(".a { color: var(--dungeon-surface, #123456) }"), /sem definição no tema/);
  assert.doesNotThrow(() => helper.assertVarsDefined("/* var(--nao-existe) */ .a { color: red }"));
});

test("helper: ruleBody, assertMinTarget e assertNoImportant reprovam o que deve reprovar", () => {
  assert.ok(helper, "helper existe");
  const css = ".a, .b { min-height: 44px; min-width: 44px; color: red } @media (min-width: 1px) { .c { min-height: 2.75rem; min-width: 40px } } .d { min-height: 40px }";
  assert.match(helper.ruleBody(css, ".b"), /min-height: 44px/);
  assert.doesNotThrow(() => helper.assertMinTarget(css, ".a"));
  assert.throws(() => helper.assertMinTarget(css, ".d"), /min-height 40px/);
  assert.throws(() => helper.assertMinTarget(css, ".c"), /min-width 40px/);
  assert.throws(() => helper.assertMinTarget(css, ".nope"), /sem min-height/);
  assert.equal(helper.countImportant("/* !important */ .x { color: red !important }"), 1, "comentário não conta");
  assert.throws(() => helper.assertNoImportant(".x { color: red !important }"));
});
