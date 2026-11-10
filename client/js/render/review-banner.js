/** @file PM-69 — "em revisão" e "arquivado" (publicação arquivada por denúncia, ADR-020 §2.1). */

import { escapeHtml } from "./util.js";
import { describeDeadline, openCasesForPost } from "../report-review.js";
import { findReason } from "../report.js";

export function renderInReviewPillHtml() {
  return `<span class="badge-pill community-review-pill" title="Arquivada depois de uma denúncia: só o autor e a moderação veem até a revisão">⏳ Em revisão</span>`;
}

function renderCaseSummaryHtml(cases) {
  if (!cases.length) return "";
  const reasons = [...new Set(cases.map((c) => findReason(c.reason)?.label || c.reason))];
  const grave = cases.some((c) => c.grave);
  const graveHtml = grave
    ? `<p class="review-grave"><strong>Motivo grave.</strong> Não baixe, não guarde e não compartilhe o conteúdo. Se for crime, denuncie também às autoridades.</p>`
    : "";
  const count = cases.length === 1 ? "1 denúncia" : `${cases.length} denúncias`;
  return `<p class="review-reasons">${count}: ${escapeHtml(reasons.join("; "))}</p>${graveHtml}`;
}

function renderModeratorReviewHtml(topicId, communityId, cases) {
  const attrs = `data-id="${escapeHtml(topicId)}" data-comm="${escapeHtml(communityId)}" data-requires-entry`;
  return `${renderCaseSummaryHtml(cases)}
    <div class="review-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm btn-review-restore" ${attrs}>Volta para todos</button>
      <button type="button" class="btn btn-outline btn-sm btn-review-keep" ${attrs}>Mantém arquivado</button>
    </div>`;
}

/**
 * Aviso no topo do tópico em revisão. O autor vê o estado e o prazo; quem modera vê também
 * os motivos (das denúncias recebidas neste aparelho) e decide.
 */
export function renderReviewBannerHtml(topic, { isMod = false, topicId = "", communityId = "", now = Date.now(), cases = null } = {}) {
  if (!topic?.inReview) return "";
  const deadline = topic.reviewSince ? ` Prazo de revisão: ${describeDeadline(topic.reviewSince, now)}.` : "";
  const who = isMod ? "Só o autor e a moderação a veem." : "Só você e a moderação a veem.";
  const modHtml = isMod ? renderModeratorReviewHtml(topicId, communityId, cases || openCasesForPost(topicId)) : "";
  return `
    <div class="banner-info review-banner" role="status" style="margin:0 0 0.75rem;">
      <strong>⏳ Em revisão.</strong> Esta publicação foi arquivada depois de uma denúncia. ${who}${deadline}
      ${modHtml}
    </div>`;
}

export function renderArchivedTopicShellHtml() {
  return `
    <div class="card empty review-archived" role="status">
      <h2 style="margin-top:0;">Publicação arquivada</h2>
      <p class="desc">A moderação desta comunidade arquivou esta publicação. Ela não aparece e não circula pela rede.</p>
    </div>`;
}
