/**
 * @file Cartão de estado de tela (V2 da UI v4): 4 kinds com `role="status"`, botão só com `action` e com `data-*`
 * escapado, texto escapado, glossário banido fora, folha `sv-estados.css` dentro do contrato (tokens, 44 px, AA nos dois
 * temas, movimento só sem preferência de redução) e o cartão vazio do Acampamento.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const card = await import("../client/js/shared/state-card.js").catch(() => ({}));
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";
import * as css from "./helpers/css-contrato.js";

const SHEET = "sv-estados.css";
const GLOSSARIO = /ledger|imutável|\bnó #|SIG:|ponta a ponta|garantia criptográfica/i;

function render(spec) {
  assert.equal(typeof card.renderStateCard, "function", "shared/state-card.js exporta renderStateCard");
  return card.renderStateCard(spec);
}

const textoVisivel = (html) => html.replace(/<[^>]+>/g, " ") + (html.match(/(?:aria-label|title|placeholder|alt)="[^"]*"/g) || []).join(" ");

const sheetCss = () => {
  assert.ok(existsSync(new URL(`../client/css/${SHEET}`, import.meta.url)), `${SHEET} existe`);
  return css.readCss(SHEET);
};

test("os 4 kinds saem com role=status; só o loading é aria-busy e tem esqueleto", () => {
  assert.deepEqual([...(card.STATE_KINDS || [])], ["loading", "empty", "error", "offline"]);
  const loading = render({ kind: "loading" });
  assert.match(loading, /role="status" aria-busy="true"/);
  assert.equal((loading.match(/class="sv-skeleton-row"/g) || []).length, 3, "3 barras por padrão");
  assert.match(loading, /<span class="sr-only">Carregando…<\/span>/);
  for (const kind of ["empty", "error", "offline"]) {
    const html = render({ kind, text: "Uma frase." });
    assert.match(html, new RegExp(`class="sv-state sv-state--${kind}" role="status"`));
    assert.doesNotMatch(html, /aria-busy|sv-skeleton-row/);
    assert.match(html, /<svg[^>]*aria-hidden="true"/, "ícone decorativo");
    assert.match(html, /<p class="sv-state-text">Uma frase\.<\/p>/);
  }
});

test("rows do esqueleto vai de 1 a 8 e o loading com texto mostra o texto em vez do aviso só para leitor de tela", () => {
  const barras = (rows) => (render({ kind: "loading", rows }).match(/sv-skeleton-row/g) || []).length;
  assert.deepEqual([barras(1), barras(5), barras(99), barras(-4), barras("x")], [1, 5, 8, 1, 3]);
  const enviando = render({ kind: "loading", text: "Enviando…" });
  assert.match(enviando, /<p class="sv-state-text">Enviando…<\/p>/);
  assert.doesNotMatch(enviando, /sr-only/);
  const hostil = render({ kind: "loading", text: "<img src=x onerror=1> & mais" });
  assert.doesNotMatch(hostil, /<img/, "o texto do loading é escapado");
  assert.match(hostil, /&lt;img src=x onerror=1&gt; &amp; mais/);
});

test("kind fora da lista lança erro", () => {
  for (const kind of ["sending", "", undefined, "EMPTY"]) assert.throws(() => render({ kind }), /Estado de tela desconhecido/);
  assert.throws(() => render(), /Estado de tela desconhecido/);
});

test("sem action não há botão; com action há 1 botão com data-* escapado", () => {
  for (const kind of ["empty", "error", "offline"]) assert.doesNotMatch(render({ kind, text: "x" }), /<button/);
  const data = { dungeon: "retry-camp", "alvo-id": 'a"b<c' };
  const html = render({ kind: "error", text: "Não deu para carregar.", action: { label: "Tentar de novo", data } });
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.match(html, /<button type="button" class="sv-state-action" data-dungeon="retry-camp" data-alvo-id="a&quot;b&lt;c">Tentar de novo<\/button>/);
});

test("botão sem data-*, sem rótulo ou com chave inválida é recusado (nenhum botão morto)", () => {
  assert.throws(() => render({ kind: "error", action: { label: "Tentar de novo" } }), /sem data-\*/);
  assert.throws(() => render({ kind: "error", action: { label: "Tentar de novo", data: {} } }), /sem data-\*/);
  assert.throws(() => render({ kind: "error", action: { label: " ", data: { a: "b" } } }), /sem rótulo/);
  for (const key of ["onclick=alert(1) x", "A", "1a", "a b"]) {
    assert.throws(() => render({ kind: "empty", action: { label: "Ok", data: { [key]: "v" } } }), /Chave data-\* inválida/, key);
  }
});

test("o texto e o rótulo são escapados, e a marcação não tem jargão nem endereço externo", () => {
  const html = render({ kind: "offline", text: "<img src=x onerror=1> & mais", action: { label: "<b>Ir</b>", data: { a: "b" } } });
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /&lt;img src=x onerror=1&gt; &amp; mais/);
  for (const kind of card.STATE_KINDS || []) {
    const out = render({ kind, text: "Sem conexão com o aparelho." });
    assert.doesNotMatch(out, GLOSSARIO);
    assert.doesNotMatch(out, /https?:\/\//, "sem recurso externo");
  }
});

