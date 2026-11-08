import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";

test("mock - mockCommunities retorna lista com forum oficial vox e demo false (modo real)", () => {
  const res = mock.mockCommunities();
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].id, "vox");
  assert.equal(res.demo, false);
});

test("mock - mockRecentTopics retorna lista vazia e demo false (modo real)", () => {
  const res = mock.mockRecentTopics();
  assert.deepEqual(res.items, []);
  assert.equal(res.demo, false);
});

test("mock - mockTopics retorna lista vazia para qualquer comunidade", () => {
  const tour = mock.mockTopics("qualquer-comunidade");
  assert.deepEqual(tour.items, []);
  assert.equal(tour.demo, false);
});

test("mock - LAN-10: fora do modo demonstração, perfis UF fictícios não resolvem", () => {
  mock.setDemoMode(false);
  assert.equal(mock.isDemoMode(), false);
  assert.equal(mock.getMockProfile("vx_demo_mg"), null);
  assert.equal(mock.getAuthorDisplay("vx_demo_mg"), "");
  assert.equal(mock.getAuthorPixKey("vx_demo_mg"), "");
  assert.equal(mock.findMockByPixKey("alice.mg@voxbrasil.org"), null);
});

test("mock - LAN-10: modo demonstração explícito liga os perfis UF (e chave Pix fictícia)", () => {
  mock.setDemoMode(true);
  try {
    const mg = mock.getMockProfile("vx_demo_mg");
    assert.ok(mg);
    assert.ok(mg.isStereotypeDemo);
    assert.ok(mock.findMockByPixKey(mg.pixKey));
  } finally {
    mock.setDemoMode(false);
  }
});

test("mock - getMockProfile preserva bot vox fora do modo demonstração", () => {
  mock.setDemoMode(false);
  assert.equal(mock.getMockProfile("vx_desconhecido"), null);
  const voxOfficial = mock.getMockProfile("vx_voxbrasil_welcome");
  assert.ok(voxOfficial);
  assert.equal(voxOfficial.handle, "vox");
  assert.equal(voxOfficial.name, "Vox");
});

test("mock - findMockByPixKey retorna null para operacao real", () => {
  assert.equal(mock.findMockByPixKey("qualquer_chave"), null);
});
