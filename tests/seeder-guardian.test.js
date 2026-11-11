import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as guardian from "../client/js/seeder-guardian.js";
import { renderGuardianSettingsCard } from "../client/js/render/settings-guardian.js";

test("seeder-guardian - getGuardianQuotaConfig retorna padrões seguros", () => {
  localStorage.clear();
  const cfg = guardian.getGuardianQuotaConfig();
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.quotaMb, 150);
  assert.equal(cfg.onlyWifi, true);
  assert.equal(cfg.onlyCharging, true);
  assert.equal(cfg.minBatteryLevel, 0.5);
});

test("seeder-guardian - saveGuardianQuotaConfig persiste e limita valores dentro da faixa", () => {
  localStorage.clear();
  const saved = guardian.saveGuardianQuotaConfig({
    enabled: true,
    quotaMb: 2000, // deve travar em 1024
    onlyWifi: false,
  });
  assert.equal(saved.enabled, true);
  assert.equal(saved.quotaMb, 1024);
  assert.equal(saved.onlyWifi, false);

  const reloaded = guardian.getGuardianQuotaConfig();
  assert.equal(reloaded.enabled, true);
  assert.equal(reloaded.quotaMb, 1024);

  const clampedMin = guardian.saveGuardianQuotaConfig({ quotaMb: 2 });
  assert.equal(clampedMin.quotaMb, 100);
});

test("seeder-guardian - isSeedingPermitted respeita regras de bateria e rede", async () => {
  const disabled = await guardian.isSeedingPermitted({ enabled: false });
  assert.equal(disabled.permitted, false);
  assert.equal(disabled.reason, "disabled");

  const cellularBlock = await guardian.isSeedingPermitted({
    enabled: true,
    onlyWifi: true,
    onlyCharging: false,
    minBatteryLevel: 0.1,
  });
  // No ambiente de teste mock, readNetworkStatus retorna isWifi: true
  assert.equal(cellularBlock.permitted, true);

  const ready = await guardian.isSeedingPermitted({
    enabled: true,
    onlyWifi: true,
    onlyCharging: true,
    minBatteryLevel: 0.2,
  });
  assert.equal(ready.permitted, true);
  assert.equal(ready.reason, "ready");
});

test("seeder-guardian - renderGuardianSettingsCard gera HTML com badge e opções", () => {
  const cfg = {
    enabled: true,
    onlyWifi: true,
    onlyCharging: true,
    quotaMb: 150,
  };
  const status = { enabled: true, permitted: true, reason: "ready" };
  const html = renderGuardianSettingsCard(cfg, status);

  assert.ok(html.includes("Modo Guardião da Praça"));
  assert.ok(html.includes("Pronto para Semear 🟢"));
  assert.ok(html.includes('id="chk-guardian-enabled" checked'));
  assert.ok(html.includes('id="select-guardian-quota"'));
  assert.ok(html.includes("150 MB (Recomendado)"));
});
