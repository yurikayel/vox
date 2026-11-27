/**
 * @file Gaveta de identidade (`role="dialog" aria-modal="true"`): o foco fica preso nela enquanto aberta (Tab e Shift+Tab
 * circulam), o Esc fecha com o foco onde estiver, e ao fechar o foco volta ao botão que abriu. DOM em memória.
 */
import "./setup.js";
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { attachIdentityDrawerBehavior } from "../client/js/render/shell-drawer.js";
import { FakeElement, installFakeDocument } from "./helpers/cov-t7-fake-dom.mjs";

let dom;
let toggle;
let drawer;
let inside;
let outside;

/** Elemento com `id`, anexado ao corpo do documento falso. */
function add(id, tag = "button") {
  const el = new FakeElement(tag);
  el.id = id;
  dom.document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  dom = installFakeDocument();
  const listeners = dom.document.listeners;
  dom.document.removeEventListener = (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); };
  toggle = add("agora-identity-toggle");
  drawer = add("agora-identity-drawer", "aside");
  drawer.hidden = true;
  add("agora-drawer-backdrop", "div").hidden = true;
  inside = [add("agora-drawer-close"), new FakeElement("a"), new FakeElement("a")];
  outside = new FakeElement("a");
  drawer.querySelectorAll = () => inside;
  drawer.contains = (el) => inside.includes(el);
  attachIdentityDrawerBehavior();
});
afterEach(() => dom.restore());

/** Pressiona uma tecla no documento (o preso de foco escuta nele) e devolve se `preventDefault` foi chamado. */
function press(key, extra = {}) {
  let prevented = false;
  dom.document.dispatch("keydown", { key, preventDefault: () => { prevented = true; }, ...extra });
  return prevented;
}

test("Esc fecha a gaveta com o foco fora dela, atualiza aria-expanded e devolve o foco ao botão", () => {
  toggle.dispatch("click");
  dom.document.activeElement = outside;
  toggle.focused = false;
  press("Escape");
  assert.equal(drawer.hidden, true, "a gaveta fechou");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.focused, true, "o foco voltou ao botão que abriu");
});

test("Tab no último elemento volta ao primeiro, e Shift+Tab no primeiro vai ao último", () => {
  toggle.dispatch("click");
  dom.document.activeElement = inside[2];
  assert.equal(press("Tab"), true, "Tab no último é capturado");
  assert.equal(inside[0].focused, true, "o foco foi ao primeiro");
  inside[2].focused = false;
  dom.document.activeElement = inside[0];
  assert.equal(press("Tab", { shiftKey: true }), true, "Shift+Tab no primeiro é capturado");
  assert.equal(inside[2].focused, true, "o foco foi ao último");
});

test("o último item que ocupa lugar na tela fecha o ciclo: link com display:none no fim da gaveta não conta", () => {
  inside.push(Object.assign(new FakeElement("a"), { getClientRects: () => [] }));
  toggle.dispatch("click");
  dom.document.activeElement = inside[2];
  assert.equal(press("Tab"), true, "Tab no último item visível é capturado");
  assert.equal(inside[0].focused, true, "o foco volta ao primeiro, sem passar pelo item que não se vê");
});

test("Tab com o foco fora da gaveta aberta puxa o foco para dentro", () => {
  toggle.dispatch("click");
  dom.document.activeElement = outside;
  inside[0].focused = false;
  assert.equal(press("Tab"), true);
  assert.equal(inside[0].focused, true);
});

test("fechada, a gaveta não captura Tab nem Esc", () => {
  toggle.dispatch("click");
  toggle.dispatch("click");
  assert.equal(drawer.hidden, true);
  dom.document.activeElement = outside;
  assert.equal(press("Tab"), false, "Tab segue o fluxo normal da página");
  toggle.focused = false;
  press("Escape");
  assert.equal(toggle.focused, false, "Esc não mexe no foco com a gaveta fechada");
});
