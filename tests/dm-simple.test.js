import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

function createContainer() {
  return { innerHTML: "" };
}

const render = await import("../client/js/render.js");

function heroHtmlWithoutAdvanced(html) {
  const idx = html.indexOf('<details class="dm-advanced"');
  return idx >= 0 ? html.slice(0, idx) : html;
}

test("dm list — hero simples sem vx_ visível", () => {
  const main = createContainer();
  const myId = "vx_secreto_nao_mostrar_no_hero";
  render.renderDmList(main, [], myId);
  const html = main.innerHTML;
  assert.ok(html.includes("dm-hero-simple"));
  assert.ok(html.includes("Opções avançadas"));
  assert.ok(html.includes("Nova conversa"));
  assert.ok(html.includes("Copiar meu link"));
  const hero = heroHtmlWithoutAdvanced(html);
  assert.ok(!/vx_[a-z0-9_]+/i.test(hero), "hero não deve exibir id vx_ bruto");
  assert.ok(!hero.includes("Criptografia"), "jargão de cifra fica fora do hero");
});

test("dm list — formulário técnico só em avançado", () => {
  const main = createContainer();
  render.renderDmList(main, [{ peerAddress: "vx_peer1", lastText: "Oi", lastTs: 1 }], "vx_me");
  const html = main.innerHTML;
  assert.ok(html.includes('id="form-new-dm"'));
  assert.ok(html.includes('id="dm-peer-input"'));
  const hero = heroHtmlWithoutAdvanced(html);
  assert.ok(!hero.includes("form-new-dm"), "form de colar código não fica no hero");
});

test("post-pact — link técnico dentro de details", () => {
  const container = createContainer();
  render.renderPostPactConnectModal(container, "vx_testroute123456");
  const html = container.innerHTML;
  assert.ok(html.includes("Convide amigos"));
  assert.ok(html.includes("Ver link técnico"));
  assert.ok(html.includes("#/connect/"));
  const beforeDetails = html.split("<details")[0];
  assert.ok(!beforeDetails.includes("#/connect/"), "URL técnica não aparece acima do details");
});
