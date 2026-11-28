/**
 * @file Composer inline do feed (strip, anexos Lo-Fi, toolbar de publicação).
 *
 * @module render/feed-composer
 */
import * as mock from "../mock.js";
import * as i18n from "../i18n-pt-br.js";
import { escapeHtml, renderAvatarHtml } from "./util.js";
import { composerPreviewImageAltAttr } from "../composer-media.js";

/**
 * Faixa compacta do composer no topo (atalho para o inline composer).
 * @param {string} [displayName=""] Nome exibido no avatar.
 * @returns {string} HTML do composer colapsável.
 */
export function renderComposerStrip(displayName = "") {
  return renderInlineComposer({ displayName });
}

/**
 * Barra de filtros da foto no compositor.
 *
 * @returns {string}
 */
function renderComposerFilterBar() {
  return `
    <div class="lofi-filter-bar" id="lofi-filter-bar" role="group" aria-label="Estilo Lo-Fi">
      <span class="meta lofi-filter-label">Estilo Lo-Fi:</span>
      <button type="button" class="lofi-filter-btn active" aria-pressed="true" data-filter="normal">Padrão</button>
      <button type="button" class="lofi-filter-btn" aria-pressed="false" data-filter="xerox">📰 Xerox</button>
      <button type="button" class="lofi-filter-btn" aria-pressed="false" data-filter="vhs">📼 VHS 90s</button>
      <button type="button" class="lofi-filter-btn" aria-pressed="false" data-filter="risograph">🎨 Risógrafo</button>
    </div>`;
}

/**
 * Barra de proporção da imagem no compositor.
 *
 * @returns {string}
 */
function renderComposerAspectBar() {
  return `
    <div class="composer-aspect-bar" id="composer-aspect-bar" role="group" aria-label="Proporção da imagem" style="display:none;">
      <span class="meta composer-aspect-label">Proporção:</span>
      <button type="button" class="composer-aspect-btn active" aria-pressed="true" data-aspect="original">Original (padrão)</button>
      <button type="button" class="composer-aspect-btn" aria-pressed="false" data-aspect="16:9">16:9</button>
      <button type="button" class="composer-aspect-btn" aria-pressed="false" data-aspect="9:16">9:16</button>
      <button type="button" class="composer-aspect-btn" aria-pressed="false" data-aspect="4:3">4:3</button>
      <button type="button" class="composer-aspect-btn" aria-pressed="false" data-aspect="3:4">3:4</button>
      <button type="button" class="composer-aspect-btn" aria-pressed="false" data-aspect="1:1">1:1</button>
    </div>`;
}

/**
 * Área de prévia do tópico no compositor.
 *
 * @returns {string}
 */
function renderComposerPreviewWrap() {
  return `
    <div class="inline-composer-preview hidden" id="inline-topic-preview-wrap" hidden>
      <img id="inline-topic-preview" class="inline-composer-preview-img hidden" ${composerPreviewImageAltAttr()} hidden />
      <div id="inline-topic-preview-audio-wrap" class="inline-composer-preview-audio hidden" hidden>
        <div class="inline-composer-preview-audio-header">
          <span>🎙️</span>
          <strong style="font-size:0.85rem;">Recado de Voz (Lo-Fi 48kbps)</strong>
        </div>
        <audio id="inline-topic-preview-audio" controls style="width:100%;"></audio>
      </div>
      <div id="inline-topic-preview-video-wrap" class="inline-composer-preview-video hidden" hidden>
        <video id="inline-topic-preview-video" controls playsinline preload="metadata" style="width:100%; max-height:240px; display:block;"></video>
      </div>
      <div class="composer-attach-line">
        <p id="inline-topic-attach-meta" class="inline-composer-attach-meta hidden" hidden aria-live="polite"></p>
        <button type="button" class="composer-attach-remove inline-composer-remove-img" id="btn-inline-remove-img" aria-label="Remover anexo" title="Remover anexo">✕</button>
      </div>
      <span class="lofi-weight-pill composer-attach-weight" id="lofi-weight-badge">⚡ ~45 KB (mídia leve para a malha)</span>
      <div class="composer-tag-bar composer-edit-row" id="composer-tag-bar" style="display:none;">
        <button type="button" class="composer-edit-btn" data-edit-panel="style" aria-expanded="false">🎨 Estilo</button>
        <button type="button" class="composer-edit-btn" data-edit-panel="aspect" aria-expanded="false">⬚ Proporção</button>
        <button type="button" class="composer-edit-btn" id="btn-inline-tag-people" aria-haspopup="dialog" aria-expanded="false">🏷️ Marcar pessoas</button>
        <div id="inline-composer-tags-chips" class="inline-composer-tags-chips"></div>
      </div>
      ${renderComposerFilterBar()}
      ${renderComposerAspectBar()}
    </div>`;
}

/**
 * Ícone SVG de foto.
 *
 * @returns {string}
 */
function iconMediaPhoto() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
}

/**
 * Ícone SVG de microfone.
 *
 * @returns {string}
 */
function iconMediaMic() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
}

/**
 * Ícone SVG de áudio.
 *
 * @returns {string}
 */
function iconMediaAudio() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
}

/**
 * Ícone SVG de vídeo.
 *
 * @returns {string}
 */
