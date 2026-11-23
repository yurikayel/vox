/**
 * @file Telas de composição de tópicos cívicos/sociais e respostas no Vox.
 *
 * Suporta modo social inline e fluxo cívico em etapas com prova de trabalho e ata.
 *
 * @module render/profile-compose-topic
 */
import { escapeHtml } from "./util.js";
import { renderInlineComposer } from "./feed.js";
import { renderComposeSignaturePanel } from "./compose-chrome.js";
import { renderStep } from "./compose-steps.js";

/**
 * Bloco opcional para colar a conversa de chat no tópico.
 *
 * @returns {string}
 */
function renderChatTranscriptDetails() {
  return `
    <details class="compose-chat-import" style="margin-top:0.75rem; padding:0.75rem 1rem; border:1px solid var(--border-subtle); border-radius:var(--radius-sm); background:var(--surface-soft, rgba(255, 255, 255, 0.03));">
      <summary style="cursor:pointer; font-size:0.82rem; font-weight:600; color:var(--accent);">📥 Importar Ata / Conversa do Slack ou Discord (Memória Anti-90-dias)</summary>
      <div style="margin-top:0.6rem;">
        <p class="meta" style="margin:0 0 0.5rem; font-size:0.78rem;">Cole abaixo o trecho copiado do Slack ou Discord. O Vox formata os turnos de fala em ata Markdown permanente.</p>
        <textarea id="chat-transcript-input" class="form-control" rows="4" placeholder="Ex:\nHelena — Hoje às 14:30\nAprovamos o mutirão de sábado.\nTiago — Hoje às 14:32\nFechado! Levo as mudas."></textarea>
        <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.6rem; flex-wrap:wrap;">
          <button type="button" id="btn-convert-chat-transcript" class="btn btn-sm btn-outline">Converter em Ata</button>
          <button type="button" id="btn-convert-and-notarize" class="btn btn-sm btn-primary">🏛️ Converter & Selar Cartório (Arweave)</button>
        </div>
      </div>
    </details>`;
}

/** Construtor de enquete: 2 a 6 opções, adicionar/remover (aparece com a categoria Enquete). */
function renderPollBuilder() {
  /**
   * Linha de opção de enquete cívica.
   *
   * @param {number} i
   * @returns {string}
   */
  const row = (i) => `<li class="civic-poll-row"><input type="text" class="form-control civic-poll-input" maxlength="80" placeholder="Opção ${i}" aria-label="Opção ${i}" /><button type="button" class="civic-poll-remove" aria-label="Remover opção">×</button></li>`;
  return `
      <div class="civic-poll-builder" id="civic-poll-builder" hidden>
        <p class="agora-field-label">Opções da enquete <span class="agora-muted">(2 a 6)</span></p>
        <ol class="civic-poll-options" id="civic-poll-options">${row(1)}${row(2)}</ol>
        <button type="button" class="agora-btn agora-btn--secondary" id="btn-civic-poll-add">+ Adicionar opção</button>
      </div>`;
}

/**
 * Barra de etiquetas cívicas do tópico.
 *
 * @returns {string}
 */
function renderTopicCivicTagBar() {
  return `
    <div class="form-group topic-tag-selector-group">
      <label style="font-size:0.82rem; color:var(--muted); font-weight:600;">Categoria Cívica (opcional):</label>
      <div class="civic-tag-bar" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
        <button type="button" class="btn btn-sm btn-subtle civic-tag-btn active" data-tag="" aria-pressed="true">Geral</button>
        <button type="button" class="btn btn-sm btn-subtle civic-tag-btn" data-tag="[Pauta]" aria-pressed="false">🏛️ Pauta</button>
        <button type="button" class="btn btn-sm btn-subtle civic-tag-btn" data-tag="[Bug]" aria-pressed="false">🐛 Bug</button>
        <button type="button" class="btn btn-sm btn-subtle civic-tag-btn" data-tag="[Ideia]" aria-pressed="false">💡 Ideia</button>
        <button type="button" class="btn btn-sm btn-subtle civic-tag-btn" data-tag="[Debate Geral]" aria-pressed="false">💬 Debate</button>
        <button type="button" class="btn btn-sm btn-subtle civic-tag-btn" data-tag="[Enquete]" aria-pressed="false">📊 Enquete</button>
      </div>
      <p class="civic-tag-hint">Pauta, Ideia, Debate e Enquete tornam o post <strong>cívico</strong> (aba Cívico, com posicionamento assinado) se ele tiver título com 8+ caracteres, argumento com 40+ e for publicado em um círculo.</p>
      <input type="hidden" id="topic-civic-tag" value="" />
      ${renderPollBuilder()}
    </div>`;
}

