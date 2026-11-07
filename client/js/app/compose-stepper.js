/** @file Navegação do compositor em etapas: uma tela por vez, validação por etapa e revisão. */

/** Etapas que só deixam avançar quando o campo obrigatório está preenchido. */
const REQUIRED_BY_STEP = { write: "topic-body" };

function stepEls(form) {
  return [...form.querySelectorAll(".compose-step")];
}

function currentIndex(form) {
  return stepEls(form).findIndex((s) => !s.hidden);
}

function textOf(id) {
  return (document.getElementById(id)?.value || "").trim();
}

/** Preenche a tela de revisão com o que foi escrito nas etapas anteriores. */
export function fillComposeReview(form) {
  const set = (k, v) => {
    const el = form.querySelector(`[data-review="${k}"]`);
    if (el) el.textContent = v;
  };
  set("circle", textOf("topic-comm-id") || "geral");
  set("title", textOf("topic-title") || "Sem título");
  set("tag", (textOf("topic-civic-tag") || "Social").replace(/[[\]]/g, ""));
  const body = textOf("topic-body");
  set("body", body.length > 280 ? `${body.slice(0, 280)}…` : body || "—");
}

function stepIsValid(step) {
  const reqId = REQUIRED_BY_STEP[step.dataset.stepKey];
  const ok = !reqId || textOf(reqId).length > 0;
  const err = step.querySelector("[data-step-error]");
  if (err) err.hidden = ok;
  if (!ok) document.getElementById(reqId)?.focus();
  return ok;
}

function focusStep(step) {
  const field = step.querySelector("input:not([type=hidden]), textarea, select, button[data-step-next], a.agora-compose-type.is-active");
  field?.focus({ preventScroll: true });
  step.closest(".agora-composer")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

export function goToComposeStep(form, index) {
  const steps = stepEls(form);
  const target = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((s, i) => { s.hidden = i !== target; });
  if (steps[target].dataset.stepKey === "review") fillComposeReview(form);
  focusStep(steps[target]);
}

/**
 * Liga Voltar/Continuar. Registrar ANTES do handler de publicação: um submit fora da última
 * etapa (ex.: Enter num campo) vira "Continuar" e não publica.
 */
export function bindComposeStepper(form) {
  if (!form || form.dataset.stepperBound === "1") return;
  form.dataset.stepperBound = "1";
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-step-prev]")) {
      e.preventDefault();
      goToComposeStep(form, currentIndex(form) - 1);
    } else if (e.target.closest("[data-step-next]")) {
      e.preventDefault();
      const i = currentIndex(form);
      if (stepIsValid(stepEls(form)[i])) goToComposeStep(form, i + 1);
    }
  });
  form.addEventListener("submit", (e) => guardSubmit(form, e));
}

function guardSubmit(form, e) {
  const steps = stepEls(form);
  const i = currentIndex(form);
  if (i < steps.length - 1) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (stepIsValid(steps[i])) goToComposeStep(form, i + 1);
    return;
  }
  const writeIdx = steps.findIndex((s) => s.dataset.stepKey === "write");
  if (writeIdx >= 0 && !textOf(REQUIRED_BY_STEP.write)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    goToComposeStep(form, writeIdx);
    stepIsValid(steps[writeIdx]);
  }
}
