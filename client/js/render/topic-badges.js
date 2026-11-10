/** @file Selos da linha de tópico da comunidade (fixado, encerrado, chave nova, em revisão, tag cívica). */

import { escapeHtml } from "./util.js";
import { renderInReviewPillHtml } from "./review-banner.js";

export const CIVIC_TAGS = ["[Pauta]", "[Bug]", "[Ideia]", "[Debate Geral]"];

export function extractTopicCivicTag(topic = {}) {
  if (topic.civicTag) return String(topic.civicTag);
  if (topic.tag) return String(topic.tag);
  const match = String(topic.title || "").match(/^\[(Pauta|Bug|Ideia|Debate Geral)\]/i);
  return match ? match[0] : "";
}

export function resolveTopicBadgesHtml(topic) {
  const pin = topic.isPinned
    ? `<span class="badge-pill community-pinned-pill" title="Tópico fixado pela moderação">📌 Fixado</span> · `
    : "";
  const lock = topic.isLocked
    ? `<span class="badge-pill community-locked-pill" title="Discussão encerrada para novas respostas">🔒 Encerrado</span> · `
    : "";
  const newKey = topic.newKeyHeld
    ? `<span class="badge-pill community-newkey-pill" title="Chave nova sem prova de trabalho: recolhido para quem não modera">🆕 Chave nova</span> · `
    : "";
  const review = topic.inReview ? `${renderInReviewPillHtml()} · ` : "";
  const tag = extractTopicCivicTag(topic);
  const tagHtml = tag
    ? `<span class="badge-pill community-civic-tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span> · `
    : "";
  return `${review}${pin}${lock}${newKey}${tagHtml}`;
}
