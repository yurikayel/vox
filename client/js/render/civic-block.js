/** @file Render da esfera cívica no feed: bloco de interação, pendências e introdução da aba. */
import { escapeHtml } from "./util.js";
import { civicChoicesFor, CIVIC_REQUIREMENTS, describeMissingRequirements } from "../civic-post.js";

/**
 * Percentual inteiro de `n` sobre `total`; 0 se o total é zero.
 *
 * @param {number} n
 * @param {number} total
 * @returns {number}
 */
function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/**
 * Botão de escolha da enquete cívica com a barra de participação.
 *
 * @param {object} post
 * @param {object} choice
 * @param {object} tally
 * @returns {string}
 */
function renderChoiceButton(post, choice, tally) {
  const count = tally.counts[choice.key] || 0;
  const share = pct(count, tally.total);
  const mine = tally.mine === choice.key;
  return `
      <button type="button" class="civic-choice-btn${mine ? " is-mine" : ""}" data-post-id="${escapeHtml(post.id)}" data-choice="${escapeHtml(choice.key)}" aria-pressed="${mine}">
        <span class="civic-choice-fill" style="width:${tally.total ? share : 0}%"></span>
        <span class="civic-choice-label">${escapeHtml(choice.label)}${mine ? " ✓" : ""}</span>
        <span class="civic-choice-count">${tally.total ? `${share}% · ${count}` : ""}</span>
      </button>`;
}

/**
 * Link para a votação formal quando o post é uma pauta.
 *
 * @param {object} post
 * @returns {string}
 */
function renderFormalVoteLink(post) {
  if (post.civic?.kind !== "pauta") return "";
  const c = encodeURIComponent(post.communityId || "vox");
  return `<a class="civic-formal-link" href="#/compose/proposal?c=${c}">Levar à votação formal da comunidade →</a>`;
}

/**
 * Bloco de interação de um post cívico: posicionamento ou enquete com apuração parcial.
 * @param {object} post Post com `civic`, `civicTally` e id.
 * @returns {string} HTML do bloco ou `""` se não for post cívico.
 */
export function renderCivicBlock(post) {
  if (!post?.civic?.isCivic) return "";
  const tally = post.civicTally || { counts: {}, total: 0, mine: "" };
  const question = post.civic.kind === "enquete" ? "Escolha uma opção" : "Seu posicionamento";
  const buttons = civicChoicesFor(post.civic).map((c) => renderChoiceButton(post, c, tally)).join("");
  const totalLabel = tally.total === 1 ? "1 voto assinado" : `${tally.total} votos assinados`;
  return `
    <section class="civic-block" data-post-id="${escapeHtml(post.id)}" aria-label="Interação cívica">
      <div class="civic-block-head">
        <span class="civic-tag-stamp">${escapeHtml(post.civic.label)}</span>
        <span class="civic-block-question">${question}</span>
        <span class="civic-block-total">${totalLabel}</span>
      </div>
      <div class="civic-choices civic-choices--${escapeHtml(post.civic.kind)}">${buttons}
      </div>
      ${renderFormalVoteLink(post)}
    </section>`;
}

/**
 * Aviso do que falta para o post entrar na aba Cívico (`civicPending`).
 * @param {object} post Post com lista de requisitos pendentes.
 * @returns {string} HTML do aviso ou `""` quando não há pendências.
 */
export function renderCivicPendingNote(post) {
  const labels = describeMissingRequirements(post?.civicPending || []);
  if (!labels.length) return "";
  const items = labels.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
  return `
    <aside class="civic-pending-note" role="note">
      <p>Este post tem tag cívica, mas ainda não aparece em <strong>Cívico</strong>. Falta:</p>
      <ul>${items}</ul>
    </aside>`;
}

/**
 * Cabeçalho introdutório da aba Cívico com requisitos e link para novo post.
 * @returns {string}
 */
export function renderCivicFeedIntro() {
  const items = CIVIC_REQUIREMENTS.map((r) => `<li>${escapeHtml(r.label)}</li>`).join("");
  return `
    <section class="civic-feed-intro">
      <div class="civic-feed-intro-text">
        <h2 class="civic-feed-intro-title">Posts cívicos</h2>
        <p>Pautas, ideias, debates e enquetes que habilitam posicionamento e votação assinados — 1 pessoa, 1 voto. Para um post entrar aqui ele precisa de:</p>
        <ul class="civic-requirements">${items}</ul>
      </div>
      <a class="agora-btn agora-btn--primary" href="#/compose/topic">+ Novo post cívico</a>
    </section>`;
}
