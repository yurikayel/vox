/**
 * @file Compositor em etapas: uma decisão por tela (tipo → destino → texto → cívico → revisão).
 * Marcação pura; a navegação vive em `app/compose-stepper.js`.
 */
import { escapeHtml } from "./util.js";

/** Etapas padrão do compositor de publicação social. @type {Array<{key: string, title: string, required?: string[], requiredMsg?: string}>} */
export const COMPOSE_TOPIC_STEPS = [
  { key: "type", title: "O que você vai publicar?" },
  { key: "civic", title: "Que tipo de post cívico?" },
  { key: "where", title: "Onde e sobre o quê?", required: ["topic-title"], requiredMsg: "Dê um título com pelo menos 8 caracteres." },
  { key: "write", title: "Escreva" },
  { key: "review", title: "Revisar e publicar" },
];

/**
 * Cabeçalho "Etapa N de M" com barra segmentada.
 * @param {number} index Índice da etapa ativa (0-based).
 * @param {Array<{title: string}>} [steps=COMPOSE_TOPIC_STEPS]
 * @returns {string}
 */
export function renderStepHeader(index, steps = COMPOSE_TOPIC_STEPS) {
  const segs = steps.map((_, i) => `<span class="compose-step-seg${i <= index ? " is-done" : ""}"></span>`).join("");
  return `
      <div class="compose-step-head">
        <p class="compose-step-count">Etapa ${index + 1} de ${steps.length}</p>
        <div class="compose-step-bar" aria-hidden="true">${segs}</div>
        <h2 class="compose-step-title">${escapeHtml(steps[index].title)}</h2>
      </div>`;
}

/**
 * Rodapé com Cancelar/Voltar e Continuar ou botão de publicar.
 * @param {number} index Índice da etapa.
 * @param {object} [options={}]
 * @param {string} [options.backHref="#/"] Destino do cancelar na primeira etapa.
 * @param {boolean} [options.last=false] Se é a última etapa (mostra submit).
 * @param {string} [options.submitId=""] Id do botão publicar.
 * @param {string} [options.submitLabel="Publicar"]
 * @param {boolean} [options.hideNext=false] Esconde continuar/publicar.
 * @returns {string}
 */
export function renderStepNav(index, { backHref = "#/", last = false, submitId = "", submitLabel = "Publicar", hideNext = false } = {}) {
  const back = index === 0
    ? `<a class="agora-btn agora-btn--secondary" href="${escapeHtml(backHref)}">Cancelar</a>`
    : `<button type="button" class="agora-btn agora-btn--secondary" data-step-prev>Voltar</button>`;
  const next = last
    ? `<button type="submit" class="agora-btn agora-btn--primary btn-publish-pill" id="${escapeHtml(submitId)}">${escapeHtml(submitLabel)}</button>`
    : `<button type="button" class="agora-btn agora-btn--primary" data-step-next>Continuar</button>`;
  return `<div class="agora-composer-actions compose-step-nav">${back}${hideNext ? "" : next}</div>`;
}

/**
 * Seção de uma etapa com corpo, validação e navegação.
 * @param {number} index Índice da etapa.
 * @param {string} bodyHtml Conteúdo interno.
 * @param {object} navOpts Opções repassadas a {@link renderStepNav}.
 * @param {Array<object>} [steps=COMPOSE_TOPIC_STEPS]
 * @returns {string}
 */
export function renderStep(index, bodyHtml, navOpts, steps = COMPOSE_TOPIC_STEPS) {
  const last = index === steps.length - 1;
  const req = steps[index].required || [];
  const reqAttr = req.length ? ` data-step-required="${escapeHtml(req.join(","))}"` : "";
  const errHtml = req.length ? `<p class="compose-step-error" data-step-error hidden>${escapeHtml(steps[index].requiredMsg || "Preencha os campos obrigatórios para continuar.")}</p>` : "";
  return `
      <section class="compose-step" data-step="${index}" data-step-key="${steps[index].key}"${reqAttr}${index === 0 ? "" : " hidden"}>
        ${renderStepHeader(index, steps)}
        <div class="compose-step-body">${bodyHtml}${errHtml}</div>
        ${renderStepNav(index, { ...navOpts, last })}
      </section>`;
}

/**
 * Lista de revisão genérica: cada linha copia o valor do campo `from` na etapa revisão.
 * @param {Array<{label:string, from:string, empty?:string, long?:boolean}>} rows
 * @returns {string}
 */
export function renderReviewList(rows) {
  const items = rows.map((r) => `
          <div${r.long ? ' class="compose-review-body"' : ""}><dt>${escapeHtml(r.label)}</dt><dd data-review-from="${escapeHtml(r.from)}" data-review-empty="${escapeHtml(r.empty || "—")}">${escapeHtml(r.empty || "—")}</dd></div>`).join("");
  return `<dl class="compose-review" data-compose-review>${items}
        </dl>`;
}

/**
 * Tela de compositor que não pode abrir (sem permissão, recurso desligado): diz o porquê e
 * oferece a saída — nunca um erro solto sem caminho de volta.
 * @param {{title:string, body:string, actions?:Array<{href:string, label:string, primary?:boolean}>}} opts
 *   `title` e `body` em texto puro; `actions` vira a fileira de botões (o primeiro `primary` em destaque).
 * @returns {string} HTML do bloco `.agora-empty`.
 */
export function renderComposeBlocked({ title, body, actions = [] }) {
  const buttons = actions.map((a) => {
    const kind = a.primary ? "agora-btn--primary" : "agora-btn--secondary";
    return `<a class="agora-btn ${kind}" href="${escapeHtml(a.href)}">${escapeHtml(a.label)}</a>`;
  }).join("");
  return `<div class="agora-empty compose-blocked" role="status">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      ${buttons ? `<div class="compose-blocked-actions">${buttons}</div>` : ""}
    </div>`;
}

/**
 * Bloco "feira desligada" (aba Feira e compositor de oferta): explica que a abertura passa por
 * proposta de governança e leva direto ao compositor de proposta da comunidade.
 * @param {string} communityId Id da comunidade.
 * @returns {string} HTML do bloco.
 */
export function renderFeiraDisabled(communityId) {
  const c = encodeURIComponent(communityId);
  return renderComposeBlocked({
    title: "Feira comunitária não ativada",
    body: "A feira (classificados) começa desligada em toda comunidade. Para abrir, é preciso uma proposta comunitária de governança aprovada no voto.",
    actions: [
      { href: `#/compose/proposal?c=${c}`, label: "Propor a abertura da feira", primary: true },
      { href: `#/c/${c}`, label: "← Voltar à comunidade" },
    ],
  });
}

/**
 * Concatena todas as etapas de um wizard/compositor.
 * @param {Array<{key: string, title: string, body: string, required?: string[], requiredMsg?: string}>} steps
 * @param {object} navOpts Opções de navegação por etapa.
 * @returns {string}
 */
export function renderSteps(steps, navOpts) {
  return steps.map((st, i) => renderStep(i, st.body, navOpts, steps)).join("");
}
