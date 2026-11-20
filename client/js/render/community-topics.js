/** @file Abas de tópicos, membros e feed interno da comunidade.
 * @module render/community-topics
 */
import * as mock from "../mock.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import { sanitizeMediaUrl } from "../shared/html.js";
import {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  formatTimeAgo,
  postTimeParts,
  renderAvatarHtml,
} from "./util.js";
import { extractTopicCivicTag, resolveTopicBadgesHtml } from "./topic-badges.js";
import {
  topicExcerptOneParagraph,
  topicReplyCount,
  buildCommunityMembersSummary,
  renderCommunityMembersStatsBlock,
  renderCommunityOnlineGrid,
} from "./community-shared.js";

function renderTopicRowThumb(topic, topicHref) {
  const thumb = sanitizeMediaUrl(topic.image);
  if (!thumb || gossipRetract.shouldHideGossipDeletedPost(topic)) return "";
  return `<a class="community-topic-row-thumb" href="${topicHref}" aria-hidden="true"><img src="${escapeHtml(thumb)}" alt="" width="48" height="48" loading="lazy" /></a>`;
}

function resolveTopicAuthorMeta(topic) {
  const author = topic.author || topic.owner || "";
  const authorLabels = resolvePostAuthorLabels(author, {
    authorDisplay: topic.authorDisplay,
    isOwnLocalPost: topic.isOwnLocalPost,
  });
  const authorHandle = authorLabels.authorHandle || (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const authorDisplay = authorLabels.authorDisplay || authorHandle;
  const authorAvatar = renderAvatarHtml(author, authorDisplay, "avatar-xs");
  return { author, authorHandle, authorDisplay, authorAvatar };
}

/** @type {number} Tamanho de página padrão da lista de tópicos da comunidade. */
export const TOPICS_PAGE_SIZE = 20;

/**
 * Aviso LAN-14 de posts recolhidos por quarentena de chave nova, com «ver mesmo assim».
 * @param {number} count Quantidade de posts recolhidos.
 * @returns {string} HTML do aviso `.community-newkey-notice`.
 */
export function renderNewKeyHeldNoticeHtml(count) {
  const n = Number(count) || 0;
  const what = n === 1 ? "1 post de chave nova está recolhido" : `${n} posts de chaves novas estão recolhidos`;
  return `<p class="feed-notice community-newkey-notice" role="status">${what} pela quarentena desta comunidade (anti-spam).
    <button type="button" class="btn btn-outline btn-sm btn-reveal-new-keys">Ver mesmo assim</button></p>`;
}

function resolveTopicBumpSpan(topic) {
  if (Number(topic.lastReplyTs) <= Number(topic.ts)) return "";
  const rel = formatTimeAgo(topic.lastReplyTs);
  const phrase = rel === "agora" ? "ativa agora" : `ativa há ${rel}`;
  return `<span class="community-topic-bump" title="Atividade recente no tópico"> · ${escapeHtml(phrase)}</span>`;
}

function resolveTopicCleanTitle(topic) {
  let title = topic.title || topicExcerptOneParagraph(topic) || "Sem título";
  const civicTag = extractTopicCivicTag(topic);
  if (civicTag && title.toLowerCase().startsWith(civicTag.toLowerCase())) {
    title = title.slice(civicTag.length).trim() || title;
  }
  return title;
}

function renderTopicRowMeta(topic) {
  const { author, authorHandle, authorAvatar } = resolveTopicAuthorMeta(topic);
  const { display: timeDisplay, titleAttr: timeTitle } = postTimeParts(topic.ts);
  const replies = topicReplyCount(topic);
  const replyLabel = replies === 1 ? "1 resposta" : `${replies} respostas`;
  const bumpSpan = resolveTopicBumpSpan(topic);
  return `
    <p class="community-topic-row-meta">
      <a class="community-topic-row-author" href="#/u/${encodeURIComponent(author)}">${authorAvatar}<span>@${escapeHtml(authorHandle)}</span></a>
      <span class="community-topic-row-dot" aria-hidden="true">·</span>
      <span>${escapeHtml(replyLabel)}</span>${bumpSpan}
      <span class="community-topic-row-dot" aria-hidden="true">·</span>
      <span class="community-topic-row-time"${timeTitle}>${escapeHtml(timeDisplay)}</span>
    </p>`;
}

/**
 * Linha resumida de tópico na lista da comunidade (título, selos, thumb).
 * @param {object} topic Tópico com metadados de atividade.
 * @param {object} [options={}]
 * @param {string} [options.communityId=""] ID da comunidade (contexto futuro).
 * @param {string} [options.communityTitle=""] Título da comunidade.
 * @returns {string} HTML do `<article class="community-topic-row">`.
 */
export function renderCommunityTopicRow(topic, { communityId: _communityId = "", communityTitle: _communityTitle = "" } = {}) {
  const badgesHtml = resolveTopicBadgesHtml(topic);
  const title = resolveTopicCleanTitle(topic);
  const excerpt = topicExcerptOneParagraph(topic);
  const topicHref = `#/t/${encodeURIComponent(topic.id)}`;
  const thumb = renderTopicRowThumb(topic, topicHref);
  const metaHtml = renderTopicRowMeta(topic);

  return `
    <article class="community-topic-row${topic.isPinned ? " is-pinned" : ""}${topic.isLocked ? " is-locked" : ""}" data-id="${escapeHtml(topic.id)}">
      <div class="community-topic-row-body">
        <h3 class="community-topic-row-title"><a href="${topicHref}">${badgesHtml}${escapeHtml(title)}</a></h3>
        ${metaHtml}
        ${excerpt && excerpt !== title ? `<p class="community-topic-row-excerpt">${escapeHtml(excerpt)}</p>` : ""}
      </div>
      ${thumb}
    </article>`;
}


/**
 * Aba Membros: grade online + estatísticas honestas.
 * @param {object} meta Metadados da comunidade.
 * @param {string} communityId Slug.
 * @param {object[]} [recentPeople=[]] Atividade recente na malha.
 * @param {boolean} [isMember=false] Se o visitante é membro.
 * @returns {string} HTML do painel de membros.
 */
export function renderCommunityMembersTab(meta, communityId, recentPeople = [], isMember = false) {
  const summary = buildCommunityMembersSummary(meta, communityId, recentPeople, isMember, 24);
  return `
    <div class="community-vox-panel community-vox-members-panel">
      <section class="community-vox-members-online card" aria-labelledby="community-vox-members-online-title">
        <header class="community-vox-members-head">
          <h2 id="community-vox-members-online-title" class="community-vox-members-title">Membros online</h2>
          <p class="community-vox-sidebar-hint">${escapeHtml(summary.onlineHint)}</p>
        </header>
        ${renderCommunityOnlineGrid(summary.online, { layout: "tab" })}
      </section>
      ${renderCommunityMembersStatsBlock(summary)}
    </div>`;
}

function renderTopicPaginationButton(totalCount, visibleCount) {
  if (totalCount <= visibleCount) return "";
  const remaining = totalCount - visibleCount;
  return `
    <div class="community-topic-pagination" style="text-align:center; padding:12px 0 6px;">
      <button type="button" class="btn btn-outline btn-sm btn-load-more-topics" data-visible="${visibleCount}">
        Carregar tópicos anteriores (${remaining} ${remaining === 1 ? "restante" : "restantes"})
      </button>
    </div>`;
}

/**
 * Lista interna de tópicos com paginação «carregar mais».
 * @param {object[]} topics Todos os tópicos conhecidos.
 * @param {string} communityId Slug.
 * @param {string} commTitle Título para contexto das linhas.
 * @param {string} composeHref Link do botão criar (vazio desabilita).
 * @param {number} [visibleCount=TOPICS_PAGE_SIZE] Quantos itens mostrar.
 * @returns {string} HTML da lista e botão de paginação.
 */
export function renderCommunityTopicFeedInner(topics, communityId, commTitle, composeHref, visibleCount = TOPICS_PAGE_SIZE) {
  if (!topics.length) {
    return `<div class="empty community-vox-empty"><p>Nenhum post nesta comunidade ainda.</p>${composeHref ? `<a class="btn btn-primary btn-sm" href="${composeHref}">Criar o primeiro post</a>` : ""}</div>`;
  }
  const paged = topics.slice(0, visibleCount);
  const items = paged
    .map((t) => renderCommunityTopicRow({ ...t, communityId, communityTitle: commTitle }))
    .join("");
  const paginationHtml = renderTopicPaginationButton(topics.length, visibleCount);
  return `<div class="community-vox-topic-list">${items}</div>${paginationHtml}`;
}

/**
 * Aba Posts com ordenação, busca local e CTA de nova publicação.
 * @param {string} communityId Slug.
 * @param {string} commTitle Nome da comunidade.
 * @param {object[]} topics Tópicos.
 * @param {object} [options={}]
 * @param {string} [options.sortMode="active"] Modo de ordenação (`active`, `newest`, `pinned`).
 * @param {number} [options.visibleCount=TOPICS_PAGE_SIZE] Página visível.
 * @param {boolean} [options.canCompose=true] Exibe botão + Post.
 * @returns {string} HTML da seção de feed.
 */
export function renderCommunityPostsTab(communityId, commTitle, topics, { sortMode = "active", visibleCount = TOPICS_PAGE_SIZE, canCompose = true } = {}) {
  const composeHref = canCompose ? `#/compose/topic?c=${encodeURIComponent(communityId)}` : "";
  const inner = renderCommunityTopicFeedInner(topics, communityId, commTitle, composeHref, visibleCount);
  return `
    <section class="community-vox-feed card" aria-labelledby="community-vox-feed-title">
      <header class="community-vox-feed-head">
        <div class="community-feed-header-main" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <h2 id="community-vox-feed-title" class="community-vox-feed-title" style="margin:0;">Tópicos e posts</h2>
            <div class="community-sort-bar" style="margin-top:4px; display:inline-flex; gap:6px; font-size:0.8rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-subtle btn-sort-topic ${sortMode === "active" ? "active" : ""}" data-sort="active" aria-pressed="${sortMode === "active"}">🔥 Atividade Recente</button>
              <button type="button" class="btn btn-sm btn-subtle btn-sort-topic ${sortMode === "newest" ? "active" : ""}" data-sort="newest" aria-pressed="${sortMode === "newest"}">✨ Mais Recentes</button>
              <button type="button" class="btn btn-sm btn-subtle btn-sort-topic ${sortMode === "pinned" ? "active" : ""}" data-sort="pinned" aria-pressed="${sortMode === "pinned"}">📌 Fixados / Governança</button>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="search" id="input-comm-topic-search" class="input input-sm community-topic-search" placeholder="🔍 Filtrar tópicos..." style="max-width:180px; padding:4px 8px; font-size:0.82rem;" aria-label="Filtrar tópicos da comunidade" />
            ${composeHref ? `<a class="btn btn-sm btn-outline" href="${composeHref}">+ Post</a>` : ""}
          </div>
        </div>
      </header>
      ${inner}
    </section>`;
}
