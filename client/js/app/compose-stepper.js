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

function requiredIds(step) {
  const declared = (step.dataset.stepRequired || "").split(",").map((x) => x.trim()).filter(Boolean);
  const legacy = REQUIRED_BY_STEP[step.dataset.stepKey];
  return legacy ? [...declared, legacy] : declared;
}

function fieldFilled(id) {
  const el = document.getElementById(id);
  if (!el) return true;
  if (el.type === "checkbox" || el.type === "radio") return el.checked;
  if (el.type === "file") return (el.files?.length || 0) > 0;
  const filled = String(el.value || "").trim().length > 0;
  return filled && (typeof el.checkValidity !== "function" || el.checkValidity());
}

function stepIsValid(step) {
  const missing = requiredIds(step).find((id) => !fieldFilled(id));
  const ok = !missing;
  const err = step.querySelector("[data-step-error]");
  if (err) err.hidden = ok;
  if (!ok) document.getElementById(missing)?.focus();
  return ok;
}

/** Nome do cartão de opção marcado (`renderChoiceCards`), ou o valor do rádio se o cartão não tiver nome. */
function choiceLabel(fieldset) {
  const picked = fieldset.querySelector("input:checked");
  if (!picked) return "";
  const name = picked.closest("label")?.querySelector(".compose-sphere-name");
  return name ? name.textContent.trim() : picked.value;
}

function displayValue(el) {
  if (!el) return "";
  if (el.tagName === "FIELDSET") return choiceLabel(el);
  if (el.tagName === "SELECT") return el.selectedOptions?.[0]?.textContent?.trim() || el.value;
  if (el.type === "checkbox") return el.checked ? "Sim" : "Não";
  if (el.type === "file") return el.files?.[0]?.name || "";
  return String(el.value || "").trim();
}

/** Revisão genérica: `[data-review-from="id"]` recebe o valor do campo correspondente. */
function fillGenericReview(form) {
  form.querySelectorAll("[data-review-from]").forEach((dd) => {
    const v = displayValue(document.getElementById(dd.dataset.reviewFrom));
    dd.textContent = v ? (v.length > 280 ? `${v.slice(0, 280)}…` : v) : dd.dataset.reviewEmpty || "—";
  });
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
  if (steps[target].dataset.stepKey === "review") {
    fillComposeReview(form);
    fillGenericReview(form);
  }
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
  const firstInvalid = steps.findIndex((st) => requiredIds(st).some((id) => !fieldFilled(id)));
  if (firstInvalid >= 0) {
    e.preventDefault();
    e.stopImmediatePropagation();
    goToComposeStep(form, firstInvalid);
    stepIsValid(steps[firstInvalid]);
  }
}
