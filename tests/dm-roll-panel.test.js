/**
 * @file SUB-23: painel "Rolagens" do Escudo do Mestre. Filtro puro (Todas, Secretas), linhas com quem · o quê · total ·
 * modo · cadeado, estados vazio e "Reconectando…" pelo cartão compartilhado, filtros em abas de rádio e folha dentro do
 * contrato de CSS.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";
import { filterRollLog, renderDmRollPanel, ROLL_FILTERS } from "../client/js/dungeon/dm-roll-panel.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import * as css from "./helpers/css-contrato.js";

const roll = (extra = {}) => ({ id: "r1", speaker: "Lia", label: "Perícia: Furtividade", formula: "1d20+3", total: 14, visibility: "public", ...extra });
const panelOf = (html, id) => new RegExp(`<div class="sv-rolls-panel is-${id}">([\\s\\S]*?)</div>`).exec(html)?.[1] || "";

test("a) filterRollLog: Secretas devolve gm e blind; Todas e filtro desconhecido devolvem tudo; lista inválida vira vazia", () => {
  const log = [roll({ visibility: "gm" }), roll({ visibility: "public" }), roll({ visibility: "blind" }), roll({ visibility: undefined })];
  assert.equal(filterRollLog([{ visibility: "gm" }, { visibility: "public" }], "secretas").length, 1);
  assert.equal(filterRollLog(log, "secretas").length, 2);
  assert.equal(filterRollLog(log, "todas").length, 4);
  assert.equal(filterRollLog(log, "outro").length, 4);
  assert.equal(filterRollLog(log).length, 4);
  assert.deepEqual(filterRollLog(null, "secretas"), []);
});

test("b) a linha traz quem, o quê, total e modo; só a secreta ganha o cadeado e o texto 'Só para o Mestre'", () => {
  const html = renderDmRollPanel({ rolls: [roll({ id: "p", speaker: "Bo", label: "Teste de Força", total: 9 }), roll({ visibility: "gm" })] });
  const secret = panelOf(html, "secretas");
  assert.match(secret, /<th scope="row">Lia<\/th><td>Perícia: Furtividade<\/td><td>14<\/td><td><span aria-hidden="true">🔒<\/span> Só para o Mestre<\/td>/);
  assert.doesNotMatch(secret, /Bo/, "a pública não entra em Secretas");
  const all = panelOf(html, "todas");
  assert.match(all, /<th scope="row">Bo<\/th><td>Teste de Força<\/td><td>9<\/td><td>Pública<\/td>/);
  assert.equal((all.match(/🔒/g) || []).length, 1, "só a secreta tem cadeado");
});

test("c) a mais recente vem primeiro, o texto é escapado e a fórmula entra quando não há rótulo", () => {
  const html = renderDmRollPanel({ rolls: [roll({ speaker: "Antiga" }), roll({ speaker: "<b>Nova</b>", label: "" })] });
  const all = panelOf(html, "todas");
  assert.ok(all.indexOf("&lt;b&gt;Nova") < all.indexOf("Antiga"), "mais recente primeiro");
  assert.doesNotMatch(all, /<b>Nova/);
  assert.match(all, /<td>1d20\+3<\/td>/);
});

test("d) sem rolagens: cartão de vazio por filtro, uma vez cada; só públicas deixam Secretas vazia", () => {
  for (const rolls of [[], undefined]) {
    const html = renderDmRollPanel({ rolls });
    assert.match(panelOf(html, "todas"), /sv-state--empty[\s\S]*Nenhuma rolagem ainda\./);
    assert.match(panelOf(html, "secretas"), /sv-state--empty[\s\S]*Nenhuma rolagem secreta ainda\./);
  }
  const onlyPublic = renderDmRollPanel({ rolls: [roll()] });
  assert.match(panelOf(onlyPublic, "secretas"), /Nenhuma rolagem secreta ainda\./);
  assert.match(panelOf(onlyPublic, "todas"), /<table/);
  assert.equal((renderDmRollPanel({ rolls: [] }).match(/Nenhuma rolagem ainda\./g) || []).length, 1);
});

test("e) canal caído mostra só 'Reconectando…' (cartão offline), sem tabela nem filtros, mesmo com rolagens", () => {
  const html = renderDmRollPanel({ syncOffline: true, rolls: [roll({ visibility: "gm" })] });
  assert.match(html, /sv-state--offline[\s\S]*Reconectando…/);
  assert.doesNotMatch(html, /<table|type="radio"|Furtividade/);
});

test("f) filtros são abas de rádio com 'Todas' marcada, ligadas ao painel certo e preservadas no redesenho", () => {
  const html = renderDmRollPanel({ rolls: [roll()] });
  assert.deepEqual(ROLL_FILTERS.map((f) => f.label), ["Todas", "Secretas"]);
  assert.equal((html.match(/<input type="radio"/g) || []).length, 2);
  assert.match(html, /id="dm-rolls-todas" data-dungeon-tab="dm-rolls-todas" checked/);
  assert.equal((html.match(/ checked \/>/g) || []).length, 1);
  assert.match(html, /<label class="sv-rolls-label" for="dm-rolls-secretas">Secretas<\/label>/);
});

test("g) o Escudo do Mestre mostra o painel de rolagens com as rolagens da sessão", () => {
  const state = createDungeonSessionState();
  state.rolls = [roll({ visibility: "gm", speaker: "Mira" })];
  const html = renderDmScreen(state);
  assert.match(html, /aria-label="Rolagens do Mestre"/);
  assert.match(html, /Mira/);
});

test("i) o painel mostra só as 50 rolagens mais recentes", () => {
  const rolls = Array.from({ length: 60 }, (_, i) => roll({ speaker: `Jogador${i}` }));
  const all = panelOf(renderDmRollPanel({ rolls }), "todas");
  assert.equal((all.match(/<tr><th scope="row">/g) || []).length, 50);
  assert.match(all, /Jogador59/);
  assert.doesNotMatch(all, /Jogador9<|Jogador0</);
});

test("j) texto digitado pelo jogador (rótulo, fórmula, total e nome) nunca vira marcação no navegador do Mestre", () => {
  const hostile = [
    roll({ id: "x1", label: "<img src=x onerror=alert(1)>" }),
    roll({ id: "x2", label: '"><script>alert(2)</script>' }),
    roll({ id: "x3", label: "", formula: "<svg onload=alert(3)>" }),
    roll({ id: "x4", total: "<b>9</b>", speaker: '"><i>' }),
  ];
  const html = renderDmRollPanel({ rolls: hostile });
  for (const tag of ["<img", "<script", "<svg onload", "<b>9", "<i>"]) assert.equal(html.includes(tag), false, `sem ${tag} cru`);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), "o rótulo vira texto");
  assert.ok(html.includes("&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;"), "aspas e script do rótulo viram texto");
  assert.ok(html.includes("&lt;svg onload=alert(3)&gt;"), "a fórmula vira texto");
  assert.ok(html.includes("&lt;b&gt;9&lt;/b&gt;"), "o total vira texto");
});

test("k) as abas são rádios do mesmo grupo (as setas trocam de aba), o grupo tem nome e os textos de reserva aparecem", () => {
  const html = renderDmRollPanel({ rolls: [roll({ speaker: "", visibility: "blind" })] });
  const names = [...html.matchAll(/<input type="radio"[^>]*\bname="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(names.length, ROLL_FILTERS.length);
  assert.equal(new Set(names).size, 1, "todos os rádios compartilham o mesmo name");
  assert.match(html, /role="group" aria-label="Filtro de rolagens"/);
  assert.match(html, /<th scope="row">Aventureiro<\/th>/);
  assert.match(html, /🔒<\/span> Cega<\/td>/);
  assert.match(html, /<span class="dungeon-eyebrow">Só vista<\/span>/);
});

test("l) CSS: o rádio fica na árvore de acessibilidade e cada aba tem anel de foco de 2 px", () => {
  const text = css.readCss("sv-rolagens.css");
  const input = css.ruleBody(text, ".sv-rolls-input");
  assert.ok(input.length > 0, "a regra do rádio existe");
  assert.doesNotMatch(input, /display\s*:\s*none|visibility\s*:\s*hidden|\bhidden\b/, "rádio escondido por display/visibility sai da ordem de Tab");
  for (const f of ROLL_FILTERS) {
    const selector = `#dm-rolls-${f.id}:focus-visible ~ .sv-rolls-list [for="dm-rolls-${f.id}"]`;
    assert.match(css.ruleBody(text, selector), /outline\s*:\s*2px solid/, `anel de foco da aba ${f.label}`);
  }
});

test("h) sv-rolagens.css: sem !important, só tokens do tema, alvo de 44 px, só o painel da aba marcada e registrada no carregador", () => {
  const text = css.readCss("sv-rolagens.css");
  css.assertNoImportant(text, "sv-rolagens.css");
  css.assertVarsDefined(text, "sv-rolagens.css");
  css.assertMinTarget(text, ".sv-rolls-label", 44);
  assert.doesNotMatch(text.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|outline\s*:\s*(none|0)\b/i);
  assert.match(text, /\.sv-rolls-panel \{ display: none; \}/);
  for (const f of ROLL_FILTERS) assert.match(text, new RegExp(String.raw`#dm-rolls-${f.id}:checked ~ \.sv-rolls-panels \.is-${f.id}`));
  assert.ok(SV_SHEETS.some((s) => s.href === "css/sv-rolagens.css" && s.id === "sv-rolagens-stylesheet"));
});
