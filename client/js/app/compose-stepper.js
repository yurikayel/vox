/** @file Navegação do compositor em etapas: uma tela por vez, validação por etapa e revisão. */

import { focusAfterComposePublish } from "../render/compose-chrome.js";

/** Etapas que só deixam avançar quando o campo obrigatório está preenchido. */
const REQUIRED_BY_STEP = { write: "topic-body" };

/**
 * Lista as etapas do formulário em passos.
 *
 * @param {HTMLFormElement} form Formulário em etapas.
 * @returns {HTMLElement[]}
 */
function stepEls(form) {
  return [...form.querySelectorAll(".compose-step")];
}

/**
 * Índice da etapa visível, ou -1 se nenhuma.
 *
 * @param {HTMLFormElement} form Formulário em etapas.
 * @returns {number}
 */
function currentIndex(form) {
  return stepEls(form).findIndex((s) => !s.hidden);
}

/**
 * Texto aparado do campo com esse identificador.
 *
 * @param {string} id Identificador do elemento.
 * @returns {string}
 */
function textOf(id) {
  return (document.getElementById(id)?.value || "").trim();
}

/**
 * Preenche a tela de revisão com o que foi escrito nas etapas anteriores.
 *
 * @param {HTMLFormElement} form Formulário do compositor em etapas.
 * @returns {void}
 */
export function fillComposeReview(form) {
  /**
   * Escreve o texto num campo da revisão.
   *
   * @param {string} k Chave `data-review`.
   * @param {string} v Texto.
   */
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

/**
 * Identificadores dos campos obrigatórios da etapa.
 *
 * @param {HTMLElement} step Etapa.
 * @returns {string[]}
 */
function requiredIds(step) {
  const declared = (step.dataset.stepRequired || "").split(",").map((x) => x.trim()).filter(Boolean);
  const legacy = REQUIRED_BY_STEP[step.dataset.stepKey];
  return legacy ? [...declared, legacy] : declared;
}

/**
 * Diz se o campo está preenchido (campo ausente conta como preenchido).
 *
 * @param {string} id Identificador do elemento.
 * @returns {boolean}
 */
function fieldFilled(id) {
  const el = document.getElementById(id);
  if (!el) return true;
  if (el.type === "checkbox" || el.type === "radio") return el.checked;
  if (el.type === "file") return (el.files?.length || 0) > 0;
  const filled = String(el.value || "").trim().length > 0;
  return filled && (typeof el.checkValidity !== "function" || el.checkValidity());
}

/**
 * Valida a etapa: mostra o erro e foca o primeiro campo faltante.
 *
 * @param {HTMLElement} step Etapa.
 * @returns {boolean}
 */
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

/**
 * Texto legível do valor de um campo para a revisão.
 *
 * @param {HTMLElement|null} el Campo.
 * @returns {string}
 */
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

/**
 * Foca o primeiro campo da etapa e rola até o compositor.
 *
 * @param {HTMLElement} step Etapa.
 */
function focusStep(step) {
  const field = step.querySelector("input:not([type=hidden]), textarea, select, button[data-step-next], a.agora-compose-type.is-active");
  field?.focus({ preventScroll: true });
  step.closest(".agora-composer")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

/**
 * Mostra a etapa do compositor pelo índice e atualiza a revisão quando necessário.
 *
 * @param {HTMLFormElement} form Formulário do compositor.
 * @param {number} index Índice da etapa (0-based).
 * @returns {void}
 */
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
 * Reposiciona o foco após publicação em formulário em etapas (antes de sair da rota).
 * @param {string} [message] Anúncio curto para leitores de tela.
 * @returns {void}
 */
export function focusComposeAfterSteppedPublish(message) {
  focusAfterComposePublish({ message });
}

/**
 * Liga Voltar/Continuar. Registrar ANTES do handler de publicação: um submit fora da última
 * etapa (ex.: Enter num campo) vira "Continuar" e não publica.
 *
 * @param {HTMLFormElement} form Formulário do compositor em etapas.
 * @returns {void}
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

/**
 * Impede o envio antes da última etapa e avança em vez de enviar.
 *
 * @param {HTMLFormElement} form Formulário em etapas.
 * @param {Event} e Evento `submit`.
 */
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