test("sv-estados.css: sem !important, sem cor literal, var() do tema, alvo de 44 px e registrada no carregador", () => {
  const text = sheetCss();
  css.assertNoImportant(text, SHEET);
  css.assertVarsDefined(text, SHEET);
  css.assertMinTarget(text, ".sv-state-action", 44);
  assert.doesNotMatch(text.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|outline\s*:\s*(none|0)\b/i);
  assert.ok(SV_SHEETS.some((s) => s.href === `css/${SHEET}` && s.id === "sv-estados-stylesheet"), "SV_SHEETS lista sv-estados.css");
});

test("contraste AA nos dois temas: frase ≥ 4.5; ícone e borda do botão ≥ 3 sobre o fundo do cartão", () => {
  const text = sheetCss();
  const cor = (selector, prop, tokens) => css.resolveVar(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(css.ruleBody(text, selector))?.[1], tokens);
  for (const mode of ["dark", "light"]) {
    const t = css.readSaTokens(mode);
    const fundo = cor(".sv-state", "background", t);
    const frase = cor(".sv-state", "color", t);
    const icone = cor(".sv-state-icon", "color", t);
    const erro = cor(".sv-state--error .sv-state-icon", "color", t);
    const borda = css.resolveVar(/border:\s*1px solid\s+([^;]+)/.exec(css.ruleBody(text, ".sv-state-action"))?.[1], t);
    assert.ok(fundo && frase && icone && erro && borda, `${mode}: cores do cartão resolvem`);
    assert.ok(css.contrastRatio(frase, fundo) >= 4.5, `${mode}: frase ${css.contrastRatio(frase, fundo).toFixed(2)}`);
    for (const [nome, cor1] of [["ícone", icone], ["ícone de erro", erro], ["borda do botão", borda]]) {
      assert.ok(css.contrastRatio(cor1, fundo) >= 3, `${mode}: ${nome} ${css.contrastRatio(cor1, fundo).toFixed(2)} < 3`);
    }
  }
});

test("o esqueleto só anima sem preferência de redução de movimento, e o raio vem dos tokens --sv-radius", () => {
  const text = sheetCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const foraDaMedia = text.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/, "");
  assert.doesNotMatch(css.ruleBody(foraDaMedia, ".sv-skeleton-row"), /animation/);
  assert.match(text, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.sv-skeleton-row\s*\{[^}]*animation:/);
  for (const selector of [".sv-state", ".sv-state-action", ".sv-skeleton-row"]) {
    const raio = /border-radius:\s*([^;]+)/.exec(css.ruleBody(text, selector))?.[1];
    assert.match(raio || "", /^var\(--sv-radius(-sm)?\)$/, `${selector}: raio vem do token --sv-radius`);
  }
  const raiz = css.ruleBody(css.readCss("sv-tokens.css"), ":root");
  assert.match(raiz, /--sv-radius:\s*var\(--radius\)/);
  assert.match(raiz, /--sv-radius-sm:\s*var\(--radius-sm\)/);
  assert.match(css.ruleBody(css.readCss("agora.css"), ":root"), /--radius:\s*0\.5rem/);
});

test("o Acampamento sem campanha mostra o cartão vazio e, com campanha, não mostra", () => {
  const vazio = renderCampScreen(createDungeonSessionState({}));
  assert.match(vazio, /class="sv-state sv-state--empty" role="status"/);
  assert.match(vazio, /Nenhuma campanha salva ainda neste aparelho/);
  assert.doesNotMatch(vazio, /dungeon-muted">Nenhuma campanha/, "o <p> solto saiu");
  const cartao = /<div class="sv-state sv-state--empty"[\s\S]*?<\/div>/.exec(vazio)?.[0] || "";
  assert.ok(cartao, "o cartão vazio está na tela");
  assert.doesNotMatch(cartao, /<button/, "o vazio do Acampamento não traz botão (o formulário acima já cria a campanha)");
  assert.doesNotMatch(textoVisivel(cartao), GLOSSARIO, "o texto do Acampamento também passa pelo glossário");
  assert.doesNotMatch(textoVisivel(cartao), /Obsidian/, "texto descreve a função, não cita produto");
  const cheio = createDungeonSessionState({});
  cheio.campaigns = [{ id: "c1", name: "Crônicas", system: "d20_fantasy", sheetCount: 1, chronicleCount: 0 }];
  assert.doesNotMatch(renderCampScreen(cheio), /sv-state--empty/);
});

test(".sr-only é global (sv-tokens.css), visualmente oculto e sem !important", () => {
  const regra = css.ruleBody(css.readCss("sv-tokens.css"), ".sr-only");
  assert.ok(regra, ".sr-only está definido em sv-tokens.css");
  assert.match(regra, /position:\s*absolute/);
  assert.match(regra, /width:\s*1px/);
  assert.match(regra, /height:\s*1px/);
  assert.match(regra, /overflow:\s*hidden/);
  assert.match(regra, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  assert.doesNotMatch(regra, /!important/);
});