/**
 * Selo do destino (comunidade) do tópico.
 *
 * @param {string} communityId
 * @returns {string}
 */
function renderComposeTargetPill(communityId) {
  if (communityId) {
    return `<input type="hidden" id="topic-comm-id" value="${escapeHtml(communityId)}" /><span class="compose-pill-tag agora-stamp agora-stamp--teal">Círculo: <strong>${escapeHtml(communityId)}</strong></span>`;
  }
  return `<div class="compose-pill-group agora-compose-target"><label class="agora-field-label" for="topic-comm-id">Círculo de destino</label> <input type="text" id="topic-comm-id" class="compose-pill-input agora-inscription" value="geral" placeholder="ex: geral, cinema-nacional" required /></div>`;
}

/**
 * Passo do assistente: esfera de publicação.
 *
 * @param {string} communityId
 * @returns {string}
 */
function renderComposeSphereStep(communityId) {
  const c = communityId ? `?c=${encodeURIComponent(communityId)}` : "";
  return `
        <div class="compose-sphere">
          <button type="button" class="compose-sphere-card" data-sphere="social">
            <span class="compose-sphere-icon" aria-hidden="true">📷</span>
            <span class="compose-sphere-name">Social</span>
            <span class="compose-sphere-desc">Foto, vídeo, áudio ou texto — como no feed.</span>
          </button>
          <button type="button" class="compose-sphere-card compose-sphere-card--civic" data-sphere="civic">
            <span class="compose-sphere-icon" aria-hidden="true">🏛️</span>
            <span class="compose-sphere-name">Cívico</span>
            <span class="compose-sphere-desc">Pauta, ideia, debate ou enquete, com posicionamento assinado.</span>
          </button>
        </div>
        <p class="compose-sphere-more">Também: <a href="#/compose/listing${c}">oferta na feira</a> · <a href="#/compose/community">nova comunidade</a> · <a href="#/compose/proposal?c=${encodeURIComponent(communityId || "vox")}">proposta de regra</a></p>`;
}

/**
 * Passo do assistente: onde publicar.
 *
 * @param {string} commInput
 * @returns {string}
 */
function renderComposeWhereStep(commInput) {
  return `
        <div class="compose-target-row">${commInput}</div>
        <div class="form-group agora-compose-field">
          <label class="agora-field-label" for="topic-title">Título</label>
          <input type="text" id="topic-title" class="form-control agora-inscription agora-inscription--title" minlength="8" pattern=".{8,}" maxlength="120" required placeholder="ex: Iluminação nas praças do bairro" />
        </div>`;
}

/**
 * Passo do assistente: escrever o tópico.
 *
 * @returns {string}
 */
function renderComposeWriteStep() {
  return `
        <div class="compose-body-field agora-compose-field">
          <label class="agora-field-label" for="topic-body">Argumento <span class="agora-muted">· pelo menos 40 caracteres</span></label>
          <textarea id="topic-body" class="form-control compose-textarea-seamless agora-inscription" rows="8" placeholder="Explique a proposta, o problema ou a pergunta." required></textarea>
          <p class="compose-step-error" data-step-error hidden>Escreva algo antes de continuar.</p>
        </div>
        ${renderChatTranscriptDetails()}`;
}

/**
 * Passo do assistente: marcação cívica.
 *
 * @returns {string}
 */
function renderComposeCivicStep() {
  return `
        <p class="compose-step-lead">Escolha a categoria. Enquete abre os campos de opções.</p>
        ${renderTopicCivicTagBar()}`;
}

/**
 * Passo do assistente: revisão antes de publicar.
 *
 * @returns {string}
 */
