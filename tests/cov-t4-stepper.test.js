/**
 * @file Cobertura de `app/compose-stepper.js` (lote T4): navegação por etapas, validação e revisão.
 *
 * Usa o DOM de mentira de `helpers/cov-t4-dom.mjs`; cada teste confere o efeito observável
 * (etapa visível, texto da revisão, foco, bloqueio do submit).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";

const { fillComposeReview, goToComposeStep, bindComposeStepper, focusComposeAfterSteppedPublish } =
  await import("../client/js/app/compose-stepper.js");

/**
 * Monta um formulário com etapas (`write` exige o corpo; a última é a revisão).
 * @returns {{ form: FakeEl, steps: FakeEl[], body: FakeEl, errEl: FakeEl, dom: object }} Cenário montado.
 */
function buildForm() {
  const dom = installFakeDocument();
  const errEl = new FakeEl("", { classes: ["err"] });
  const s0 = new FakeEl("s0", { dataset: { stepKey: "where" } });
  const s1 = new FakeEl("s1", { dataset: { stepKey: "write" } }).stub("[data-step-error]", errEl);
  const s2 = new FakeEl("s2", { dataset: { stepKey: "review" } });
  s0.hidden = false;
  s1.hidden = true;
  s2.hidden = true;
  const body = new FakeEl("topic-body", { tag: "TEXTAREA" });
  const form = new FakeEl("form").stub(".compose-step", [s0, s1, s2]);
  dom.add(body, new FakeEl("topic-comm-id", { value: " bairro " }), new FakeEl("topic-title", { value: "" }));
  return { form, steps: [s0, s1, s2], body, errEl, dom };
}

test("stepper — revisão resume círculo, título padrão, etiqueta sem colchetes e corpo truncado", () => {
  const { form, body, dom } = buildForm();
  const set = {};
  for (const k of ["circle", "title", "tag", "body"]) {
    const el = new FakeEl();
    set[k] = el;
    form.stub(`[data-review="${k}"]`, el);
  }
  dom.add(new FakeEl("topic-civic-tag", { value: "[Pauta]" }));
  body.value = "x".repeat(300);
  fillComposeReview(form);
  assert.equal(set.circle.textContent, "bairro");
  assert.equal(set.title.textContent, "Sem título");
  assert.equal(set.tag.textContent, "Pauta");
  assert.equal(set.body.textContent, `${"x".repeat(280)}…`);
  body.value = "";
  fillComposeReview(form);
  assert.equal(set.body.textContent, "—");
  dom.restore();
});

test("stepper — goToComposeStep limita o índice, mostra só a etapa alvo e foca o campo", () => {
  const { form, steps, dom } = buildForm();
  const field = new FakeEl("f");
  const wrap = new FakeEl("wrap");
  steps[0].stub("input:not([type=hidden]), textarea, select, button[data-step-next], a.agora-compose-type.is-active", field);
  steps[0].stubClosest(".agora-composer", wrap);
  wrap.scrollIntoView = (o) => { wrap.scrolled = o; };
  goToComposeStep(form, -5);
  assert.deepEqual(steps.map((s) => s.hidden), [false, true, true]);
  assert.equal(field.focusCalls, 1);
  assert.equal(wrap.scrolled.block, "start");
  goToComposeStep(form, 99);
  assert.deepEqual(steps.map((s) => s.hidden), [true, true, false]);
  dom.restore();
});

test("stepper — etapa de revisão preenche valores genéricos de campos, seleção, checkbox e arquivo", () => {
  const { form, steps, dom } = buildForm();
  const mk = (from, empty) => new FakeEl("", { dataset: { reviewFrom: from, ...(empty ? { reviewEmpty: empty } : {}) } });
  const dds = [mk("sel"), mk("chk"), mk("file"), mk("none", "Nada"), mk("fs"), mk("long")];
  form.stub("[data-review-from]", dds);
  const sel = new FakeEl("sel", { tag: "SELECT", value: "v" });
  sel.selectedOptions = [{ textContent: " Opção A " }];
  const chk = new FakeEl("chk", { tag: "INPUT" });
  chk.type = "checkbox";
  chk.checked = true;
  const file = new FakeEl("file", { tag: "INPUT" });
  file.type = "file";
  file.files = [{ name: "foto.png" }];
  const picked = new FakeEl("", { tag: "INPUT", value: "raw" });
  const fs = new FakeEl("fs", { tag: "FIELDSET" }).stub("input:checked", picked);
  picked.stubClosest("label", new FakeEl().stub(".compose-sphere-name", Object.assign(new FakeEl(), { textContent: " Cívico " })));
  const long = new FakeEl("long", { value: "y".repeat(300) });
  dom.add(sel, chk, file, fs, long);
  goToComposeStep(form, 2);
  assert.deepEqual(dds.map((d) => d.textContent), ["Opção A", "Sim", "foto.png", "Nada", "Cívico", `${"y".repeat(280)}…`]);
  assert.equal(steps[2].hidden, false);
  dom.restore();
});

