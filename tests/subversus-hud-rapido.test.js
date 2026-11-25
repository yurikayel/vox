/**
 * @file HUD rápido da aba Mapa (spec Subversus VTT v0, §3.1): no máximo 6 atalhos, em ordem estável,
 * derivados da ficha, e cada atalho aponta para uma ação que existe em `ACTION_HANDLERS`.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildHudShortcuts, HUD_MAX_SHORTCUTS } from "../client/js/dungeon/sheet-view-model.js";
import { renderMapHud } from "../client/js/dungeon/screen-map-hud.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";

const actions = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, label: `Golpe ${i}`, roll: "1d20" }));
const sheet = (n, extra = {}) => ({ char_id: "c1", character_id: "c1", sheet_meta: { clickable_actions: actions(n) }, ...extra });

test("HUD: nunca passa de 6 atalhos, mesmo com muitas ações na ficha", () => {
  assert.equal(HUD_MAX_SHORTCUTS, 6);
  for (const n of [0, 1, 3, 4, 10, 50]) {
    assert.ok(buildHudShortcuts(sheet(n), { ownTokenId: "t1" }).length <= 6, `${n} ações`);
    assert.ok(buildHudShortcuts(sheet(n)).length <= 6, `${n} ações sem token`);
  }
});

test("HUD: ordem = ações da ficha (na ordem dela), depois Rolar d20, Mover e Abrir ficha", () => {
  const items = buildHudShortcuts(sheet(10), { ownTokenId: "t1" });
  assert.deepEqual(items.map((i) => i.id), ["action:a0", "action:a1", "action:a2", "roll-d20", "move", "sheet"]);
  assert.deepEqual(buildHudShortcuts(sheet(1)).map((i) => i.id), ["action:a0", "roll-d20", "sheet"]);
});

test("HUD: sem token da ficha não há 'Mover' e as ações ocupam a vaga; sem ficha só resta o d20", () => {
  assert.deepEqual(buildHudShortcuts(sheet(10)).map((i) => i.id), ["action:a0", "action:a1", "action:a2", "action:a3", "roll-d20", "sheet"]);
  assert.deepEqual(buildHudShortcuts(null).map((i) => i.id), ["roll-d20"]);
});

test("HUD: ação sem id ou sem rótulo é ignorada (não vira botão quebrado)", () => {
  const s = { char_id: "c1", sheet_meta: { clickable_actions: [{ id: "", label: "x" }, { id: "b", label: "" }, { id: "ok", label: "Ok" }] } };
  assert.deepEqual(buildHudShortcuts(s).filter((i) => i.id.startsWith("action:")).map((i) => i.id), ["action:ok"]);
});

test("HUD: todo botão despacha uma ação que existe em ACTION_HANDLERS", () => {
  const state = createDungeonSessionState({ viewerRole: "player" });
  state.sheet = sheet(10);
  const html = renderMapHud(state, { tokens: [{ tokenId: "t1", sheetId: "c1" }] });
  const dispatched = [...html.matchAll(/data-dungeon="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(dispatched.length >= 1);
  for (const name of dispatched) assert.equal(typeof ACTION_HANDLERS[name], "function", name);
  assert.equal([...html.matchAll(/data-hud-shortcut=/g)].length, 6);
});

test("HUD: rótulo da ficha é escapado e a Mesa mostra o HUD na aba Mapa", () => {
  const state = createDungeonSessionState({ viewerRole: "player" });
  state.sheet = sheet(1);
  state.sheet.sheet_meta.clickable_actions[0].label = "<img src=x onerror=alert(1)>";
  const html = renderTableScreen(state);
  assert.match(html, /data-dungeon-zone="mapHud"/);
  assert.ok(!html.includes("<img src=x"));
  assert.equal(renderMapHud({ sheet: null }, {}), "");
});
