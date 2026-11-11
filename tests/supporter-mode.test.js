import { test } from "node:test";
import assert from "node:assert/strict";
import { applySupporterMode, normalizeStorageCommitment, LIGHT_LIMITS, SUPPORTER_LIMITS } from "../client/js/supporter-mode.js";
import { renderSupporterCardHtml } from "../client/js/render/network.js";

test("apoiador: ligar sobe tetos, força Wi-Fi e reativa o nó", () => {
  const next = applySupporterMode({ enabled: false, wifiOnly: false, dailyCapMb: 50, maxMb: 25, commOnly: true }, true);
  assert.equal(next.supporter, true);
  assert.equal(next.enabled, true);
  assert.equal(next.wifiOnly, true);
  assert.equal(next.commOnly, true);
  assert.equal(next.dailyCapMb, SUPPORTER_LIMITS.dailyCapMb);
  assert.equal(next.maxMb, SUPPORTER_LIMITS.maxMb);
});

test("apoiador: ligar começa no disco máximo com banda proporcional", () => {
  const next = applySupporterMode({ dailyCapMb: 900, maxMb: 400 }, true);
  assert.equal(next.maxMb, 1024);
  assert.equal(next.dailyCapMb, 2048);
});

test("disco: nó leve fixo em 100 MB; apoiador entre 512 e 1024 MB", () => {
  assert.equal(normalizeStorageCommitment({ maxMb: 900 }).maxMb, 100);
  assert.equal(normalizeStorageCommitment({ supporter: true, maxMb: 200 }).maxMb, 512);
  assert.equal(normalizeStorageCommitment({ supporter: true, maxMb: 5000 }).maxMb, 1024);
  assert.equal(normalizeStorageCommitment({ supporter: true, maxMb: 700 }).maxMb, 700);
});

test("banda: até o dobro do disco; menos que isso é escolha da pessoa", () => {
  assert.equal(normalizeStorageCommitment({}).dailyCapMb, 200);
  assert.equal(normalizeStorageCommitment({ dailyCapMb: 900 }).dailyCapMb, 200);
  assert.equal(normalizeStorageCommitment({ dailyCapMb: 50 }).dailyCapMb, 50);
  assert.equal(normalizeStorageCommitment({ supporter: true, maxMb: 600, dailyCapMb: 5000 }).dailyCapMb, 1200);
});

test("apoiador: desligar volta aos tetos do nó leve", () => {
  const next = applySupporterMode({ supporter: true, dailyCapMb: 500, maxMb: 250, enabled: true }, false);
  assert.equal(next.supporter, false);
  assert.equal(next.enabled, true);
  assert.equal(next.dailyCapMb, LIGHT_LIMITS.dailyCapMb);
  assert.equal(next.maxMb, LIGHT_LIMITS.maxMb);
});

test("apoiador: card mostra botão de opt-in ou de saída", () => {
  assert.match(renderSupporterCardHtml({}), /Seja um apoiador da rede/);
  assert.match(renderSupporterCardHtml({ supporter: true }), /Voltar ao nó leve/);
});
