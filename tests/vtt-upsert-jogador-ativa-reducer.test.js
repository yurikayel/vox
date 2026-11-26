/**
 * @file SHEET_UPSERT com `setActive` pela API do reducer (sem módulos novos): só o Mestre troca a ficha ativa da campanha.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";

const GM = "vx_gm";
const ANA = "vx_ana";
const sheet = (id, owner) => createCharacterSheetDoc({ character_id: id, owner_pubkey_p256: owner, attributes_lww: { name: id } });
const table = () => createCampaign({ id: "mesa", name: "Mesa", gmRouteId: GM, activeSheetId: "ficha_gm", sheetsById: { ficha_gm: sheet("ficha_gm", GM) } });
const upsert = (actor, id, setActive) => createVttOp({ type: "SHEET_UPSERT", actor, lamport: 3, ts: 1, payload: { sheet: sheet(id, actor), setActive } });

test("jogador com setActive: a ficha entra, é dele, e a ativa não muda", () => {
  const out = reduceCampaign(table(), upsert(ANA, "ficha_ana", true));
  assert.equal(out.activeSheetId, "ficha_gm");
  assert.equal(out.sheetsById.ficha_ana.owner_pubkey_p256, ANA);
});

test("Mestre com setActive troca a ativa; sem setActive mantém", () => {
  assert.equal(reduceCampaign(table(), upsert(GM, "ficha_nova", true)).activeSheetId, "ficha_nova");
  assert.equal(reduceCampaign(table(), upsert(GM, "ficha_nova", false)).activeSheetId, "ficha_gm");
});
