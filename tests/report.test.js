import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as report from "../client/js/report.js";

test("report - LAN-12: buildReport exige post e motivo válido", () => {
  assert.throws(() => report.buildReport({ reason: "spam" }), /Publicação/);
  assert.throws(() => report.buildReport({ postId: "p1", reason: "nada" }), /motivo/);
  const r = report.buildReport({ postId: "p1", reason: "spam", detail: "x".repeat(900) }, 1700000000000);
  assert.equal(r.postId, "p1");
  assert.equal(r.detail.length, report.MAX_DETAIL_LEN);
  assert.match(r.id, /^rep_/);
});

test("report - motivos graves incluem abuso infantil, íntimo não consentido e violência", () => {
  for (const id of ["crianca", "intimo", "violencia"]) assert.equal(report.isGraveReason(id), true, id);
  assert.equal(report.isGraveReason("spam"), false);
  assert.ok(report.OFFICIAL_CHANNELS_PT.some((c) => c.href === "https://new.safernet.org.br/denuncie"));
});

test("report - saveReport guarda no aparelho, deduplica e limita a 200", () => {
  globalThis.localStorage.removeItem(report.REPORTS_STORAGE_KEY);
  const r = report.buildReport({ postId: "p2", reason: "odio" });
  report.saveReport(r);
  report.saveReport(r);
  assert.equal(report.listReports().length, 1);
  assert.equal(report.hasReported("p2"), true);
  for (let i = 0; i < 210; i++) report.saveReport(report.buildReport({ postId: `x${i}`, reason: "spam" }));
  assert.equal(report.listReports().length, report.MAX_REPORTS);
  globalThis.localStorage.removeItem(report.REPORTS_STORAGE_KEY);
});

test("report - DM ao moderador leva só o post e o motivo, nunca quem denunciou", () => {
  const r = report.buildReport({ postId: "p3", reason: "assedio", communityId: "bairro", authorRoute: "vx_autor" });
  const hash = report.buildModeratorDmHash("vx_mod", r);
  assert.ok(hash.startsWith("#/dm/vx_mod?"));
  assert.ok(hash.includes("ctxId=p3"));
  assert.ok(hash.includes("c=bairro"));
  assert.ok(!hash.includes("vx_autor"));
  assert.equal(report.buildModeratorDmHash("", r), "");
});
