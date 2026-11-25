/**
 * @file Admissão ao Fairplay é ato exclusivo do Mestre: o filtro de autoria recusa `FAIRPLAY_ADMIT` de jogador.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { isAuthorizedVttOp } from "../client/js/dungeon/vtt-reducer.js";

test("FAIRPLAY_ADMIT: só o Mestre é autor autorizado", () => {
  const state = createCampaign({ id: "camp-admit", name: "Mesa", gmRouteId: "vx_gm" });
  const admit = (actor) => createVttOp({ type: "FAIRPLAY_ADMIT", actor, payload: { actor: "vx_p1" }, lamport: 1 });
  assert.equal(isAuthorizedVttOp(state, admit("vx_p1")), false, "jogador não admite a si nem a outro");
  assert.equal(isAuthorizedVttOp(state, admit("vx_gm")), true);
});
