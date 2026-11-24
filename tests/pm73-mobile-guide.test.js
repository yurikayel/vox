/**
 * @file PM-73 — Testes do guia celular de 5 min e geração de relatório local na UI.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom, settle, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";
import { aggregateFieldReports, sanitizeFieldReport } from "../scripts/mobile-field-report.mjs";
import {
  MOBILE_GUIDE_STEPS,
  buildLocalFieldReport,
  collectMobileEnvironment,
  createGuideState,
  formatLocalFieldReportJson,
  formatLocalFieldReportMarkdown,
  markGuideStep,
  updateGuideEnv,
} from "../client/js/app/mobile-test-guide.js";
import { renderMobileGuideWizard } from "../client/js/render/guided-setup.js";
import { showMobileTestGuide } from "../client/js/app/screens-guided.js";

unrefLongTimers();
URL.createObjectURL = () => "blob:pm73";
URL.revokeObjectURL = () => {};

test("PM-73: coleta ambiente móvel (SO, navegador, classe, RAM e rede) a partir do User-Agent", () => {
  const android = collectMobileEnvironment({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    deviceMemory: 4,
    onLine: true,
    connection: { effectiveType: "4g" },
  });
  assert.equal(android.deviceModel, "celular (Android)");
  assert.equal(android.os, "Android 14");
  assert.equal(android.browser, "Chrome 130");
  assert.equal(android.ramGb, 4);
  assert.equal(android.networkType, "4g");

  const iphone = collectMobileEnvironment({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    onLine: false,
  });
  assert.equal(iphone.deviceModel, "celular (iPhone)");
  assert.equal(iphone.os, "iOS 17");
  assert.equal(iphone.browser, "Safari 17");
  assert.equal(iphone.networkType, "offline");
});

test("PM-73: detecta Samsung Internet, Firefox, Edge, Opera e iPadOS corretamente", () => {
  const samsung = collectMobileEnvironment({
    userAgent: "Mozilla/5.0 (Linux; Android 13; SM-A145M) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
    connection: { type: "wifi" },
  });
  assert.equal(samsung.browser, "Samsung Internet 25");
  assert.equal(samsung.networkType, "wifi");

  const ipad = collectMobileEnvironment({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    maxTouchPoints: 5,
  });
  assert.equal(ipad.deviceModel, "tablet (iPad)");
  assert.equal(ipad.os, "iPadOS");
  assert.equal(ipad.browser, "Safari 17");

  const fx = collectMobileEnvironment({ userAgent: "Mozilla/5.0 (Android 12; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0" });
  assert.equal(fx.browser, "Firefox 128");
});

test("PM-73: marcação de passos é imutável, ignora passos desconhecidos e gera relatório compatível com mobile-field-report.mjs", () => {
  const env = collectMobileEnvironment({
    userAgent: "Mozilla/5.0 (Linux; Android 12; Moto G22) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
    deviceMemory: 4,
    connection: { effectiveType: "4g" },
  });
  let state = createGuideState(env, 1000);
  state = markGuideStep(state, "open_pwa", true, 1200);
  state = markGuideStep(state, "offline_reload", true, 450);
  state = markGuideStep(state, "passo_inexistente", true, 100);
  state = updateGuideEnv(state, { networkType: "wifi" });

  const report = buildLocalFieldReport(state, { generatedAt: "2026-11-23T12:00:00.000Z" });
  assert.equal(report.steps.length, MOBILE_GUIDE_STEPS.length);
  assert.equal(report.steps.find((s) => s.id === "open_pwa").ok, true);
  assert.equal(report.steps.find((s) => s.id === "open_pwa").durationMs, 1200);
  assert.equal(report.steps.find((s) => s.id === "install_a2hs").ok, false);

  const sanitized = sanitizeFieldReport(report);
  assert.equal(sanitized.deviceClass, "celular");
  assert.equal(sanitized.os, "Android 12");
  assert.equal(sanitized.browser, "Chrome 130");
  assert.equal(sanitized.networkType, "wifi");
  assert.equal(sanitized.steps.length, 8);

  const summary = aggregateFieldReports([report]);
  assert.equal(summary.totalReports, 1);
  assert.equal(summary.steps.find((s) => s.id === "open_pwa").passRatePct, 100);
  assert.equal(summary.steps.find((s) => s.id === "offline_reload").medianDurationMs, 450);

  const jsonParsed = JSON.parse(formatLocalFieldReportJson(report));
  assert.equal(jsonParsed.os, "Android 12");
  const md = formatLocalFieldReportMarkdown(report);
  assert.match(md, /Passos aprovados:\*\* 2\/8/);
  assert.match(md, /sem telemetria central/i);
});

test("PM-73: renderMobileGuideWizard escapa HTML em todos os campos dinâmicos", () => {
  const main = { innerHTML: "" };
  renderMobileGuideWizard(main, {
    env: { deviceModel: '<img src=x onerror="alert(1)">', os: "<b>Android</b>", browser: "<script>x()</script>", ramGb: 4, networkType: "wifi" },
    steps: [{ id: 'open_pwa" onclick="x()', title: "<b>Abrir</b>", hint: "<script>evil()</script>" }],
  });
  assert.doesNotMatch(main.innerHTML, /<script>/);
  assert.doesNotMatch(main.innerHTML, /<img src=x/);
  assert.match(main.innerHTML, /&lt;script&gt;/);
  assert.match(main.innerHTML, /&lt;b&gt;Android&lt;\/b&gt;/);
});

function setupMobileGuideDom() {
  const ids = {
    "form-mobile-guide": makeEl(), "mg-preview": makeEl(), "mg-device": makeEl({ value: "celular (iPhone)" }),
    "mg-network": makeEl({ value: "wifi" }), "btn-mg-copy-json": makeEl(), "btn-mg-copy-md": makeEl(),
    "btn-mg-dl-json": makeEl(), "btn-mg-dl-md": makeEl(),
  };
  const stepOpen = makeEl({ checked: false, dataset: { mobileStep: "open_pwa" } });
  const stepOff = makeEl({ checked: false, dataset: { mobileStep: "offline_reload" } });
  const doc = installDom({ ids, all: { "[data-mobile-step]": [stepOpen, stepOff] } });
  return { doc, ids, stepOpen };
}

test("PM-73: showMobileTestGuide opera 100% local (zero fetch/sendBeacon) e exporta JSON/Markdown", async () => {
  localStorage.clear();
  let networkCalls = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("telemetria proibida"); };
  const copied = [];
  const fakeNav = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1",
    onLine: true,
    connection: { type: "wifi" },
    clipboard: { writeText: async (text) => { copied.push(text); } },
    sendBeacon: () => { networkCalls += 1; return false; },
  };
  const origClipboard = globalThis.navigator?.clipboard;
  Object.defineProperty(globalThis.navigator, "clipboard", { value: fakeNav.clipboard, configurable: true });
  try {
    const { doc, ids, stepOpen } = setupMobileGuideDom();
    const controller = await showMobileTestGuide(fakeNav);
    assert.match(doc.main.innerHTML, /form-mobile-guide/);
    stepOpen.checked = true;
    await stepOpen.fire("change");
    await ids["form-mobile-guide"].fire("submit");
    assert.equal(controller.getReport().steps.find((s) => s.id === "open_pwa").ok, true);
    assert.match(ids["mg-preview"].textContent, /Passos aprovados:\*\* 1\/8/);

    await ids["btn-mg-copy-json"].fire("click");
    await ids["btn-mg-copy-md"].fire("click");
    await settle();
    assert.equal(copied.length, 2);
    assert.equal(sanitizeFieldReport(JSON.parse(copied[0])).os, "iOS 17");
    assert.match(copied[1], /Relatório Local/);

    await ids["btn-mg-dl-json"].fire("click");
    await ids["btn-mg-dl-md"].fire("click");
    assert.ok(doc.created.some((e) => e.download === "vox-teste-celular.json"));
    assert.ok(doc.created.some((e) => e.download === "vox-teste-celular.md"));
    assert.equal(networkCalls, 0, "nenhuma chamada de rede ou telemetria pode ocorrer");
  } finally {
    globalThis.fetch = origFetch;
    if (origClipboard !== undefined) Object.defineProperty(globalThis.navigator, "clipboard", { value: origClipboard, configurable: true });
  }
});
