import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SIGV2_FROM } from "../client/js/sig-format.js";
import { TEST_ROUTE_IDS } from "../client/js/data/test-route-ids.js";
import {
  auditCutoverBatch,
  checkOutboundRehearsalLeak,
  evaluateSigv2Policy,
  runCli,
} from "../scripts/sigv2-cutover-check.mjs";

test("PM-102: fronteira exata de SIGV2_FROM (v1 antes, recusado a partir do corte, v2 aceito)", () => {
  const before = evaluateSigv2Policy({ id: "p1", ts: SIGV2_FROM - 1 });
  assert.equal(before.ok, true);
  assert.equal(before.status, "v1_legacy_allowed");

  const atCutover = evaluateSigv2Policy({ id: "p2", ts: SIGV2_FROM });
  assert.equal(atCutover.ok, false);
  assert.equal(atCutover.code, "v1_rejected_post_cutover");

  const v2AtCutover = evaluateSigv2Policy({ id: "p3", sigv: 2, ts: SIGV2_FROM });
  assert.equal(v2AtCutover.ok, true);
  assert.equal(v2AtCutover.status, "v2_valid");
});

test("PM-102: respeita graceMs e recusa fail-closed sigv desconhecido ou v1 sem timestamp", () => {
  const inGrace = evaluateSigv2Policy({ id: "g1", createdAt: SIGV2_FROM + 500 }, { graceMs: 1000 });
  assert.equal(inGrace.ok, true);
  assert.equal(inGrace.status, "v1_legacy_allowed");

  const unknown = evaluateSigv2Policy({ id: "u1", sigv: 3, ts: SIGV2_FROM });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "unknown_sigv");

  const missingTs = evaluateSigv2Policy({ id: "m1" });
  assert.equal(missingTs.ok, false);
  assert.equal(missingTs.code, "v1_missing_timestamp");
});

test("PM-100: detecta vazamento de modo ensaio e contas de teste em filas de rede", () => {
  const clean = checkOutboundRehearsalLeak({ id: "ok1", author: "vx_cidadao_real", sigv: 2 });
  assert.equal(clean.leaked, false);

  const byFlag = checkOutboundRehearsalLeak({ id: "r1", rehearsal: true, mode: "rehearsal" });
  assert.equal(byFlag.leaked, true);
  assert.deepEqual(byFlag.reasons, ["rehearsal_flag", "rehearsal_mode"]);

  const byTestId = checkOutboundRehearsalLeak({ id: "r2", author: TEST_ROUTE_IDS[0] });
  assert.equal(byTestId.leaked, true);
  assert.ok(byTestId.reasons.includes("test_route_id"));

  const byPrefix = checkOutboundRehearsalLeak({ id: "r3", owner: "rehearsal_local_01" });
  assert.equal(byPrefix.leaked, true);
  assert.ok(byPrefix.reasons.includes("rehearsal_author_prefix"));
});

test("PM-102 + PM-100: CLI retorna exit 0 para lote limpo e exit 1 quando há violação", () => {
  const dir = mkdtempSync(join(tmpdir(), "vox-pm102-"));
  try {
    const okPath = join(dir, "ok.json");
    const badPath = join(dir, "bad.json");
    writeFileSync(okPath, JSON.stringify([
      { id: "old1", ts: SIGV2_FROM - 10_000, author: "vx_ok" },
      { id: "new1", sigv: 2, ts: SIGV2_FROM + 10_000, author: "vx_ok" },
    ]), "utf8");
    writeFileSync(badPath, JSON.stringify([
      { id: "bad1", ts: SIGV2_FROM + 1000, author: "vx_ok" },
      { id: "leak1", sigv: 2, ts: SIGV2_FROM + 2000, rehearsal: true, author: "vx_ok" },
    ]), "utf8");

    const rOk = runCli(["--input", okPath, "--check-rehearsal", "--json"]);
    assert.equal(rOk.code, 0);
    assert.equal(JSON.parse(rOk.output).ok, true);

    const rBad = runCli(["--input", badPath, "--check-rehearsal", "--json"]);
    assert.equal(rBad.code, 1);
    const parsed = JSON.parse(rBad.output);
    assert.equal(parsed.summary.rejected, 1);
    assert.equal(parsed.summary.rehearsalLeaks, 1);
    assert.equal(auditCutoverBatch([]).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
