/**
 * @file Barra de feeds da Ágora (PR2 da UI v4): 2 segmentos como links com `aria-current`, Filtro em `<details>` fechado
 * com as 3 chaves restantes, chip que volta ao Social, rótulo "Redes externas" na barra e na sidebar, e a folha
 * `sv-agora.css` dentro do contrato (tokens, 44 px, AA nos dois temas, foco visível) ligada no `index.html`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { renderFeedTabsBar } from "../client/js/render/feed-chrome.js";
import { renderFeedNav } from "../client/js/render/shell-nav.js";
import * as css from "./helpers/css-contrato.js";

const SHEET = "sv-agora.css";
const FEEDS = ["for-you", "civic", "following", "external", "all"];
const HREF = { "for-you": "#/", civic: "#/?feed=civic", following: "#/?feed=following", external: "#/?feed=external", all: "#/?feed=all" };
const GLOSSARIO = /ledger|imutável|\bnó #|SIG:|ponta a ponta|garantia criptográfica/i;

const count = (html, re) => (html.match(re) || []).length;
const sheetCss = () => {
  assert.ok(existsSync(new URL(`../client/css/${SHEET}`, import.meta.url)), `${SHEET} existe`);
  return css.readCss(SHEET);
};

test("a barra tem 2 segmentos como links, sem role=tab nem aria-selected", () => {
  for (const feed of FEEDS) {
    const html = renderFeedTabsBar(feed);
    assert.equal(count(html, /class="sv-seg-btn"/g), 2, `${feed}: 2 segmentos`);
    assert.doesNotMatch(html, /role="tab|aria-selected|feed-tab-chip/, `${feed}: sem tablist antiga`);
    assert.match(html, /<nav class="sv-feedbar" aria-label="Feeds">/);
  }
});

test("Social e Cívico levam aria-current no ativo; com filtro ativo nenhum segmento leva, e no total há no máximo 1", () => {
  const segmentoAtual = (html) => count(html, /class="sv-seg-btn" aria-current="page"/g);
  assert.equal(segmentoAtual(renderFeedTabsBar("for-you")), 1);
  assert.match(renderFeedTabsBar("for-you"), /<a href="#\/" class="sv-seg-btn" aria-current="page">Social<\/a>/);
  assert.match(renderFeedTabsBar("civic"), /<a href="#\/\?feed=civic" class="sv-seg-btn" aria-current="page">Cívico<\/a>/);
  for (const feed of ["following", "external", "all"]) {
    const html = renderFeedTabsBar(feed);
    assert.equal(segmentoAtual(html), 0, `${feed}: nenhum segmento ativo`);
  }
  for (const feed of FEEDS) assert.ok(count(renderFeedTabsBar(feed), /aria-current/g) <= 1, `${feed}: no máximo 1 aria-current na barra`);
});

test("as 5 chaves ?feed= seguem alcançáveis: 2 em 1 toque (segmentos) e 3 em 2 toques (Filtro), com os mesmos href", () => {
  const html = renderFeedTabsBar("for-you");
  const segmentos = html.slice(0, html.indexOf("<details"));
  const filtro = html.slice(html.indexOf("<details"));
  for (const feed of ["for-you", "civic"]) assert.ok(segmentos.includes(`href="${HREF[feed]}"`), feed);
  for (const feed of ["following", "external", "all"]) assert.ok(filtro.includes(`href="${HREF[feed]}"`), feed);
});

test("o Filtro é um <details> fechado, com rótulo 'Filtro' e, ativo, 'Filtro: <nome>' com chip que volta ao Social", () => {
  const livre = renderFeedTabsBar("for-you");
  assert.match(livre, /<details class="sv-filtro"><summary>Filtro<\/summary>/);
  assert.doesNotMatch(livre, /<details[^>]*\sopen/);
  assert.doesNotMatch(livre, /sv-filtro-chip/, "sem filtro, sem chip");
  const seguindo = renderFeedTabsBar("following");
  assert.match(seguindo, /<summary>Filtro: Seguindo<\/summary>/);
  assert.match(seguindo, /<a href="#\/\?feed=following" aria-current="page">Seguindo<\/a>/);
  assert.match(seguindo, /<a href="#\/" class="sv-filtro-chip" aria-label="Tirar o filtro Seguindo">Seguindo <span aria-hidden="true">✕<\/span><\/a>/);
  assert.match(renderFeedTabsBar("all"), /<summary>Filtro: Tudo<\/summary>/);
  assert.doesNotMatch(renderFeedTabsBar("civic"), /sv-filtro-chip|Filtro: /, "Cívico é segmento, não filtro");
});

test("a barra e a sidebar dizem 'Redes externas', sem citar outro serviço, e o texto lido não tem jargão", () => {
  for (const feed of FEEDS) {
    const html = renderFeedTabsBar(feed);
    assert.match(html, />Redes externas</);
    assert.doesNotMatch(html, /Bluesky/);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " ") + (html.match(/aria-label="[^"]*"/g) || []).join(" "), GLOSSARIO);
  }
  const nav = renderFeedNav("for-you");
  assert.match(nav, /<span class="sidebar-feed-label">Redes externas<\/span>/);
  assert.doesNotMatch(nav, /Redes \(Bluesky\)/);
});

test("sv-agora.css: sem !important, sem cor literal, var() do tema, alvos de 44 px e foco visível", () => {
  const text = sheetCss();
  css.assertNoImportant(text, SHEET);
  css.assertVarsDefined(text, SHEET);
  for (const selector of [".sv-seg-btn", ".sv-filtro > summary", ".sv-filtro-menu a", ".sv-filtro-chip"]) css.assertMinTarget(text, selector, 44);
  const body = text.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|outline\s*:\s*(none|0)\b/i);
  assert.match(body, /\.sv-seg-btn:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--sa-primary\)/, "foco visível por token");
});

test("contraste AA nos dois temas: segmento ativo e inativo, borda do controle e chip", () => {
  const text = sheetCss();
  const cor = (t, selector, prop) => css.resolveVar(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(css.ruleBody(text, selector))?.[1], t);
  for (const mode of ["dark", "light"]) {
    const t = css.readSaTokens(mode);
    const superficie = t.get("--sa-surface") ? css.resolveVar("var(--sa-surface)", t) : null;
    const ativoFg = cor(t, '.sv-seg-btn[aria-current="page"]', "color");
    const ativoBg = cor(t, '.sv-seg-btn[aria-current="page"]', "background");
    const inativo = cor(t, ".sv-seg-btn", "color");
    const borda = css.resolveVar(/border:\s*1px solid\s+([^;]+)/.exec(css.ruleBody(text, ".sv-seg"))?.[1], t);
    const chipFg = cor(t, ".sv-filtro-chip", "color");
    const chipBg = cor(t, ".sv-filtro-chip", "background");
    const menuFg = cor(t, ".sv-filtro-menu a", "color");
    const menuBg = cor(t, ".sv-filtro-menu", "background");
    assert.ok(superficie && ativoFg && ativoBg && inativo && borda && chipFg && chipBg && menuFg && menuBg, `${mode}: cores resolvem`);
    assert.ok(css.contrastRatio(ativoFg, ativoBg) >= 4.5, `${mode}: segmento ativo ${css.contrastRatio(ativoFg, ativoBg).toFixed(2)}`);
    assert.ok(css.contrastRatio(inativo, superficie) >= 4.5, `${mode}: segmento inativo ${css.contrastRatio(inativo, superficie).toFixed(2)}`);
    assert.ok(css.contrastRatio(borda, superficie) >= 3, `${mode}: borda ${css.contrastRatio(borda, superficie).toFixed(2)}`);
    assert.ok(css.contrastRatio(chipFg, chipBg) >= 4.5, `${mode}: chip ${css.contrastRatio(chipFg, chipBg).toFixed(2)}`);
    assert.ok(css.contrastRatio(menuFg, menuBg) >= 4.5, `${mode}: item do menu ${css.contrastRatio(menuFg, menuBg).toFixed(2)}`);
  }
});

test("o index.html liga sv-agora.css depois de sv-tokens.css", () => {
  const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  const tokens = html.indexOf('href="css/sv-tokens.css"');
  const agora = html.indexOf('href="css/sv-agora.css"');
  assert.ok(agora > tokens && tokens > 0, "sv-agora.css vem depois de sv-tokens.css");
});
