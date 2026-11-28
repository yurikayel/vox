/**
 * @file Esc nos modais do `modalHost` (apontamento e denúncia): a tecla fecha o modal e o foco volta ao botão que o
 * abriu. Sobre o DOM de mentira, com um `MutationObserver` manual (o host só liga o preso de foco quando ganha filhos).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
globalThis.fetch = async () => { throw new Error("offline"); };

// O host conta `childNodes`; o DOM de mentira só tem `children`.
Object.defineProperty(globalThis.HTMLElement.prototype, "childNodes", { get() { return this.children; } });

/** Observadores criados pelo host; `flush()` faz o papel do navegador avisando que os filhos mudaram. */
const observers = [];
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe() {}
  disconnect() {}
};
const flush = () => observers.forEach((o) => o.callback([]));

const feedbackFlow = await import("../client/js/app/feedback-flow.js");
const reportFlow = await import("../client/js/app/report-flow.js");

/** Cria o botão que dispara o modal e o deixa em foco, como acontece antes do clique. */
function focusedTrigger(id) {
  const trigger = doc.createElement("button");
  trigger.id = id;
  doc.body.appendChild(trigger);
  trigger.focus();
  return trigger;
}

const pressEscape = () => doc.dispatchEvent({ type: "keydown", key: "Escape", target: doc.body });

test("Esc fecha o modal de apontamento e devolve o foco ao botão que o abriu", () => {
  const trigger = focusedTrigger("abre-feedback");
  feedbackFlow.openFeedbackFlow("ágora");
  flush();
  const host = doc.getElementById("feedback-modal-container");
  assert.ok(host.innerHTML.includes("form-feedback"), "o modal abriu");
  doc.getElementById("btn-feedback-cancel").focus();
  pressEscape();
  assert.equal(host.innerHTML, "", "o Esc esvazia o host");
  assert.equal(doc.activeElement, trigger, "o foco volta ao gatilho");
});

test("Esc fecha o modal de denúncia e devolve o foco ao botão que o abriu", () => {
  const trigger = focusedTrigger("abre-denuncia");
  reportFlow.openReportFlow({ postId: "p1" });
  flush();
  const host = doc.getElementById("report-modal-container");
  assert.ok(host.innerHTML.includes("form-report"), "o modal abriu");
  doc.getElementById("btn-report-cancel").focus();
  pressEscape();
  assert.equal(host.innerHTML, "", "o Esc esvazia o host");
  assert.equal(doc.activeElement, trigger, "o foco volta ao gatilho");
});

test("outra tecla não fecha o modal", () => {
  focusedTrigger("abre-outro");
  feedbackFlow.openFeedbackFlow("ágora");
  flush();
  doc.dispatchEvent({ type: "keydown", key: "a", target: doc.body });
  assert.ok(doc.getElementById("feedback-modal-container").innerHTML.includes("form-feedback"));
  doc.getElementById("btn-feedback-cancel").click();
});
