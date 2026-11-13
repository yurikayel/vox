import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as rf from "../client/js/app/read-first.js";

function fakeDoc() {
  const listeners = { click: [], submit: [] };
  return {
    listeners,
    addEventListener(type, fn, capture) {
      listeners[type].push({ fn, capture });
    },
  };
}

function fire(doc, type, target) {
  let prevented = false;
  let stopped = false;
  const ev = { target, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } };
  for (const { fn } of doc.listeners[type]) fn(ev);
  return { prevented, stopped };
}

const el = (matches) => ({ closest: (sel) => (matches(sel) ? {} : null) });

test("read-first - PM-54: clique que escreve abre a entrada e é bloqueado; leitura passa", () => {
  rf.__resetReadFirstGuardsForTests();
  const doc = fakeDoc();
  let opened = 0;
  let entered = false;
  rf.installReadFirstGuards({ doc, hasEntered: () => entered, openEntry: () => opened++ });
  assert.ok(doc.listeners.click[0].capture, "precisa ser em captura para vir antes dos handlers do app");

  const like = el((sel) => sel.includes(".btn-like"));
  assert.deepEqual(fire(doc, "click", like), { prevented: true, stopped: true });
  assert.equal(opened, 1);

  const readLink = el(() => false);
  assert.deepEqual(fire(doc, "click", readLink), { prevented: false, stopped: false });

  entered = true;
  assert.deepEqual(fire(doc, "click", like), { prevented: false, stopped: false });
  assert.equal(opened, 1);
});

test("read-first - envio de formulário: resposta pede entrada; busca e denúncia não", () => {
  rf.__resetReadFirstGuardsForTests();
  const doc = fakeDoc();
  let opened = 0;
  rf.installReadFirstGuards({ doc, hasEntered: () => false, openEntry: () => opened++ });
  assert.equal(fire(doc, "submit", { id: "form-compose-reply" }).prevented, true);
  assert.equal(fire(doc, "submit", { id: "" }).prevented, true);
  assert.equal(fire(doc, "submit", { id: "agora-search-form" }).prevented, false);
  assert.equal(fire(doc, "submit", { id: "form-report" }).prevented, false);
  assert.equal(opened, 2);
});

test("read-first - rotas de leitura e faixa", () => {
  assert.equal(rf.isReadFirstRoute("topic"), true);
  assert.equal(rf.isReadFirstRoute("home"), true, "a home abre para leitura: a entrada vem na primeira ação que escreve");
  assert.equal(rf.isReadFirstRoute("dm-thread"), false);
  const html = rf.renderReadFirstBannerHtml();
  assert.ok(html.includes("btn-read-first-enter"));
  assert.ok(html.includes("não pede CPF"));
});

test("read-first - fluxo de entrada (#modal-container) e apontamento não pedem entrada; o resto pede", () => {
  const inside = (id) => ({ id, closest: (sel) => (sel === "#modal-container" ? {} : null) });
  const outside = (id) => ({ id, closest: () => null });
  assert.equal(rf.submitNeedsEntry(inside("form-oauth-custom-name")), false, "onboarding não pode travar a si mesmo");
  assert.equal(rf.submitNeedsEntry(outside("form-feedback")), false);
  assert.equal(rf.submitNeedsEntry(outside("form-compose-topic")), true);
});
