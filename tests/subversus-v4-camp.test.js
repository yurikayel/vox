/**
 * @file Acampamento da UI v4 (V1): "Entrar" é o único botão primário, o grupo vira linhas com barra de PV, Descanso e
 * Espólios ficam em `<details>` fechados, o selo "Ativa" não quebra de linha; alvos de 44 px e contraste AA nos dois temas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderPartyPanel } from "../client/js/dungeon/screen-party-panels.js";
import { SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";
import * as css from "./helpers/css-contrato.js";
import { assertRatio, hexOf, resolveTheme } from "./helpers/css-tema.js";

const CAMP_CSS = "sv-camp.css";
const sheet = (id, name, extra = {}) => ({
  character_id: id,
  name,
  role_title: "Bardo",
  attributes_lww: { level: 3 },
  pools_base: { hp_max: 20 },
  delta_ledger: [],
  inventory_orset: { adaga: { id: "adaga", label: "Adaga", qty: 1, weightLb: 1, equipped: false } },
  ...extra,
});

function campState() {
  const state = createDungeonSessionState({});
  state.campaign = { sheetsById: { ana: sheet("ana", "Ana"), bia: sheet("bia", "Bia", { pools_base: { hp_max: 10 }, delta_ledger: [] }) } };
  state.campaignId = "c1";
  state.campaigns = [{ id: "c1", name: "Crônicas", system: "d20_fantasy", sheetCount: 2, chronicleCount: 0 }, { id: "c2", name: "Outra", sheetCount: 1, chronicleCount: 0 }];
  return state;
}

const campCss = () => {
  assert.ok(existsSync(new URL(`../client/css/${CAMP_CSS}`, import.meta.url)), `${CAMP_CSS} existe`);
  return css.readCss(CAMP_CSS);
};

function detailsOf(html, key) {
  const m = new RegExp(`<details[^>]*data-dungeon-details="${key}"[^>]*>([\\s\\S]*?)</details>`).exec(html);
  assert.ok(m, `há <details data-dungeon-details="${key}">`);
  return { open: /<details[^>]*\sopen[\s>]/.test(m[0].slice(0, m[0].indexOf(">") + 1)), body: m[1] };
}

test("o Acampamento tem um único botão primário, e é o 'Entrar na Mesa' do herói", () => {
  const html = renderCampScreen(campState());
  const primaries = html.match(/class="[^"]*\bdungeon-btn-primary\b[^"]*"/g) || [];
  assert.equal(primaries.length, 1, "1 .dungeon-btn-primary por render");
  assert.match(html, /dungeon-btn-primary[^>]*>[\s\S]{0,600}?Entrar na Mesa/);
  const semCampanha = renderCampScreen(createDungeonSessionState({}));
  assert.equal((semCampanha.match(/\bdungeon-btn-primary\b/g) || []).length, 1, "sem campanha também");
});

test("Descanso e Espólios ficam em <details> fechados, com os botões e os itens dentro", () => {
  const html = renderCampScreen(campState());
  const rest = detailsOf(html, "camp-rest");
  assert.equal(rest.open, false, "Descanso fechado por padrão");
  assert.match(rest.body, /data-dungeon="calendar-short-rest"/);
  assert.match(rest.body, /data-dungeon="calendar-long-rest"/);
  const loot = detailsOf(html, "camp-loot");
  assert.equal(loot.open, false, "Espólios fechado por padrão");
  assert.match(loot.body, /Adaga/);
  assert.match(html.slice(0, html.indexOf('data-dungeon-details="camp-rest"')), /create-campaign-form/, "o resto da tela fica fora do <details>");
});

test("o grupo vira uma linha por personagem, com barra de PV só quando a ficha tem PV", () => {
  const html = renderPartyPanel(campState());
  assert.equal((html.match(/<li class="sv-party-row">/g) || []).length, 2);
  assert.match(html, /role="progressbar" aria-label="PV de Ana" aria-valuemin="0" aria-valuemax="20" aria-valuenow="20"/);
  assert.match(html, /style="width:100%"/);
  const bare = { character_id: "x", name: "X", attributes_lww: {}, pools_base: {}, delta_ledger: [] };
  const semPv = createDungeonSessionState({});
  semPv.campaign = { sheetsById: { x: bare } };
  const row = renderPartyPanel(semPv);
  assert.match(row, /sv-party-row/);
  assert.doesNotMatch(row, /progressbar/, "sem PV na ficha não há barra inventada");
});

test("selo 'Ativa' sem quebra de linha e com contraste AA no tema escuro e no claro", () => {
  const html = renderCampScreen(campState());
  assert.match(html, /<span class="dungeon-badge-ok">Ativa neste aparelho<\/span>/);
  const sheetCss = campCss();
  const rule = ".dungeon-table-meta .dungeon-badge-ok";
  assert.match(css.ruleBody(sheetCss, rule), /white-space:\s*nowrap/);
  for (const mode of ["dark", "light"]) {
    const tokens = css.readSaTokens(mode);
    const fg = css.resolveVar(/(?:^|;)\s*color:\s*([^;]+)/.exec(css.ruleBody(sheetCss, rule))?.[1], tokens);
    const bg = css.resolveVar(/background:\s*([^;]+)/.exec(css.ruleBody(sheetCss, rule))?.[1], tokens);
    assert.ok(fg && bg, `${mode}: cor e fundo do selo resolvem para hex`);
    assert.ok(css.contrastRatio(fg, bg) >= 4.5, `${mode}: contraste do selo ${css.contrastRatio(fg, bg).toFixed(2)} < 4.5`);
  }
});

test("alvos de toque de 44 px nos <summary> e nos botões dos <details>", () => {
  const sheetCss = campCss();
  for (const selector of [".sv-camp-details > summary", ".sv-camp-details .dungeon-btn"]) {
    css.assertMinTarget(sheetCss, selector, 44);
  }
  assert.match(css.ruleBody(sheetCss, ".sv-party-hp"), /font-size:\s*0\.8125rem/, "texto do PV ≥ 12 px");
});

test("sv-camp.css: sem !important, sem cor literal fora de --sa-*, só var() do tema, e registrada no carregador", () => {
  const sheetCss = campCss();
  css.assertNoImportant(sheetCss, CAMP_CSS);
  css.assertVarsDefined(sheetCss, CAMP_CSS);
  const body = sheetCss.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "cor literal fora dos tokens");
  assert.ok(SV_SHEETS.some((s) => s.href === `css/${CAMP_CSS}`), "SV_SHEETS lista sv-camp.css");
});

test("screen-camp.js continua com no máximo 350 linhas", () => {
  const lines = readFileSync(new URL("../client/js/dungeon/screen-camp.js", import.meta.url), "utf8").split("\n").length - 1;
  assert.ok(lines <= 350, `screen-camp.js tem ${lines} linhas (teto 350)`);
});

const GLOSSARIO_BANIDO = /ledger|imutável|\bnó #|SIG:|ponta a ponta|garantia criptográfica/i;

/** Tudo o que um leitor de tela lê: o texto visível e os atributos aria-label, title, placeholder e alt. */
function textoLido(html) {
  const atributos = [...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  return [html.replace(/<[^>]+>/g, " "), ...atributos].join(" ");
}

test("o texto lido do Acampamento (visível, aria-label, title, placeholder) não usa jargão nem promessa vazia", () => {
  const telas = [renderCampScreen(campState()), renderCampScreen(createDungeonSessionState({})), renderPartyPanel(campState())];
  for (const html of telas) assert.doesNotMatch(textoLido(html), GLOSSARIO_BANIDO, "termo do glossário banido na tela");
});

test("a checagem do glossário enxerga o termo banido em aria-label, title, placeholder e no texto", () => {
  for (const mutado of ['<a aria-label="Cofre imutável">x</a>', '<b title="ledger local">x</b>', '<input placeholder="SIG: abc">', "<p>nó #4881</p>"]) {
    assert.match(textoLido(mutado), GLOSSARIO_BANIDO, mutado);
  }
});

test("sem campanha o Acampamento mostra o estado vazio: uma frase e o caminho da ação", () => {
  const html = renderCampScreen(createDungeonSessionState({}));
  assert.match(html, /Nenhuma campanha salva ainda neste aparelho\. Crie sua primeira campanha acima/);
  assert.match(html, /create-campaign-form/, "o formulário de criar fica na tela");
});

test("sv-camp.css e o index não usam rede externa, não suprimem o foco e não travam o zoom", () => {
  const sheetCss = campCss().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(sheetCss, /outline\s*:\s*(none|0)\b/i, "foco visível não pode ser suprimido");
  assert.doesNotMatch(sheetCss, /@import|url\(\s*["']?(https?:)?\/\//i, "nada de recurso externo na folha");
  const index = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(index, /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i, "o viewport permite zoom");
});

test("o <summary> das sanfonas mostra um marcador (chevron) que gira quando aberta", () => {
  const sheetCss = campCss();
  const marker = css.ruleBody(sheetCss, ".sv-camp-details > summary::before");
  assert.ok(marker, "há ::before no summary");
  assert.match(marker, /content:\s*""/, "o marcador tem content");
  assert.match(marker, /border-(right|bottom):\s*2px solid var\(--sa-/, "chevron desenhado com token do tema");
  const open = css.ruleBody(sheetCss, ".sv-camp-details[open] > summary::before");
  assert.match(open, /transform:\s*rotate\(45deg\)/, "gira ao abrir");
  assert.doesNotMatch(open, /border|color/, "aberta só gira: a cor do marcador não muda");
});

test("o marcador (chevron) do <summary> tem contraste de 3:1 contra a superfície nos dois temas e nos dois caminhos do claro", () => {
  const marker = css.ruleBody(campCss(), ".sv-camp-details > summary::before");
  const cores = [...marker.matchAll(/border-(right|bottom):\s*2px solid (var\(--[a-z0-9-]+\))/g)].map((m) => m[2]);
  assert.equal(cores.length, 2, "as duas bordas do chevron");
  assert.equal(cores[0], cores[1], "as duas bordas têm a mesma cor");
  for (const [theme, route] of [["dark", "both"], ["light", "attr"], ["light", "media"]]) {
    const tokens = resolveTheme(theme, route);
    for (const superficie of ["--sa-surface", "--sa-surface-container"]) {
      assertRatio(`${theme}/${route}: chevron ${cores[0]} sobre ${superficie}`, hexOf(tokens, cores[0]), hexOf(tokens, superficie), 3);
    }
  }
});
