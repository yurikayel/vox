/**
 * @file Base da UI v4 (F0): folhas `sv-*.css` existem, sem `!important`, e a catraca impede as folhas legadas de crescer.
 * Também prova o helper de contrato de CSS (contraste, alvo de 44 px, `!important`, tokens `--sa-*`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const helper = await import("./helpers/css-contrato.js").catch(() => null);
const SV_SHEETS = ["sv-estados.css", "sv-camp.css", "sv-mesa.css", "sv-ficha.css", "sv-mochila.css"];
const cssUrl = (name) => new URL(`../client/css/${name}`, import.meta.url);
const lines = (name) => readFileSync(cssUrl(name), "utf8").split("\n").length - 1;

test("cada folha sv-*.css existe, abre com o cabeçalho @file e não usa !important", () => {
  assert.ok(helper, "tests/helpers/css-contrato.js existe");
  for (const name of SV_SHEETS) {
    assert.ok(existsSync(cssUrl(name)), `${name} existe`);
    const css = helper.readCss(name);
    assert.match(css, /^\/\*\s*@file /, `${name}: cabeçalho @file`);
    helper.assertNoImportant(css, name);
  }
});

test("catraca: as folhas legadas não crescem em linhas nem em !important", () => {
  assert.ok(helper, "helper existe");
  assert.ok(lines("agora.css") <= 4658, `agora.css ${lines("agora.css")} linhas (teto 4658)`);
  assert.ok(helper.countImportant(helper.readCss("agora.css")) <= 42, "agora.css: teto de 42 !important");
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

test("helper: ruleBody, assertMinTarget e assertNoImportant reprovam o que deve reprovar", () => {
  assert.ok(helper, "helper existe");
  const css = ".a, .b { min-height: 44px; color: red } @media (min-width: 1px) { .c { min-height: 2.75rem; min-width: 40px } } .d { min-height: 40px }";
  assert.match(helper.ruleBody(css, ".b"), /min-height: 44px/);
  assert.doesNotThrow(() => helper.assertMinTarget(css, ".a"));
  assert.throws(() => helper.assertMinTarget(css, ".d"), /40px/);
  assert.throws(() => helper.assertMinTarget(css, ".c"), /min-width/);
  assert.throws(() => helper.assertMinTarget(css, ".nope"), /sem min-height/);
  assert.equal(helper.countImportant("/* !important */ .x { color: red !important }"), 1, "comentário não conta");
  assert.throws(() => helper.assertNoImportant(".x { color: red !important }"));
});
