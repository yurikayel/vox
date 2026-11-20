import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as render from "../client/js/render.js";
import { renderDemoModeBanner } from "../client/js/render/shell.js";
import { MOCK_DEMO_COMMUNITY } from "../client/js/mock.js";

test("DOC-04 - perfil próprio cita malha e arweaveUpload desligado", () => {
  const main = { innerHTML: "" };
  render.renderProfile(main, "vx_self_test", [], true, { activeTab: "about", displayName: "Teste" });
  assert.match(main.innerHTML, /arweaveUpload: false/);
  assert.match(main.innerHTML, /Carteira Arweave \(opcional\)/);
  assert.ok(!main.innerHTML.includes("permanentemente no permaweb"));
});

test("DOC-04 - home comunidade: origem malha vs gateway (não Permaweb)", () => {
  const main = { innerHTML: "" };
  const communities = [
    { id: "a", title: "Malha", description: "x", isLocalP2p: true, memberCount: 2 },
    { id: "b", title: "Espelho", description: "y", isLocalP2p: false, memberCount: 1 },
  ];
  render.renderHome(main, communities);
  assert.match(main.innerHTML, /Na malha/);
  assert.match(main.innerHTML, /Via gateway/);
  assert.ok(!main.innerHTML.includes("Permaweb"));
});

test("DOC-04 - tópico: badge de origem honesta", () => {
  const main = { innerHTML: "" };
  const topic = { id: "t1", title: "Olá", body: "corpo", author: "vx_a", isLocalP2p: false, ts: Date.now() };
  render.renderTopic(main, "t1", topic, []);
  assert.match(main.innerHTML, /Via gateway/);
  assert.ok(!main.innerHTML.includes(">Guardado<"));
});

test("DOC-04 - demo: mock tour e banner citam malha sem permaweb automático", () => {
  assert.match(MOCK_DEMO_COMMUNITY.welcomeRecado, /fictícios/);
  assert.match(MOCK_DEMO_COMMUNITY.description, /sem Arweave/);
  assert.match(renderDemoModeBanner(), /sem gravação Arweave/);
});