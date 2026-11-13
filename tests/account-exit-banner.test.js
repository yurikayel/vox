/**
 * ADR-032 §3.5 — faixa "esta conta só existe neste navegador": aparece para quem tem conta sem saída,
 * "Agora não" esconde, e some quando a saída existe. Quem só lê não vê.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "./setup.js";
import * as banner from "../client/js/app/account-exit-banner.js";
import * as accountExit from "../client/js/account-exit.js";
import * as localAccount from "../client/js/local-account.js";

/** Documento mínimo: guarda os elementos anexados ao body e acha por id. */
function fakeDoc() {
  const byId = new Map();
  const make = (id) => ({ id, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, remove() { byId.delete(id); } });
  return {
    byId,
    body: { appendChild(el) { byId.set(el.id, el); byId.set("btnAccountExitLater", make("btnAccountExitLater")); } },
    createElement: () => ({ set innerHTML(_html) { this.firstElementChild = make(banner.EXIT_BANNER_ID); } }),
    getElementById: (id) => byId.get(id) || null,
  };
}

async function freshAccount() {
  localStorage.clear();
  for (const store of mockStores.values()) store.map?.clear();
  return (await localAccount.ensureLocalAccount()).routeId;
}

test("faixa de saída — quem só lê não vê", async () => {
  await freshAccount();
  const doc = fakeDoc();
  assert.equal(await banner.refreshAccountExitBanner({ doc, hasAccount: () => false }), false);
  assert.equal(doc.byId.size, 0);
});

test("faixa de saída — conta sem saída vê; \"Agora não\" tira da tela e não volta logo", async () => {
  await freshAccount();
  const doc = fakeDoc();
  assert.equal(await banner.refreshAccountExitBanner({ doc, hasAccount: () => true }), true);
  assert.ok(doc.getElementById(banner.EXIT_BANNER_ID));
  doc.getElementById("btnAccountExitLater").listeners.click();
  assert.equal(doc.getElementById(banner.EXIT_BANNER_ID), null);
  assert.equal(await banner.refreshAccountExitBanner({ doc, hasAccount: () => true }), false);
});

test("faixa de saída — some quando a conta ganha uma saída", async () => {
  const me = await freshAccount();
  const doc = fakeDoc();
  await banner.refreshAccountExitBanner({ doc, hasAccount: () => true });
  assert.ok(doc.getElementById(banner.EXIT_BANNER_ID));
  accountExit.markAccountExit("email", me);
  assert.equal(await banner.refreshAccountExitBanner({ doc, hasAccount: () => true }), false);
  assert.equal(doc.getElementById(banner.EXIT_BANNER_ID), null);
});

test("faixa de saída — o texto diz que entrar com Google não traz a conta de volta", () => {
  const html = banner.renderAccountExitBannerHtml();
  assert.match(html, /só existe neste navegador/);
  assert.match(html, /Google não traz de volta/);
  assert.ok(html.includes(`href="${banner.EXIT_ROUTE}"`));
});
