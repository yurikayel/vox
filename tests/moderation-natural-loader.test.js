/**
 * @file `moderation.js` recebe o carregador do moderador natural por `setNaturalHideLoader` (ADR-035):
 * sem carregador não há arquivamento natural; com ele, as ações entram; se ele falhar, a moderação segue.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as moderation from "../client/js/moderation.js";

const natural = { id: "nat_p1_vx_eva", action: "natural-hide", target: "p1", naturalVerified: true };

test("moderação - sem carregador ligado não há arquivamento natural", async () => {
  moderation.setNaturalHideLoader(null);
  const actions = await moderation.fetchModActions("c_natural_1");
  assert.equal(actions.some((a) => a.action === "natural-hide"), false);
});

test("moderação - o carregador ligado pela camada app recebe a comunidade e entrega as ações", async () => {
  let asked = null;
  moderation.setNaturalHideLoader(async (communityId, modActions) => {
    asked = { communityId, isList: Array.isArray(modActions) };
    return [natural];
  });
  try {
    const actions = await moderation.fetchModActions("c_natural_2");
    assert.deepEqual(asked, { communityId: "c_natural_2", isList: true });
    assert.ok(actions.some((a) => a.id === natural.id));
  } finally {
    moderation.setNaturalHideLoader(null);
  }
});

test("moderação - carregador que falha não derruba a busca de ações", async () => {
  moderation.setNaturalHideLoader(async () => {
    throw new Error("falhou");
  });
  try {
    const actions = await moderation.fetchModActions("c_natural_3");
    assert.ok(Array.isArray(actions));
  } finally {
    moderation.setNaturalHideLoader(null);
  }
});