function iconMediaVideo() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="2" y="5" rx="2"/><polygon points="22 8 16 12 22 16 22 8"/></svg>`;
}

/**
 * Ícone SVG de comunidade.
 *
 * @returns {string}
 */
function iconCommunity() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
}

/**
 * Ferramentas de anexo de mídia do compositor.
 *
 * @returns {string}
 */
function renderMediaTools() {
  return `
    <label class="inline-composer-tool" title="Foto (até 99 KB)" aria-label="Anexar foto">
      <input type="file" id="inline-topic-file" class="sr-only" aria-label="Anexar foto" accept="image/jpeg,image/png,image/webp,image/gif" />
      ${iconMediaPhoto()}
    </label>
    <div class="inline-mic-wrapper">
      <button type="button" class="inline-composer-tool btn-inline-mic" id="btn-inline-mic" title="Gravar voz (toque para iniciar, até 1 min)" aria-label="Gravar voz pelo microfone (até 60s)" aria-pressed="false">
        <span class="btn-mic-icon" aria-hidden="true">${iconMediaMic()}</span>
        <span class="btn-mic-recording-content" aria-hidden="true">
          <span class="recording-pulse"></span>
          <span id="inline-recording-timer" class="recording-timer">00:00 / 01:00</span>
          <span class="recording-stop-icon">⏹</span>
        </span>
      </button>
      <button type="button" id="btn-inline-cancel-rec" class="btn-rec-cancel hidden" title="Cancelar gravação" aria-label="Cancelar gravação">✕</button>
    </div>
    <label class="inline-composer-tool" title="Áudio (até 60s)" aria-label="Anexar áudio">
      <input type="file" id="inline-topic-audio" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/m4a" class="sr-only" aria-label="Anexar áudio" />
      ${iconMediaAudio()}
    </label>
    <label class="inline-composer-tool" title="Vídeo (até 10s)" aria-label="Anexar vídeo">
      <input type="file" id="inline-topic-video" accept="video/mp4,video/webm,video/ogg" class="sr-only" aria-label="Anexar vídeo" />
      ${iconMediaVideo()}
    </label>`;
}

/**
 * Seletor de audiência do compositor.
 *
 * @returns {string}
 */
function renderComposerAudience() {
  return `
    <div class="inline-composer-audience">
      <div class="inline-composer-comm-wrap" title="Comunidade de destino">
        ${iconCommunity()}
        <input type="text" id="inline-topic-comm" class="inline-composer-comm" list="inline-comm-list" placeholder="Comunidade (opcional)" maxlength="64" aria-label="Slug da comunidade" />
      </div>
      <datalist id="inline-comm-list"></datalist>
    </div>`;
}

/**
 * Barra de ferramentas do compositor.
 *
 * @returns {string}
 */
function renderComposerToolbar() {
  return `
    <div class="inline-composer-toolbar">
      <div class="inline-composer-tools">
        ${renderMediaTools()}
      </div>
      <div class="inline-composer-actions">
        <span class="inline-composer-char" id="inline-topic-char">0 / 2000</span>
        <button type="submit" class="btn btn-outline btn-sm btn-inline-echo" id="btn-inline-echo" aria-label="Publicar e ecoar em outras redes" disabled title="Publica no Vox e abre o Cockpit POSSE para WhatsApp, Bluesky, Telegram, X, etc.">🚀 Postar & Ecoar</button>
        <button type="submit" class="btn btn-primary btn-sm btn-inline-submit" aria-label="Publicar mensagem no feed" id="btn-inline-submit" disabled>Postar</button>
      </div>
    </div>`;
}

/**
 * Rodapé do compositor com contador e avisos.
 *
 * @returns {string}
 */
function renderComposerMeta() {
  return `
    <div class="inline-composer-meta" aria-live="polite">
      <div class="inline-composer-meta-left">
        <span class="inline-composer-badge-sovereign" title="Assinado no aparelho e sincronizado na malha peer-to-peer sem controle central.">🔒 Soberano</span>
        <span class="inline-composer-hint meta"> · <a href="#/compose/topic">Formulário completo</a> · <a href="#/wallet">Criar ou importar chave</a></span>
        <span class="inline-composer-local-hint meta" title="${escapeHtml(i18n.localMutateEditDeleteTooltip)}"> · ${escapeHtml(i18n.localMutateComposerHint)}</span>
      </div>
    </div>`;
}

/**
 * Composer inline do feed (colapsado + formulário com anexos Lo-Fi).
 * @param {object} [options={}]
 * @param {string} [options.userRouteId=""] Conta que publica.
 * @param {string} [options.displayName=""] Rótulo do avatar.
 * @returns {string} HTML do bloco `#feed-inline-composer`.
 */
export function renderInlineComposer({ userRouteId = "", displayName = "" } = {}) {
  const label = displayName || (userRouteId ? mock.getAuthorDisplay(userRouteId) : "") || "Você";
  const avatarHtml = userRouteId ? renderAvatarHtml(userRouteId, label) : '<span class="avatar">✍</span>';
  return `
    <div class="inline-composer" id="feed-inline-composer" data-user-route="${escapeHtml(userRouteId || "")}">
      <div class="inline-composer-collapsed" tabindex="0" role="button" aria-expanded="false" aria-controls="form-inline-topic" aria-label="Abrir formulário de publicação">
        <div class="inline-composer-avatar">${avatarHtml}</div>
        <span class="inline-composer-placeholder">O que está acontecendo na sua rede?</span>
      </div>
      <form class="inline-composer-form hidden" id="form-inline-topic" aria-label="Nova publicação">
        <div class="inline-composer-form-head">
          ${avatarHtml}
          <textarea id="inline-topic-body" class="inline-composer-textarea" rows="3" maxlength="2000" placeholder="Compartilhe texto, #hashtags ou anexe uma foto…" aria-label="Texto da publicação"></textarea>
        </div>
        ${renderComposerAudience()}
        ${renderComposerPreviewWrap()}
        ${renderComposerToolbar()}
        ${renderComposerMeta()}
      </form>
    </div>`;
}