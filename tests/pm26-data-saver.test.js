import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  MONTHLY_USAGE_KEY,
  getDailyUsage,
  getMonthlyUsage,
  recordBytesServed,
  isDataSaverActive,
} from "../client/js/peers-settings.js";
import { renderNetworkStats } from "../client/js/render/network-sections.js";

test("PM-26: acúmulo diário e mensal de bytes servidos", () => {
  localStorage.clear();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const initialDaily = getDailyUsage();
  const initialMonthly = getMonthlyUsage();

  assert.equal(initialDaily.bytesServedToday, 0);
  assert.equal(initialMonthly.month, currentMonth);
  assert.equal(initialMonthly.bytesServedMonth, 0);
  assert.equal(initialMonthly.bytesCellularMonth, 0);

  recordBytesServed(1024 * 1024, false);
  const afterFirst = getMonthlyUsage();
  assert.equal(afterFirst.bytesServedMonth, 1024 * 1024);
  assert.equal(afterFirst.bytesCellularMonth, 0);

  recordBytesServed(512 * 1024, false);
  const afterSecond = getMonthlyUsage();
  const daily = getDailyUsage();
  assert.equal(daily.bytesServedToday, 1536 * 1024);
  assert.equal(afterSecond.bytesServedMonth, 1536 * 1024);
  assert.equal(afterSecond.bytesCellularMonth, 0);
});

test("PM-26: acúmulo de bytesCellularMonth em rede celular e saveData", () => {
  localStorage.clear();
  recordBytesServed(2 * 1024 * 1024, true);
  let monthly = getMonthlyUsage();
  assert.equal(monthly.bytesServedMonth, 2 * 1024 * 1024);
  assert.equal(monthly.bytesCellularMonth, 2 * 1024 * 1024);

  globalThis.navigator.connection = { type: "cellular", saveData: false };
  recordBytesServed(1024 * 1024);
  monthly = getMonthlyUsage();
  assert.equal(monthly.bytesServedMonth, 3 * 1024 * 1024);
  assert.equal(monthly.bytesCellularMonth, 3 * 1024 * 1024);

  globalThis.navigator.connection = { type: "wifi", saveData: true };
  recordBytesServed(1024 * 1024);
  monthly = getMonthlyUsage();
  assert.equal(monthly.bytesServedMonth, 4 * 1024 * 1024);
  assert.equal(monthly.bytesCellularMonth, 4 * 1024 * 1024);

  delete globalThis.navigator.connection;
});

test("PM-26: virada automática de mês UTC zera acumulado anterior e trata JSON inválido", () => {
  localStorage.clear();
  const staleData = { month: "2024-01", bytesServedMonth: 40000000, bytesCellularMonth: 10000000 };
  localStorage.setItem(MONTHLY_USAGE_KEY, JSON.stringify(staleData));

  const current = getMonthlyUsage();
  assert.equal(current.bytesServedMonth, 0);
  assert.equal(current.bytesCellularMonth, 0);
  assert.equal(getMonthlyUsage("2024-01").bytesServedMonth, 40000000);

  recordBytesServed(1024, false);
  const updated = getMonthlyUsage();
  assert.equal(updated.bytesServedMonth, 1024);

  localStorage.setItem(MONTHLY_USAGE_KEY, "invalido{json");
  const fallback = getMonthlyUsage();
  assert.equal(fallback.bytesServedMonth, 0);
  assert.equal(fallback.bytesCellularMonth, 0);
});

test("PM-26: detecção ativa de economia de dados com isDataSaverActive()", () => {
  delete globalThis.navigator.connection;
  assert.equal(isDataSaverActive(), false);

  globalThis.navigator.connection = { type: "wifi", saveData: false };
  assert.equal(isDataSaverActive(), false);

  globalThis.navigator.connection = { type: "cellular", saveData: false };
  assert.equal(isDataSaverActive(), true);

  globalThis.navigator.connection = { type: "wifi", saveData: true };
  assert.equal(isDataSaverActive(), true);

  globalThis.navigator.connection = { type: "cellular", saveData: true };
  assert.equal(isDataSaverActive(), true);

  delete globalThis.navigator.connection;
});

test("PM-26: renderNetworkStats exibe acumulado do mês e indicador de economia de dados", () => {
  localStorage.clear();
  globalThis.navigator.connection = { type: "wifi", saveData: false };

  const daily = { bytesServedToday: 5 * 1024 * 1024, bytesCellularToday: 1 * 1024 * 1024 };
  const monthly = { month: "2026-11", bytesServedMonth: 15 * 1024 * 1024, bytesCellularMonth: 4 * 1024 * 1024 };
  const settings = { dailyCapMb: 100 };
  const htmlWifi = renderNetworkStats({ blobsServed: 10, bytesServed: 2048 }, { count: 2, sizeKb: "64" }, daily, settings, monthly);

  assert.ok(htmlWifi.includes("Uso hoje (5%) · 4G: 1.0 MB"));
  assert.ok(htmlWifi.includes("No mês: 15.0 MB · 4G: 4.0 MB"));
  assert.ok(!htmlWifi.includes("Economia de dados / 4G ativa"));

  globalThis.navigator.connection = { type: "cellular", saveData: true };
  const htmlCell = renderNetworkStats({}, {}, daily, settings, monthly);
  assert.ok(htmlCell.includes("Economia de dados / 4G ativa"));

  const htmlDefault = renderNetworkStats({}, {}, {}, {});
  assert.ok(htmlDefault.includes("No mês: 0.0 MB · 4G: 0.0 MB"));

  delete globalThis.navigator.connection;
});
