import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const flow = await import("../client/js/app/report-flow.js");

test("report-flow - formulário lista todos os motivos e o resultado grave mostra canais oficiais", () => {
  const form = flow.renderReportFormHtml();
  assert.ok(form.includes('name="report-reason"'));
  assert.ok(form.includes("criança ou adolescente"));
  const grave = flow.renderReportDoneHtml({ grave: true, moderatorHash: "#/dm/vx_mod?ctxId=p" });
  assert.ok(grave.includes("SaferNet"));
  assert.ok(grave.includes("Não baixe"));
  assert.ok(grave.includes("btn-report-to-mod"));
  const semMod = flow.renderReportDoneHtml({ grave: false, moderatorHash: "" });
  assert.ok(!semMod.includes("SaferNet"));
  assert.ok(semMod.includes("não tem moderador conhecido"));
});

test("report-flow - resolveModeratorRoute usa a comunidade do post e o dono como moderador", async () => {
  const res = await flow.resolveModeratorRoute("p1", "", {
    getPost: async () => ({ id: "p1", communityId: "bairro" }),
    getCommunity: async (id) => ({ id, owner: "vx_dono" }),
  });
  assert.deepEqual(res, { communityId: "bairro", moderator: "vx_dono" });
  const solto = await flow.resolveModeratorRoute("p2", "", { getPost: async () => ({ id: "p2" }) });
  assert.deepEqual(solto, { communityId: "", moderator: "" });
});
