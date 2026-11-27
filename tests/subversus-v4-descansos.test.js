/**
 * @file Descansos da ficha em `<details>` fechado (V1b da UI v4): Dados de Vida e descansos dentro da sanfona, os
 * botões com `data-dungeon` intactos, estado aberto guardado por `data-dungeon-details`, folha `sv-ficha.css` dentro do
 * contrato (44 px, foco visível, tokens) e a prova de que o resto da faixa segue byte a byte igual ao de antes.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";
import * as css from "./helpers/css-contrato.js";

const SHEET = "sv-ficha.css";
const OLD_GOLDEN = "d99b75c71813aa2c29c82c81b2fdf7d9aa01e619ef706c3423b7af6ac5e1f85d";
const sheet = () => ({ character_id: "a", system: { id: "dnd5e-2024", version: 1 }, attributes_lww: { level: 5, armor_class: 16, abilities: { dex: 14, wis: 12 } }, pools_base: { hp_max: 24, hp_current: 18 }, inventory_orset: {} });
const DETAILS = /<details class="sv-rest-details"[^>]*>[\s\S]*?<\/details>/;

const strip = () => renderDerivedStrip(sheet(), 18);
const sheetCss = () => css.readCss(SHEET);

test("os descansos ficam num <details> fechado, com resumo 'Descansos' e a contagem de Dados de Vida", () => {
  const html = strip();
  const bloco = DETAILS.exec(html)?.[0];
  assert.ok(bloco, "há <details class=\"sv-rest-details\">");
  assert.match(bloco.slice(0, bloco.indexOf(">") + 1), /data-dungeon-details="sheet-rest"/);
  assert.doesNotMatch(bloco.slice(0, bloco.indexOf(">") + 1), /\sopen[\s>]/, "fechado por padrão");
  assert.match(bloco, /<summary>Descansos <span class="sv-rest-hint">\(Dados de Vida \d+\/\d+\)<\/span><\/summary>/);
});

test("os 3 botões de descanso e o grupo 'Descansos' ficam dentro do <details>, com os mesmos data-dungeon", () => {
  const html = strip();
  const bloco = DETAILS.exec(html)?.[0] || "";
  for (const acao of ["hit-die", "rest-short", "rest-long"]) {
    assert.equal((bloco.match(new RegExp(`data-dungeon="${acao}"`, "g")) || []).length, 1, `${acao} dentro do <details>`);
    assert.equal((html.match(new RegExp(`data-dungeon="${acao}"`, "g")) || []).length, 1, `${acao} só uma vez na faixa`);
  }
  assert.match(bloco, /<div class="dungeon-rests" role="group" aria-label="Descansos">/);
});

test("condições e Exaustão continuam fora da sanfona, visíveis sem abrir nada", () => {
  const html = strip();
  const fora = html.replace(DETAILS, "");
  assert.match(fora, /data-dungeon="condition-toggle"/);
  assert.match(fora, /data-dungeon="exhaustion-step"/);
  assert.doesNotMatch(fora, /data-dungeon="rest-(short|long)"|data-dungeon="hit-die"/);
});

test("tirando só o invólucro da sanfona, a faixa volta ao hash de antes (nada mais mudou)", () => {
  const html = strip();
  const desembrulhado = html.replace(DETAILS, (bloco) => {
    const linhas = bloco.split("\n").slice(2, -1);
    return linhas.map((l) => l.replace(/^ {2}/, "")).join("\n").trimStart();
  });
  assert.equal(createHash("sha256").update(desembrulhado).digest("hex"), OLD_GOLDEN);
});

test("sv-ficha.css: sem !important, tokens do tema, resumo e botões de 44 px, foco visível e chevron", () => {
  const text = sheetCss();
  css.assertNoImportant(text, SHEET);
  css.assertVarsDefined(text, SHEET);
  for (const selector of [".sv-rest-details > summary", ".sv-rest-details .dungeon-chip-btn"]) css.assertMinTarget(text, selector, 44);
  const corpo = text.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(corpo, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|outline\s*:\s*(none|0)\b/i);
  assert.match(css.ruleBody(text, ".sv-rest-details > summary:focus-visible"), /outline:\s*2px solid var\(--sa-primary\)/);
  assert.match(css.ruleBody(text, ".sv-rest-details > summary::before"), /border-(right|bottom):\s*2px solid var\(--sa-/);
  assert.match(css.ruleBody(text, ".sv-rest-details[open] > summary::before"), /rotate\(45deg\)/);
});

test("contraste AA nos dois temas: resumo e contagem sobre o fundo da ficha", () => {
  const text = sheetCss();
  const cor = (selector, t) => css.resolveVar(/(?:^|;)\s*color:\s*([^;]+)/.exec(css.ruleBody(text, selector))?.[1], t);
  for (const mode of ["dark", "light"]) {
    const t = css.readSaTokens(mode);
    const fundo = css.resolveVar("var(--sa-surface)", t);
    const resumo = cor(".sv-rest-details > summary", t);
    const dica = cor(".sv-rest-details .sv-rest-hint", t);
    assert.ok(fundo && resumo && dica, `${mode}: cores resolvem`);
    assert.ok(css.contrastRatio(resumo, fundo) >= 4.5, `${mode}: resumo ${css.contrastRatio(resumo, fundo).toFixed(2)}`);
    assert.ok(css.contrastRatio(dica, fundo) >= 4.5, `${mode}: contagem ${css.contrastRatio(dica, fundo).toFixed(2)}`);
  }
});

test("a folha sv-ficha.css está registrada no carregador sob demanda", () => {
  assert.ok(SV_SHEETS.some((s) => s.href === `css/${SHEET}` && s.id === "sv-ficha-stylesheet"), "SV_SHEETS lista sv-ficha.css");
});
