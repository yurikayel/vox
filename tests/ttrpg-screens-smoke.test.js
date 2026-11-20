import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { renderZ3SessionBlock, renderChronicleColumn } from "../client/js/dungeon/screen-table-layout.js";
import { renderHandoutViewer, renderNotesPanel } from "../client/js/dungeon/screen-notes.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";

const INJECT = '<b evil="1">';

function stateWith(overrides) {
  return createDungeonSessionState(overrides);
}

test("screen-table-layout: Z3 jogador drawer vs GM grade e ids da crônica", () => {
  const state = stateWith({ viewerRole: "player" });
  const gmBlock = renderZ3SessionBlock(state, false);
  const plBlock = renderZ3SessionBlock(state, true);
  assert.ok(gmBlock.includes("dungeon-table-layout") && !gmBlock.includes("dungeon-z3-drawer"));
  assert.ok(plBlock.includes('class="dungeon-z3-drawer"'));
  assert.ok(plBlock.includes('data-dungeon-zone="narrativeRoll"'));
  assert.ok(plBlock.includes('summary>Handouts</summary>'));
  const col = renderChronicleColumn(state);
  assert.ok(col.includes('id="dungeon-action-input"'));
  assert.ok(col.includes('aria-label="Crônica da Mesa"'));
  assert.ok(col.includes("Declarar Ação"));
});

test("renderHandoutViewer: notas shared e links https, ignora gm_only", () => {
  const toxic = `${INJECT}Doc`;
  const html = renderHandoutViewer(stateWith({
    notes: [
      { id: "h1", title: toxic, visibility: "shared", publicMarkdown: "Texto", links: ["https://example.com/a.pdf"] },
      { id: "h2", title: "Secreto", visibility: "gm_only", publicMarkdown: "x" },
    ],
  }));
  assert.ok(html.includes("handout-stack"));
  assert.ok(html.includes("&lt;b evil") && !html.includes('evil="1">'));
  assert.ok(html.includes("https://example.com/a.pdf"));
  assert.ok(!html.includes("Secreto"));
});

test("screen-notes: pastas, marcos vazios e escapeHtml no título", () => {
  const toxic = `${INJECT}Pista`;
  const empty = renderNotesPanel(stateWith({ notes: [] }));
  assert.ok(empty.includes("Pistas e Lore") && empty.includes(".md"));
  const rich = renderNotesPanel(stateWith({
    viewerRole: "gm",
    notes: [{ id: "n-x", title: toxic, folder: "Pistas", publicMarkdown: "Runas", visibility: "public" }],
  }));
  assert.ok(rich.includes("&lt;b evil"));
  assert.ok(!rich.includes('evil="1">'));
  assert.ok(rich.includes("Pistas"));
});

test("screen-camp: marcos do acampamento e escapeHtml em tableName", () => {
  const state = stateWith({
    tableName: `${INJECT}Mesa`,
    campaignId: "demo-camp",
    notes: [{ id: "n1", title: "Ald", folder: "Notas", publicMarkdown: "ok", visibility: "public" }],
  });
  const html = renderCampScreen(state);
  assert.ok(html.includes("Solidariedade Automática"));
  assert.ok(html.includes("Apoiar Comunidades Enquanto Descansa"));
  assert.ok(html.includes('aria-label="Notas por pasta"') && html.includes("Ald"));
  assert.ok(html.includes("&lt;b evil") && !html.includes('evil="1">Mesa'));
  assert.ok(html.includes("Detalhes Técnicos"));
});

test("screen-sheet: atalho Subir de Nível e escapeHtml no nome", () => {
  const state = stateWith({
    sheet: { ...stateWith().sheet, name: `${INJECT}Lyra`, attributes_lww: { level: 2 } },
  });
  const html = renderSheetScreen(state);
  assert.ok(html.includes('data-dungeon="level-up"') && html.includes("Subir de Nível"));
  assert.ok(html.includes("Histórico da Mesa"));
  assert.ok(html.includes("&lt;b evil"));
});

test("renderTableScreen jogador: drawer Z3 via renderDungeonView is-session-player", () => {
  const state = stateWith({
    viewerRole: "player",
    sheet: { ...stateWith().sheet, name: `${INJECT}Lyra` },
  });
  const tableOnly = renderTableScreen(state);
  assert.ok(tableOnly.includes("dungeon-z3-drawer"));
  assert.ok(tableOnly.includes("dungeon-dice-tray"));
  assert.ok(tableOnly.includes('id="dungeon-roll-input"'));
  assert.ok(!tableOnly.includes("dungeon-token-name"));
  assert.ok(tableOnly.includes("&lt;b evil"));
  const full = renderDungeonView({ screen: "mesa", state });
  assert.ok(full.includes("dungeon-sanctum is-session-player"));
  assert.ok(full.includes("dungeon-z3-drawer"));
  assert.ok(full.includes('data-dungeon-ui-mode="player_session"'));
});