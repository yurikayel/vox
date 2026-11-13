import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flow = await import("../client/js/app/storage-durability-flow.js");

/** Módulo de persistência falso, que conta as chamadas. */
function fakePersistence({ persisted = false, grant = true, safari = false } = {}) {
  const calls = { request: 0, dismiss: 0 };
  return {
    calls,
    checkPersistence: async () => persisted,
    requestPersistence: async () => { calls.request += 1; return { persisted: grant, isSupported: true }; },
    shouldShowSafariHomePrompt: () => safari,
    dismissSafariHomePrompt: () => { calls.dismiss += 1; return true; },
    renderSafariHomeBannerHtml: () => '<div id="safariHomeBanner"><button id="btnDismissSafariBanner"></button></div>',
  };
}

/** Documento mínimo: guarda os elementos anexados ao body e acha por id. */
function fakeDoc() {
  const byId = new Map();
  const make = (id) => {
    const el = { id, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, remove() { byId.delete(id); } };
    return el;
  };
  return {
    byId,
    body: { appendChild(el) { byId.set(el.id, el); byId.set("btnDismissSafariBanner", make("btnDismissSafariBanner")); } },
    createElement: () => ({ set innerHTML(_html) { this.firstElementChild = make("safariHomeBanner"); } }),
    getElementById: (id) => byId.get(id) || null,
  };
}

test("armazenamento durável — quem só está lendo não recebe pedido nem faixa", async () => {
  const persistence = fakePersistence({ safari: true });
  const doc = fakeDoc();
  const res = await flow.startStorageDurability({ doc, hasAccount: () => false, persistence });
  assert.deepEqual(res, { asked: false, persisted: false, banner: false });
  assert.equal(persistence.calls.request, 0);
  assert.equal(doc.byId.size, 0);
});

test("armazenamento durável — com conta, pede ao navegador uma vez; já protegido não pede de novo", async () => {
  const first = fakePersistence({ grant: true });
  assert.deepEqual(await flow.startStorageDurability({ doc: fakeDoc(), hasAccount: () => true, persistence: first }), { asked: true, persisted: true, banner: false });
  assert.equal(first.calls.request, 1);
  const denied = fakePersistence({ grant: false });
  assert.equal((await flow.startStorageDurability({ doc: fakeDoc(), hasAccount: () => true, persistence: denied })).persisted, false, "o navegador pode negar");
  const already = fakePersistence({ persisted: true });
  assert.deepEqual(await flow.startStorageDurability({ doc: fakeDoc(), hasAccount: () => true, persistence: already }), { asked: false, persisted: true, banner: false });
  assert.equal(already.calls.request, 0);
});

test("armazenamento durável — Safari em aba comum vê a faixa uma vez; \"Entendido\" dispensa e tira da tela", async () => {
  const persistence = fakePersistence({ safari: true });
  const doc = fakeDoc();
  assert.equal((await flow.startStorageDurability({ doc, hasAccount: () => true, persistence })).banner, true);
  assert.ok(doc.getElementById(flow.SAFARI_BANNER_ID));
  assert.equal(flow.mountSafariHomeBanner(doc, persistence), false, "não monta duas vezes");
  doc.getElementById("btnDismissSafariBanner").listeners.click();
  assert.equal(persistence.calls.dismiss, 1);
  assert.equal(doc.getElementById(flow.SAFARI_BANNER_ID), null);
});

test("armazenamento durável — está ligado no boot, no pacto e no precache", () => {
  const read = (rel) => fs.readFileSync(new URL(`../client/${rel}`, import.meta.url), "utf8");
  assert.match(read("js/app.js"), /startStorageDurability\(\{ hasAccount: hasFullEntry \}\)/);
  assert.match(read("js/app/onboarding.js"), /startStorageDurability\(\{ hasAccount: hasFullEntry \}\)/);
  const sw = read("sw.js");
  const shell = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unplugged = sw.split("const UNPLUGGED_MODULES")[1];
  assert.ok(shell.includes("./js/storage-persistence.js"), "storage-persistence entrou no SHELL_ASSETS");
  assert.ok(shell.includes("./js/app/storage-durability-flow.js"), "storage-durability-flow entrou no SHELL_ASSETS");
  assert.ok(!unplugged.includes("storage-persistence.js"), "saiu da lista de módulos não plugados");
  assert.ok(!unplugged.includes("storage-durability-flow.js"), "fluxo não fica na lista de não plugados");
  assert.ok(read("css/style.css").includes(".safari-home-banner"));
});
