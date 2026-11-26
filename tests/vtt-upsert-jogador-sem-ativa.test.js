/**
 * @file SHEET_UPSERT com `setActive`: só o Mestre troca a ficha ativa da campanha; jogador remoto continua vendo a própria.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { activeSheetAfterUpsert, ownSheetIdFor } from "../client/js/dungeon/vtt-sheet-auth.js";
import { hydrateStateFromCampaign } from "../client/js/dungeon/dungeon-sync-bridge.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { projectStateForPlayer, reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";

const GM = "vx_gm";
const ANA = "vx_ana";
const sheet = (id, owner) => createCharacterSheetDoc({ character_id: id, owner_pubkey_p256: owner, attributes_lww: { name: id } });
const table = () => createCampaign({ id: "mesa", name: "Mesa", gmRouteId: GM, activeSheetId: "ficha_gm", sheetsById: { ficha_gm: sheet("ficha_gm", GM) } });
const upsert = (actor, id, setActive) => createVttOp({ type: "SHEET_UPSERT", actor, lamport: 3, ts: 1, payload: { sheet: sheet(id, actor), setActive } });

test("regra pura: sem ativa na campanha, a ficha gravada vira a ativa mesmo de jogador", () => {
  assert.equal(activeSheetAfterUpsert({ activeSheetId: "" }, { isGm: false, setActive: true, sheetId: "x" }), "x");
  assert.equal(activeSheetAfterUpsert({ activeSheetId: "a" }, { isGm: false, setActive: true, sheetId: "x" }), "a");
});

test("jogador remoto vê a própria ficha; o Mestre e o modo local seguem a ativa", () => {
  const camp = reduceCampaign(table(), upsert(ANA, "ficha_ana", true));
  assert.equal(ownSheetIdFor(camp, ANA), "ficha_ana");
  assert.equal(ownSheetIdFor(camp, "vx_outro"), "");
  const guest = createDungeonSessionState();
  guest.joinMode = "p2p_player";
  guest.vttKeypair = { routeId: ANA };
  hydrateStateFromCampaign(guest, camp);
  assert.equal(guest.sheet.character_id, "ficha_ana");
  const gm = createDungeonSessionState();
  gm.vttKeypair = { routeId: GM };
  hydrateStateFromCampaign(gm, camp);
  assert.equal(gm.sheet.character_id, "ficha_gm");
});

test("Mestre e modo local, donos de outra ficha anterior à ativa, seguem vendo a ativa", () => {
  const camp = createCampaign({ id: "m2", name: "M", gmRouteId: GM, activeSheetId: "ficha_b", sheetsById: { ficha_a: sheet("ficha_a", GM), ficha_b: sheet("ficha_b", GM) } });
  assert.equal(ownSheetIdFor(camp, GM), "ficha_a");
  for (const joinMode of [undefined, "local"]) {
    const s = createDungeonSessionState();
    s.joinMode = joinMode;
    s.vttKeypair = { routeId: GM };
    hydrateStateFromCampaign(s, camp);
    assert.equal(s.sheet.character_id, "ficha_b", String(joinMode));
  }
});

test("jogador p2p sem ficha própria cai na ativa, já projetada (sem notas do Mestre nem campo fora da lista)", () => {
  const base = sheet("ficha_gm", GM);
  const gmSheet = { ...base, secret_field: "campo-secreto", sheet_meta: { ...base.sheet_meta, notes_gm: "segredo" } };
  const camp = createCampaign({ id: "m3", name: "M", gmRouteId: GM, activeSheetId: "ficha_gm", sheetsById: { ficha_antes: sheet("ficha_antes", GM), ficha_gm: gmSheet } });
  const guest = createDungeonSessionState();
  guest.joinMode = "p2p_player";
  guest.vttKeypair = { routeId: ANA };
  hydrateStateFromCampaign(guest, projectStateForPlayer(camp, "player", ANA));
  assert.equal(guest.sheet.character_id, "ficha_gm");
  const dump = JSON.stringify(guest.sheet);
  assert.ok(!dump.includes("segredo") && !dump.includes("campo-secreto") && !dump.includes("secret_field"));
  assert.equal(guest.sheet.sheet_meta.notes_gm, "");
});
