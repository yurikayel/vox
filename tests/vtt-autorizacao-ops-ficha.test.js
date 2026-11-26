/**
 * @file Regras de autorização das ops de ficha de jogador: só o dono (token ligado à ficha com o jogador como
 * `ownerRouteId`, ou `owner_pubkey_p256` igual ao autor) altera uma ficha existente; ficha nova de jogador nasce
 * com ele como dono; o Mestre sempre pode.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";
import { isAuthorizedVttOp, reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";

const GM = "vx_gm";
const ANA = "vx_ana";
const BIA = "vx_bia";

function sheet(id, owner = "") {
  return createCharacterSheetDoc({ character_id: id, owner_pubkey_p256: owner });
}

function table() {
  const base = createCampaign({ id: "mesa-ficha", name: "Mesa", gmRouteId: GM, sheetsById: { ficha_ana: sheet("ficha_ana"), ficha_bia: sheet("ficha_bia", BIA) } });
  const scene = base.scenesById[base.activeSceneId];
  const tokens = [{ tokenId: "t-ana", sheetId: "ficha_ana", ownerRouteId: ANA, layer: "player", name: "Ana", x: 1, y: 1 }];
  return { ...base, scenesById: { ...base.scenesById, [base.activeSceneId]: { ...scene, tokens: [...scene.tokens, ...tokens] } } };
}

const op = (type, actor, payload) => createVttOp({ type, actor, payload, lamport: 5, ts: 1 });
const upsert = (actor, id) => op("SHEET_UPSERT", actor, { sheet: sheet(id) });
const delta = (actor, id) => op("SHEET_DELTA", actor, { sheetId: id, target_pool: "hp", delta: -1 });
const act = (actor, id) => op("SHEET_ACTION_UPSERT", actor, { sheetId: id, action: { label: "Golpe" } });
const rem = (actor, id) => op("SHEET_ACTION_REMOVE", actor, { sheetId: id, actionId: "x" });
const ALL = [upsert, delta, act, rem];

test("ficha própria (token ligado ou dono declarado): aceita", () => {
  const t = table();
  for (const make of ALL) assert.equal(isAuthorizedVttOp(t, make(ANA, "ficha_ana")), true, make.name || "op");
  for (const make of ALL) assert.equal(isAuthorizedVttOp(t, make(BIA, "ficha_bia")), true);
});

test("ficha alheia: as quatro ops de ficha são recusadas", () => {
  const t = table();
  for (const make of ALL) {
    assert.equal(isAuthorizedVttOp(t, make(ANA, "ficha_bia")), false);
    assert.equal(isAuthorizedVttOp(t, make(BIA, "ficha_ana")), false);
  }
});

test("ficha sem dono e sem token ligado ao autor: recusada para jogador", () => {
  const t = createCampaign({ id: "m", name: "M", gmRouteId: GM, sheetsById: { solta: sheet("solta") } });
  for (const make of ALL) assert.equal(isAuthorizedVttOp(t, make(ANA, "solta")), false);
});

test("ficha nova do próprio jogador (assistente, antes do token): aceita e nasce com ele de dono", () => {
  const t = table();
  const novo = upsert(ANA, "ficha_nova_ana");
  assert.equal(isAuthorizedVttOp(t, novo), true);
  const depois = reduceCampaign(t, novo);
  assert.equal(depois.sheetsById.ficha_nova_ana.owner_pubkey_p256, ANA);
  assert.equal(isAuthorizedVttOp(depois, delta(ANA, "ficha_nova_ana")), true);
  assert.equal(isAuthorizedVttOp(depois, delta(BIA, "ficha_nova_ana")), false);
});

test("jogador não troca o dono declarado ao regravar a própria ficha", () => {
  const t = table();
  const forjado = op("SHEET_UPSERT", BIA, { sheet: sheet("ficha_bia", ANA) });
  assert.equal(reduceCampaign(t, forjado).sheetsById.ficha_bia.owner_pubkey_p256, BIA);
});

test("ficha sem id é recusada para jogador", () => {
  assert.equal(isAuthorizedVttOp(table(), op("SHEET_UPSERT", ANA, { sheet: { ...sheet("x"), character_id: "" } })), false);
});

test("Mestre sempre pode, em qualquer ficha", () => {
  const t = table();
  for (const make of ALL) for (const id of ["ficha_ana", "ficha_bia", "inexistente"]) assert.equal(isAuthorizedVttOp(t, make(GM, id)), true);
});

test("delta e ações em ficha que não existe são recusados para jogador; só o upsert cria", () => {
  const t = table();
  for (const make of [delta, act, rem]) assert.equal(isAuthorizedVttOp(t, make(ANA, "nao_existe")), false);
});
