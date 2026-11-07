/**
 * @file Compositor em etapas: uma decisão por tela (tipo → destino → texto → cívico → revisão).
 * Marcação pura; a navegação vive em `app/compose-stepper.js`.
 */
import { escapeHtml } from "./util.js";

export const COMPOSE_TOPIC_STEPS = [
  { key: "type", title: "O que você vai publicar?" },
  { key: "where", title: "Onde e sobre o quê?" },
  { key: "write", title: "Escreva" },
  { key: "civic", title: "Tornar cívico?" },
  { key: "review", title: "Revisar e publicar" },
];

/** Cabeçalho da etapa: "Etapa N de M" + barra de progresso segmentada. */
export function renderStepHeader(index, steps = COMPOSE_TOPIC_STEPS) {
  const segs = steps.map((_, i) => `<span class="compose-step-seg${i <= index ? " is-done" : ""}"></span>`).join("");
  return `
      <div class="compose-step-head">
        <p class="compose-step-count">Etapa ${index + 1} de ${steps.length}</p>
        <div class="compose-step-bar" aria-hidden="true">${segs}</div>
        <h2 class="compose-step-title">${escapeHtml(steps[index].title)}</h2>
      </div>`;
}

/** Rodapé com Voltar/Continuar (ou Publicar na última etapa). */
export function renderStepNav(index, { backHref = "#/", last = false, submitId = "", submitLabel = "Publicar" } = {}) {
  const back = index === 0
    ? `<a class="agora-btn agora-btn--secondary" href="${escapeHtml(backHref)}">Cancelar</a>`
    : `<button type="button" class="agora-btn agora-btn--secondary" data-step-prev>Voltar</button>`;
  const next = last
    ? `<button type="submit" class="agora-btn agora-btn--primary btn-publish-pill" id="${escapeHtml(submitId)}">${escapeHtml(submitLabel)}</button>`
    : `<button type="button" class="agora-btn agora-btn--primary" data-step-next>Continuar</button>`;
  return `<div class="agora-composer-actions compose-step-nav">${back}${next}</div>`;
}

/** Envolve o conteúdo de uma etapa; só a primeira começa visível. */
export function renderStep(index, bodyHtml, navOpts, steps = COMPOSE_TOPIC_STEPS) {
  const last = index === steps.length - 1;
  return `
      <section class="compose-step" data-step="${index}" data-step-key="${steps[index].key}"${index === 0 ? "" : " hidden"}>
        ${renderStepHeader(index, steps)}
        <div class="compose-step-body">${bodyHtml}</div>
        ${renderStepNav(index, { ...navOpts, last })}
      </section>`;
}
