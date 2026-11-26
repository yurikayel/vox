/**
 * @file Projeção do jogador: campos internos de fichas alheias ficam fora; o PV delas segue pelo token.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { projectStateForPlayer } from "../client/js/dungeon/vtt-reducer.js";
import { buildPartyView } from "../client/js/dungeon/party-view-model.js";
import { tokenHp } from "../client/js/dungeon/token-ficha.js";

const sheet = (id, hpMax) => ({
  character_id: id,
  campaign_id: "camp",
  name: id,
  role_title: "Bardo",
  owner_pubkey_p256: "chave",
  attributes_lww: { name: id, level: 2, armor_class: 15, class_name: "Bardo", abilities: { str: 8 }, conditions: ["prone"] },
  pools_base: { hp_max: hpMax },
  delta_ledger: [],
  inventory_orset: { adaga: { id: "adaga", qty: 1 } },
  system_choices: { conditions: ["prone"] },
  spatial_state: { x: 1 },
  sheet_meta: { notes_gm: "x", favorites: ["adaga"] },
});
const token = (tokenId, sheetId, ownerRouteId, hpVisible) => ({
  tokenId, sheetId, ownerRouteId, hpVisible, layer: "player", floorZ: 0, x: 1, y: 1, hpCurrent: 1, hpMax: 1,
});

function campaign(hpVisible = "exact") {
  return {
    sheetsById: { ana: sheet("ana", 30), bia: sheet("bia", 22) },
    scenesById: {
      s1: {
        floors: [{ z: 0 }],
        tokens: [token("t-ana", "ana", "vx_ana", "exact"), token("t-bia", "bia", "vx_bia", hpVisible)],
      },
    },
  };
}

test("ficha alheia chega só com a lista de permissão; a própria chega completa", () => {
  const view = projectStateForPlayer(campaign(), "player", "vx_ana");
  assert.deepEqual(view.sheetsById.bia, {
    character_id: "bia",
    campaign_id: "camp",
    name: "bia",
    attributes_lww: { name: "bia", armor_class: 15 },
  });
  assert.equal(view.sheetsById.ana.pools_base.hp_max, 30);
  assert.deepEqual(view.sheetsById.ana.sheet_meta.favorites, ["adaga"]);
  assert.ok(view.sheetsById.ana.inventory_orset.adaga);
});

test("cada campo fora da lista some da ficha alheia", () => {
  const bia = projectStateForPlayer(campaign(), "player", "vx_ana").sheetsById.bia;
  for (const key of ["pools_base", "delta_ledger", "inventory_orset", "system_choices", "spatial_state", "sheet_meta", "role_title", "owner_pubkey_p256"]) {
    assert.equal(bia[key], undefined, key);
  }
  for (const key of ["level", "class_name", "abilities", "conditions"]) assert.equal(bia.attributes_lww[key], undefined, key);
});

test("sem identidade, nenhuma ficha vem completa", () => {
  const view = projectStateForPlayer(campaign(), "player", "");
  assert.equal(view.sheetsById.ana.pools_base, undefined);
  assert.equal(view.sheetsById.bia.inventory_orset, undefined);
});

test("o Mestre vê tudo, como antes", () => {
  const view = projectStateForPlayer(campaign(), "gm", "vx_gm");
  assert.equal(view.sheetsById.bia.pools_base.hp_max, 22);
  assert.deepEqual(view.sheetsById.bia.delta_ledger, []);
  assert.ok(view.sheetsById.bia.inventory_orset.adaga);
});

test("PV alheio vem pelo token: número com hpVisible exact, só rótulo com status", () => {
  const exact = projectStateForPlayer(campaign("exact"), "player", "vx_ana").scenesById.s1.tokens[1];
  assert.equal(exact.hpCurrent, 22);
  assert.equal(exact.hpMax, 22);
  const status = projectStateForPlayer(campaign("status"), "player", "vx_ana").scenesById.s1.tokens[1];
  assert.equal(status.hpCurrent, null);
  assert.equal(status.hpMax, null);
  assert.equal(status.hpStatus, "Ileso");
  assert.ok(!JSON.stringify(status).includes("22"));
});

test("painel do grupo e tokenHp mostram o PV certo com a projeção", () => {
  const camp = projectStateForPlayer(campaign("exact"), "player", "vx_ana");
  const view = buildPartyView({ campaign: camp });
  assert.deepEqual(view.map((m) => m.hp), ["30 / 30 PV", "22 / 22 PV"]);
  assert.deepEqual(tokenHp(camp.scenesById.s1.tokens[1], camp.sheetsById.bia), { hpCurrent: 22, hpMax: 22 });
});

test("painel do grupo mostra só o rótulo quando o PV alheio está em status", () => {
  const camp = projectStateForPlayer(campaign("status"), "player", "vx_ana");
  assert.equal(buildPartyView({ campaign: camp })[1].hp, "Ileso");
});

test("token da ficha própria não é reescrito pela projeção", () => {
  const own = projectStateForPlayer(campaign(), "player", "vx_ana").scenesById.s1.tokens[0];
  assert.equal(own.hpCurrent, 1);
  assert.equal(own.hpMax, 1);
});

test("painel do grupo: classe e nível de ficha alheia ficam sem dado", () => {
  const camp = projectStateForPlayer(campaign("exact"), "player", "vx_ana");
  const [own, other] = buildPartyView({ campaign: camp });
  assert.equal(own.level, "2");
  assert.equal(other.level, "—");
  assert.equal(other.role, "—");
});