function renderComposeReviewStep() {
  return `
        <dl class="compose-review" data-compose-review>
          <div><dt>Círculo</dt><dd data-review="circle">—</dd></div>
          <div><dt>Título</dt><dd data-review="title">—</dd></div>
          <div><dt>Categoria</dt><dd data-review="tag">Social</dd></div>
          <div class="compose-review-body"><dt>Texto</dt><dd data-review="body">—</dd></div>
        </dl>
        ${renderComposeSignaturePanel()}`;
}

/**
 * Composer de nova publicação: esfera Social (inline) ou fluxo cívico em etapas.
 * @param {HTMLElement} main Container da rota `#/compose/topic`.
 * @param {string} communityId Círculo pré-selecionado (vazio = escolha livre).
 * @param {object} [options={}]
 * @param {string} [options.userRouteId=""] Conta publicadora.
 * @param {string} [options.displayName=""] Nome no composer social.
 * @returns {void}
 */
export function renderComposeTopic(main, communityId, { userRouteId = "", displayName = "" } = {}) {
  const backHref = communityId ? `#/c/${encodeURIComponent(communityId)}` : "#/";
  const commInput = renderComposeTargetPill(communityId);
  const nav = { backHref, submitId: "btn-submit-topic", submitLabel: "Publicar" };

  main.innerHTML = `
    <div class="compose-card compose-card-sleek agora-composer agora-composer--steps agora-composer--post">
      <div class="compose-header-bar agora-composer-head">
        <a class="back-link compose-back-link" href="${backHref}">← Voltar</a>
        <p class="compose-heading agora-composer-kicker">Nova publicação</p>
      </div>
      <form id="form-compose-topic" novalidate>
        ${renderStep(0, renderComposeSphereStep(communityId), { ...nav, hideNext: true })}
        ${renderStep(1, renderComposeCivicStep(), nav)}
        ${renderStep(2, renderComposeWhereStep(commInput), nav)}
        ${renderStep(3, renderComposeWriteStep(), nav)}
        ${renderStep(4, renderComposeReviewStep(), nav)}
      </form>
      <section class="compose-social-panel" id="compose-social-panel" hidden>
        <button type="button" class="compose-sphere-back" data-sphere-back>← Trocar tipo</button>
        ${renderInlineComposer({ userRouteId, displayName })}
      </section>
    </div>`;
}

/**
 * Tela de resposta a tópico ou comentário (com banner de contexto opcional).
 * @param {HTMLElement} main Container da rota.
 * @param {string} topicId Tópico respondido.
 * @param {string} communityId Comunidade do tópico.
 * @param {object} [options={}]
 * @param {string} [options.parentId=""] ID do comentário pai, se houver.
 * @param {string} [options.parentAuthor=""] @handle citado.
 * @param {string} [options.parentExcerpt=""] Trecho do comentário pai.
 * @returns {void}
 */
export function renderComposeReply(main, topicId, communityId, { parentId = "", parentAuthor = "", parentExcerpt = "" } = {}) {
  const replyContextHtml = parentId
    ? `<div class="reply-context-banner" style="background:var(--surface-soft, rgba(255, 255, 255, 0.04)); border-left:3px solid var(--primary, #00b4d8); padding:10px 14px; margin-bottom:14px; border-radius:var(--radius-sm); font-size:0.88rem;">
         <div style="font-weight:600; color:var(--text-muted, #94a3b8);">↩️ Respondendo a ${escapeHtml(parentAuthor ? `@${parentAuthor}` : "comentário")}:</div>
         ${parentExcerpt ? `<div style="font-style:italic; margin-top:4px; color:var(--text); opacity:0.9;">${escapeHtml(parentExcerpt)}</div>` : ""}
       </div>`
    : "";
  main.innerHTML = `
    <div class="compose-card compose-card-sleek">
      <form id="form-compose-reply">
        <div class="compose-header-bar">
          <a class="compose-back-pill" href="#/t/${encodeURIComponent(topicId)}">← Voltar</a>
          <button type="submit" class="btn btn-primary btn-publish-pill" id="btn-submit-reply">Responder</button>
        </div>
        ${replyContextHtml}
        <input type="hidden" id="reply-topic-id" value="${escapeHtml(topicId)}" />
        <input type="hidden" id="reply-comm-id" value="${escapeHtml(communityId)}" />
        <textarea id="reply-body" class="compose-textarea-seamless" rows="4" placeholder="Escreva sua resposta..." required></textarea>
      </form>
    </div>`;
}
