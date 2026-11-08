import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as pn from "../client/js/permanence-notice.js";

test("permanence-notice - LAN-11: sem escolha lembrada, pergunta; 'só na malha' não grava", async () => {
  pn.setPermanenceChoice("");
  let asked = 0;
  const ok = await pn.confirmPermanentPublish({ ask: async () => { asked++; return { choice: pn.CHOICE_MESH, remember: false }; } });
  assert.equal(ok, false);
  assert.equal(asked, 1);
  assert.equal(pn.getPermanenceChoice(), "");
});

test("permanence-notice - escolha lembrada evita perguntar de novo", async () => {
  pn.setPermanenceChoice("");
  await pn.confirmPermanentPublish({ ask: async () => ({ choice: pn.CHOICE_PERMANENT, remember: true }) });
  assert.equal(pn.getPermanenceChoice(), pn.CHOICE_PERMANENT);
  const ok = await pn.confirmPermanentPublish({ ask: async () => { throw new Error("não deveria perguntar"); } });
  assert.equal(ok, true);
  pn.setPermanenceChoice("");
});

test("permanence-notice - sem DOM, o padrão é não gravar (nunca sem consentimento)", async () => {
  const res = await pn.askPermanenceChoice(null);
  assert.equal(res.choice, pn.CHOICE_MESH);
});

test("permanence-notice - o texto diz que é público, permanente e que não dá para apagar", () => {
  const html = pn.renderPermanenceModalHtml();
  assert.match(html, /permanente/);
  assert.match(html, /apagar/);
  assert.match(html, /dados pessoais/);
  assert.ok(html.includes("btn-permanence-permanent") && html.includes("btn-permanence-mesh"));
});
