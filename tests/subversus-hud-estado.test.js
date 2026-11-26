/**
 * @file HUD de jogo, parte 1 (spec hud-jogo-v0): retrato, PV, CA, condições, grupo, linha móvel e visão do jogador.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildHudConditions, buildHudStatus, buildMobileLine, HUD_MAX_CONDITIONS, tokenHpLabel } from "../client/js/dungeon/hud-status-model.js";
import { renderHudStatus } from "../client/js/dungeon/screen-hud-status.js";
import { renderMapHud } from "../client/js/dungeon/screen-map-hud.js";
import { projectStateForPlayer } from "../client/js/dungeon/vtt-reducer.js";

const ownSheet = (extra = {}) => ({
  character_id: "ana", name: "Lyra", attributes_lww: { armor_class: 16 },
  pools_base: { hp_max: 24 }, delta_ledger: [], system_choices: { conditions: [] }, ...extra,
});
const tok = (tokenId, sheetId, extra = {}) => ({ tokenId, sheetId, name: tokenId, initials: "xy", color: "#112233", layer: "player", ownerRouteId: "", ...extra });
const stateWith = (sheet) => ({ sheet });

test("HUD estado: retrato com iniciais maiúsculas e cor do token; nome, PV e CA da ficha própria", () => {
  const m = buildHudStatus(stateWith(ownSheet()), { tokens: [tok("t1", "ana", { initials: "ly", color: "#78d6cf" })] });
  assert.equal(m.own.initials, "LY");
  assert.equal(m.own.color, "#78d6cf");
  assert.equal(m.own.hp, "24/24");
  assert.equal(m.own.ac, 16);
  assert.equal(m.own.mobileLine, "Lyra · PV 24/24 · CA 16");
});

test("HUD estado: sem ficha não há modelo nem HTML", () => {
  assert.equal(buildHudStatus({ sheet: null }, { tokens: [] }), null);
  assert.equal(renderHudStatus({ sheet: null }, {}), "");
});

test("HUD estado: linha móvel omite o que não tem dado", () => {
  assert.equal(buildMobileLine({ name: "Lyra", hp: null, ac: null }), "Lyra");
  assert.equal(buildMobileLine({ name: "Lyra", hp: "3/9", ac: null }), "Lyra · PV 3/9");
  assert.equal(buildMobileLine({ name: "Lyra", hp: null, ac: 0 }), "Lyra · CA 0");
});

test("HUD estado: condições do token e da ficha, sem repetir, com corte de 4 e '+N'", () => {
  const token = { conditions: ["prone", "blinded", "charmed"] };
  const sheet = ownSheet({ system_choices: { conditions: ["prone", "deafened", "frightened"] } });
  const { shown, more } = buildHudConditions(token, sheet);
  assert.equal(HUD_MAX_CONDITIONS, 4);
  assert.equal(shown.length, 4);
  assert.equal(more, 1);
  assert.equal(new Set(shown.map((c) => c.id)).size, 4);
  assert.deepEqual(buildHudConditions(undefined, null), { shown: [], more: 0 });
});

test("HUD estado: PV de token mostra número, rótulo de estado ou traço", () => {
  assert.equal(tokenHpLabel({ hpCurrent: 18, hpMax: 24 }), "18/24");
  assert.equal(tokenHpLabel({ hpCurrent: null, hpMax: null, hpStatus: "Ferido" }), "Ferido");
  assert.equal(tokenHpLabel({ hpCurrent: 3, hpMax: 0 }), "—");
  assert.equal(tokenHpLabel({}), "—");
  assert.equal(tokenHpLabel(undefined), "—");
});

test("HUD estado: grupo lista os outros tokens do jogador, sem repetir o próprio", () => {
  const scene = { tokens: [tok("t1", "ana"), tok("t2", "bia", { hpCurrent: 5, hpMax: 10 }), tok("t3", null, { layer: "gm" })] };
  const m = buildHudStatus(stateWith(ownSheet()), scene);
  assert.deepEqual(m.party.map((p) => [p.tokenId, p.hp]), [["t2", "5/10"]]);
});

test("HUD estado: HTML tem aria-live só no PV próprio, retrato com nome acessível e escapa texto", () => {
  const sheet = ownSheet({ name: "<b>Lyra</b>" });
  const scene = { tokens: [tok("t1", "ana"), tok("t2", "bia", { hpCurrent: 5, hpMax: 10 })] };
  const html = renderHudStatus(stateWith(sheet), scene);
  assert.equal([...html.matchAll(/aria-live/g)].length, 1);
  assert.match(html, /role="img" aria-label="Retrato de &lt;b&gt;Lyra/);
  assert.ok(!html.includes("<b>Lyra"));
  assert.match(html, /data-hud-member="t2"/);
  assert.match(html, /data-hud-mobile-line/);
});

test("HUD estado: o HUD rápido continua depois do bloco de estado", () => {
  const html = renderMapHud({ sheet: { ...ownSheet(), char_id: "ana" } }, { tokens: [tok("t1", "ana")] });
  assert.ok(html.indexOf("mapHudStatus") < html.indexOf('data-dungeon-zone="mapHud"'));
});

function campaignFor(viewer) {
  return {
    sheetsById: { ana: ownSheet(), bia: { ...ownSheet({ character_id: "bia", name: "Bia" }), pools_base: { hp_max: 40 }, inventory_orset: { x: { id: "x" } } } },
    scenesById: { s1: { floors: [{ z: 0 }], tokens: [tok("t1", "ana", { ownerRouteId: "vx_ana", hpVisible: "exact", floorZ: 0 }), tok("t2", "bia", { ownerRouteId: "vx_bia", hpVisible: viewer, floorZ: 0, hpCurrent: 1, hpMax: 1 })] } },
  };
}

test("HUD estado: visão do jogador mostra de outros só PV do token (número ou rótulo) e nada da ficha", () => {
  for (const [mode, expected] of [["exact", "40/40"], ["status", "Ileso"]]) {
    const projected = projectStateForPlayer(campaignFor(mode), "player", "vx_ana");
    const scene = projected.scenesById.s1;
    const html = renderHudStatus({ sheet: projected.sheetsById.ana }, scene);
    assert.match(html, new RegExp(`dungeon-hud-member-hp">${expected}<`), mode);
    assert.ok(!html.includes("Bia") || !html.includes("inventory"), mode);
  }
  const status = renderHudStatus({ sheet: projectStateForPlayer(campaignFor("status"), "player", "vx_ana").sheetsById.ana }, projectStateForPlayer(campaignFor("status"), "player", "vx_ana").scenesById.s1);
  assert.ok(!status.includes("40"));
});
