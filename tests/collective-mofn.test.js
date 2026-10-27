import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mofn from "../client/js/labs/collective-mofn.js";
import { renderMofnLab } from "../client/js/labs/mofn-lab.js";

async function threeMembersDraft(threshold = 2) {
  const members = [await mofn.generateMember(), await mofn.generateMember(), await mofn.generateMember()];
  const draft = mofn.createDraft({
    name: "Sindicato lab",
    members,
    threshold,
    statement: "Manifesto local M-de-N",
    issuedAt: 1,
  });
  return { members, draft };
}

test("collective-mofn - M-of-N válido passa", async () => {
  const { members, draft } = await threeMembersDraft(2);
  const signed = await mofn.signWithMembers(draft, members, 2);
  const result = await mofn.verifyManifest(signed);
  assert.equal(result.ok, true);
  assert.equal(result.validCount, 2);
  assert.equal(result.required, 2);
  assert.ok(members[0].routeId.startsWith("vx_"));
  assert.equal(members[0].publicJwk.crv, "P-256");
});

test("collective-mofn - M-1 falha", async () => {
  const { members, draft } = await threeMembersDraft(2);
  const signed = await mofn.signWithMembers(draft, members, 1);
  const result = await mofn.verifyManifest(signed);
  assert.equal(result.ok, false);
  assert.equal(result.validCount, 1);
  assert.equal(result.reason, "below-threshold");
});

test("collective-mofn - payload adulterado falha", async () => {
  const { members, draft } = await threeMembersDraft(2);
  const signed = await mofn.signWithMembers(draft, members, 2);
  const tampered = { ...signed, statement: "texto adulterado" };
  const result = await mofn.verifyManifest(tampered);
  assert.equal(result.ok, false);
  assert.equal(result.validCount, 0);
});

test("collective-mofn - lab UI declara tese e não perfil", () => {
  const html = renderMofnLab();
  assert.match(html, /Perfil coletivo é tese\/lab; sua conta continua 1 chave neste aparelho/);
  assert.match(html, /#\/perfil/);
  assert.match(html, /Sem IndexedDB/);
});
