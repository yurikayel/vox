import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as storagePersistence from "../client/js/storage-persistence.js";

test("storage-persistence - detecta Safari em aba normal e standalone", () => {
  const safariIosUa =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const chromeAndroidUa =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const desktopChromeUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  assert.equal(storagePersistence.isSafariNormalTab(safariIosUa), true);
  assert.equal(storagePersistence.isSafariNormalTab(chromeAndroidUa), false);
  assert.equal(storagePersistence.isSafariNormalTab(desktopChromeUa), false);
});

test("storage-persistence - controla estado de dismiss do prompt Safari", () => {
  localStorage.removeItem(storagePersistence.STORAGE_DISMISSED_KEY);

  assert.equal(storagePersistence.dismissSafariHomePrompt(), true);
  assert.equal(localStorage.getItem(storagePersistence.STORAGE_DISMISSED_KEY), "true");
});

test("storage-persistence - gera HTML semântico com alerta ITP de 7 dias", () => {
  const html = storagePersistence.renderSafariHomeBannerHtml();
  assert.ok(html.includes("limpeza automática de 7 dias do Safari (ITP)"));
  assert.ok(html.includes("Adicionar à Tela de Início"));
  assert.ok(html.includes('role="region"'));
});

test("storage-persistence - lida de forma graciosa com navigator.storage ausente em Node", async () => {
  const persistRes = await storagePersistence.requestPersistence();
  assert.equal(persistRes.persisted, false);

  const checkRes = await storagePersistence.checkPersistence();
  assert.equal(checkRes, false);

  const estRes = await storagePersistence.estimateStorage();
  assert.equal(estRes.quota, 0);
  assert.equal(estRes.usage, 0);
});
