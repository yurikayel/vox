/**
 * @file Tabelas largas ficam em contêiner com rolagem própria (região nomeada e focável) e a folha dá o overflow-x:
 * sem isso a página rola de lado no celular (#/status e Escudo do Mestre a 320 px).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderSavesPanel } from "../client/js/dungeon/screen-party-panels.js";
import * as render from "../client/js/render.js";
import { renderProposalVotesList } from "../client/js/render/proposal.js";
import { scrollableTableHtml } from "../client/js/shared/table-scroll.js";

const WRAP = /<div class="sv-table-scroll" role="region" tabindex="0" aria-label="[^"]+">\s*<table/g;

function savesHtml() {
  const state = createDungeonSessionState({});
  const sheet = { character_id: "ana", name: "Ana", attributes_lww: { level: 1, abilities: { str: 8, dex: 14, con: 10, int: 12, wis: 9, cha: 18 } }, pools_base: {}, delta_ledger: [] };
  state.campaign = { sheetsById: { ana: sheet } };
  return renderSavesPanel(state);
}

function statusHtml() {
  const main = { innerHTML: "" };
  Object.defineProperty(main, "innerHTML", { set(v) { this._h = v; }, get() { return this._h || ""; } });
  render.renderStatusPage(main, { signalingStats: { channels: {}, peers: {} }, availabilityReport: { windows: [] } });
  return main.innerHTML;
}

test("salvaguardas do Mestre: a tabela está dentro de região rolável nomeada e focável", () => {
  assert.equal((savesHtml().match(WRAP) || []).length, 1);
});

test("status: toda tabela está dentro de região rolável nomeada e focável", () => {
  const html = statusHtml();
  const tables = (html.match(/<table/g) || []).length;
  assert.ok(tables >= 1, "a tela de status renderiza tabelas");
  assert.equal((html.match(WRAP) || []).length, tables);
});

test("transparência de votos (com dados): a tabela está dentro de região rolável nomeada e focável", () => {
  const votes = [
    { author: "vx_a", authorDisplay: "Ana", choice: "yes", eligible: true, ts: Date.now() },
    { author: "vx_b", authorDisplay: "Bia", choice: "no", eligible: false, reason: "sem vínculo com a comunidade", ts: Date.now() },
  ];
  const html = renderProposalVotesList({ votesDetail: votes });
  assert.equal((html.match(WRAP) || []).length, 1);
  assert.equal(renderProposalVotesList({ votesDetail: [] }), "");
});

test("o nome da região é escapado e as regiões do status têm nomes distintos", () => {
  const html = scrollableTableHtml('A "b" <i>', "<table></table>");
  assert.ok(html.includes('aria-label="A &quot;b&quot; &lt;i&gt;"'), html);
  const names = [...statusHtml().matchAll(/class="sv-table-scroll"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 2);
  assert.equal(new Set(names).size, names.length, `nomes repetidos: ${names.join(" | ")}`);
});

test("a folha global dá overflow-x:auto e max-width:100% ao contêiner", () => {
  const css = fs.readFileSync(new URL("../client/css/sv-agora.css", import.meta.url), "utf8");
  const rule = css.match(/\.sv-table-scroll\s*\{([^}]*)\}/);
  assert.ok(rule, "regra .sv-table-scroll ausente");
  assert.match(rule[1], /overflow-x:\s*auto/);
  assert.match(rule[1], /max-width:\s*100%/);
});
