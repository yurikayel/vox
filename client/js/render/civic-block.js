/** @file Render da esfera cívica no feed: bloco de interação, pendências e introdução da aba. */
import { escapeHtml } from "./util.js";
import { civicChoicesFor, CIVIC_REQUIREMENTS, describeMissingRequirements } from "../civic-post.js";

function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

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

function renderFormalVoteLink(post) {
  if (post.civic?.kind !== "pauta") return "";
  const c = encodeURIComponent(post.communityId || "vox");
  return `<a class="civic-formal-link" href="#/compose/proposal?c=${c}">Levar à votação formal da comunidade →</a>`;
}

/**
 * Bloco de interação de um post cívico: posicionamento (concordo/discordo/abstenção) ou enquete,
 * com apuração parcial (1 voto assinado por pessoa).
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

/** Aviso (só nos próprios posts) do que falta para um post com tag cívica entrar na aba Cívico. */
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

/** Introdução da aba Cívico: requisitos e atalho para compor uma pauta. */
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
