import { test } from "node:test";
import assert from "node:assert/strict";
import { applySupporterMode, LIGHT_LIMITS, SUPPORTER_LIMITS } from "../client/js/supporter-mode.js";
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

test("apoiador: ligar não reduz teto ampliado à mão", () => {
  const next = applySupporterMode({ dailyCapMb: 900, maxMb: 400 }, true);
  assert.equal(next.dailyCapMb, 900);
  assert.equal(next.maxMb, 400);
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
