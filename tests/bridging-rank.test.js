import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as bridging from "../client/js/bridging-rank.js";

test("bridging-rank - computeBridgingScore premia consenso cruzado e penaliza polarização", () => {
  // Caso 1: Consenso bilateral alto (80% em A e 80% em B)
  const scoreConsenso = bridging.computeBridgingScore(0.8, 0.8);
  assert.equal(scoreConsenso, 0.64);

  // Caso 2: Polarização extrema (100% em A e 0% em B)
  const scorePolarizado = bridging.computeBridgingScore(1.0, 0.0);
  assert.equal(scorePolarizado, 0.0);

  // Caso 3: Divergência moderada (80% em A e 40% em B)
  const scoreMisto = bridging.computeBridgingScore(0.8, 0.4);
  // 0.8 * 0.4 * (1 - 0.4) = 0.32 * 0.6 = 0.192
  assert.equal(scoreMisto, 0.192);
  assert.ok(scoreConsenso > scoreMisto);
});

test("bridging-rank - ordena comentários priorizando pontes de consenso sobre rage-bait", () => {
  const comments = [
    { id: "c_divisive", text: "Ataque tribal que agrada só um lado" },
    { id: "c_bridge", text: "Proposta de compromisso que une as duas alas" },
    { id: "c_neutral", text: "Comentário irrelevante" },
  ];

  // Simulando 6 eleitores: 3 do grupo A e 3 do grupo B
  const votes = [
    // c_divisive: Grupo A adora (3 concordam), Grupo B odeia (3 discordam)
    { statementId: "c_divisive", voter: "v_a1", vote: 1 },
    { statementId: "c_divisive", voter: "v_a2", vote: 1 },
    { statementId: "c_divisive", voter: "v_a3", vote: 1 },
    { statementId: "c_divisive", voter: "v_b1", vote: -1 },
    { statementId: "c_divisive", voter: "v_b2", vote: -1 },
    { statementId: "c_divisive", voter: "v_b3", vote: -1 },

    // c_bridge: Ambos concordam
    { statementId: "c_bridge", voter: "v_a1", vote: 1 },
    { statementId: "c_bridge", voter: "v_a2", vote: 1 },
    { statementId: "c_bridge", voter: "v_a3", vote: 1 },
    { statementId: "c_bridge", voter: "v_b1", vote: 1 },
    { statementId: "c_bridge", voter: "v_b2", vote: 1 },
    { statementId: "c_bridge", voter: "v_b3", vote: 1 },
  ];

  const ranked = bridging.rankCommentsByBridging(comments, votes);

  // A proposta ponte DEVE ficar em primeiro lugar
  assert.equal(ranked[0].id, "c_bridge");
  assert.equal(ranked[0].isBridge, true);
  assert.ok(ranked[0].bridgeScore > 0.5);

  // O comentário polarizado cai para trás
  const divComment = ranked.find((c) => c.id === "c_divisive");
  assert.equal(divComment.isDivisive, true);
  assert.equal(divComment.bridgeScore, 0);
});

test("bridging-rank - fallback para contagem direta com poucos eleitores (< 4)", () => {
  const comments = [
    { id: "c_1", text: "Primeiro" },
    { id: "c_2", text: "Segundo" },
  ];
  const votes = [
    { statementId: "c_2", voter: "u1", vote: 1 },
    { statementId: "c_2", voter: "u2", vote: 1 },
    { statementId: "c_1", voter: "u1", vote: 1 },
  ];

  const ranked = bridging.rankCommentsByBridging(comments, votes);
  assert.equal(ranked[0].id, "c_2"); // 2 votos > 1 voto
});

test("bridging-rank - shouldApplyConstructiveFriction aciona alerta em alto conflito", () => {
  const groupA = ["u1", "u2"];
  const groupB = ["u3", "u4"];
  const voterMatrix = new Map([
    ["u1", new Map([["c_war", 1]])],
    ["u2", new Map([["c_war", 1]])],
    ["u3", new Map([["c_war", -1]])],
    ["u4", new Map([["c_war", -1]])],
  ]);

  const friction = bridging.shouldApplyConstructiveFriction("c_war", [], groupA, groupB, voterMatrix);
  assert.equal(friction, true);
});
