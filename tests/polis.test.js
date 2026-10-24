import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as polis from "../client/js/polis.js";

test("polis - normalização de votos", () => {
  assert.equal(polis.normalizePolisVote("agree"), polis.VOTE_AGREE);
  assert.equal(polis.normalizePolisVote("concordo"), polis.VOTE_AGREE);
  assert.equal(polis.normalizePolisVote(1), polis.VOTE_AGREE);

  assert.equal(polis.normalizePolisVote("disagree"), polis.VOTE_DISAGREE);
  assert.equal(polis.normalizePolisVote("discordo"), polis.VOTE_DISAGREE);
  assert.equal(polis.normalizePolisVote(-1), polis.VOTE_DISAGREE);

  assert.equal(polis.normalizePolisVote("pass"), polis.VOTE_PASS);
  assert.equal(polis.normalizePolisVote(0), polis.VOTE_PASS);
  assert.equal(polis.normalizePolisVote(null), polis.VOTE_PASS);
});

test("polis - computeStatementStats calcula percentuais e variância", () => {
  const votes = [
    { statementId: "s1", voter: "v1", vote: 1 },
    { statementId: "s1", voter: "v2", vote: 1 },
    { statementId: "s1", voter: "v3", vote: -1 },
    { statementId: "s1", voter: "v4", vote: 0 },
  ];

  const stats = polis.computeStatementStats("s1", votes);
  assert.equal(stats.total, 4);
  assert.equal(stats.agrees, 2);
  assert.equal(stats.disagrees, 1);
  assert.equal(stats.passes, 1);
  assert.equal(stats.agreePct, 50);
  assert.equal(stats.disagreePct, 25);
  assert.equal(stats.passPct, 25);
  assert.ok(stats.variance > 0);
});

test("polis - detecção de pontes de consenso vs pontos divisivos", () => {
  const statements = [
    { id: "s_bridge", text: "Merenda escolar deve priorizar agricultura familiar local" },
    { id: "s_divisive", text: "Abertura do comércio aos domingos sem taxa sindical" },
  ];

  // 6 eleitores: 3 progressistas (p1..p3) e 3 liberais (l1..l3)
  const votes = [
    // s_bridge: Ambos concordam
    { statementId: "s_bridge", voter: "p1", vote: 1 },
    { statementId: "s_bridge", voter: "p2", vote: 1 },
    { statementId: "s_bridge", voter: "p3", vote: 1 },
    { statementId: "s_bridge", voter: "l1", vote: 1 },
    { statementId: "s_bridge", voter: "l2", vote: 1 },
    { statementId: "s_bridge", voter: "l3", vote: 1 },

    // s_divisive: Progressistas discordam (-1), liberais concordam (+1)
    { statementId: "s_divisive", voter: "p1", vote: -1 },
    { statementId: "s_divisive", voter: "p2", vote: -1 },
    { statementId: "s_divisive", voter: "p3", vote: -1 },
    { statementId: "s_divisive", voter: "l1", vote: 1 },
    { statementId: "s_divisive", voter: "l2", vote: 1 },
    { statementId: "s_divisive", voter: "l3", vote: 1 },
  ];

  const report = polis.computePolisReport(statements, votes);

  assert.equal(report.totalVoters, 6);
  assert.equal(report.totalStatements, 2);

  // Deve identificar s_bridge como ponte
  const bridgeIds = report.bridgeStatements.map((b) => b.id);
  assert.ok(bridgeIds.includes("s_bridge"));
  assert.ok(!bridgeIds.includes("s_divisive"));

  // Deve identificar s_divisive como divisivo
  const divisiveIds = report.divisiveStatements.map((d) => d.id);
  assert.ok(divisiveIds.includes("s_divisive"));
  assert.ok(!divisiveIds.includes("s_bridge"));
});