/**
 * Cria evento de clique cujo alvo está dentro do botão pedido.
 * @param {string} sel Seletor do botão (`[data-step-prev]` ou `[data-step-next]`).
 * @returns {{ target: FakeEl, prevented: boolean, preventDefault: () => void }} Evento simulado.
 */
function clickOn(sel) {
  const target = new FakeEl().stubClosest(sel, new FakeEl());
  return { target, prevented: false, preventDefault() { this.prevented = true; } };
}

test("stepper — Continuar bloqueia com campo obrigatório vazio e avança quando preenchido", async () => {
  const { form, steps, body, errEl, dom } = buildForm();
  bindComposeStepper(form);
  bindComposeStepper(form);
  assert.equal(form.listeners.get("click").length, 1, "ligação única");
  await form.fire("click", clickOn("[data-step-next]"));
  assert.equal(steps[1].hidden, false);
  const ev = clickOn("[data-step-next]");
  await form.fire("click", ev);
  assert.equal(ev.prevented, true);
  assert.equal(errEl.hidden, false, "erro da etapa visível");
  assert.equal(body.focusCalls, 1, "foco no campo faltante");
  assert.equal(steps[1].hidden, false, "continua na mesma etapa");
  body.value = "texto";
  body.checkValidity = () => true;
  await form.fire("click", clickOn("[data-step-next]"));
  assert.equal(steps[2].hidden, false);
  assert.equal(errEl.hidden, true);
  await form.fire("click", clickOn("[data-step-prev]"));
  assert.equal(steps[1].hidden, false);
  dom.restore();
});

test("stepper — submit fora da última etapa vira Continuar e não publica", async () => {
  const { form, steps, body, dom } = buildForm();
  bindComposeStepper(form);
  const calls = { prevented: 0, stopped: 0 };
  const ev = { preventDefault: () => calls.prevented++, stopImmediatePropagation: () => calls.stopped++ };
  await form.fire("submit", ev);
  assert.deepEqual(calls, { prevented: 1, stopped: 1 });
  assert.equal(steps[1].hidden, false);
  await form.fire("submit", ev);
  assert.equal(steps[1].hidden, false, "corpo vazio mantém a etapa");
  body.value = "ok";
  await form.fire("submit", ev);
  assert.equal(steps[2].hidden, false);
  dom.restore();
});

test("stepper — submit na última etapa volta à primeira etapa inválida ou deixa publicar", async () => {
  const { form, steps, body, dom } = buildForm();
  bindComposeStepper(form);
  goToComposeStep(form, 2);
  const calls = { prevented: 0, stopped: 0 };
  const ev = { preventDefault: () => calls.prevented++, stopImmediatePropagation: () => calls.stopped++ };
  await form.fire("submit", ev);
  assert.deepEqual(calls, { prevented: 1, stopped: 1 });
  assert.equal(steps[1].hidden, false, "volta à etapa com o corpo faltando");
  goToComposeStep(form, 2);
  body.value = "pronto";
  await form.fire("submit", ev);
  assert.deepEqual(calls, { prevented: 1, stopped: 1 }, "válido: não bloqueia a publicação");
  dom.restore();
});

test("stepper — bindComposeStepper ignora formulário ausente e o pós-publicação foca o anúncio", async () => {
  assert.equal(bindComposeStepper(null), undefined);
  const dom = installFakeDocument();
  focusComposeAfterSteppedPublish("Post publicado.");
  const status = dom.doc.getElementById("vox-compose-publish-status");
  assert.equal(FakeEl.focused, status, "foco vai para a região de status criada sob demanda");
  await Promise.resolve();
  assert.equal(status.textContent, "Post publicado.");
  dom.restore();
});
