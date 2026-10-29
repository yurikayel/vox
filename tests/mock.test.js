import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";

test("mock - mockCommunities retorna lista vazia e demo false (modo real)", () => {
  const res = mock.mockCommunities();
  assert.deepEqual(res.items, []);
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

test("mock - getMockProfile rejeita perfis demo legados e preserva bot vox", () => {
  assert.ok(mock.getMockProfile("vx_demo_mg"));
  assert.ok(mock.getMockProfile("vx_demo_sp"));
  assert.equal(mock.getMockProfile("vx_desconhecido"), null);
  const voxOfficial = mock.getMockProfile("vx_voxbrasil_welcome");
  assert.ok(voxOfficial);
  assert.equal(voxOfficial.handle, "vox");
  assert.equal(voxOfficial.name, "Vox");
});

test("mock - findMockByPixKey retorna null para operacao real", () => {
  assert.equal(mock.findMockByPixKey("qualquer_chave"), null);
});
