/** @file Direct message inbox and thread UI (DM v2: quote-reply, reactions, context cards, unread/pin/search). */
import * as profileDirectory from "../profile-directory.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "../vox-welcome-profile.js";
import {
  DM_REACTION_EMOJIS,
  extractInlineVoxCard,
  isPeerPinned,
  sortAndFilterConversations,
} from "../dm-messenger.js";
import { escapeHtml, shortId, renderAvatarHtml } from "./util.js";

function resolvePeerLabel(peer) {
  if (!peer) return "";
  if (peer === WELCOME_ROUTE_ID) return getWelcomeProfile().name;
  return profileDirectory.getAuthorDisplaySync(peer) || shortId(peer);
}

function renderInboxPinButton(peer, isWelcome, pinned) {
  if (isWelcome) return "";
  const cls = `btn-dm-pin${pinned ? " active is-pinned" : ""}`;
  const label = pinned ? "Desafixar conversa" : "Fixar conversa";
  return `<button type="button" class="${cls}" data-peer="${escapeHtml(peer)}" title="${label}" aria-label="${label}">📌</button>`;
}

function renderDmInboxItem(c) {
  const peer = c.peerAddress || "";
  const label = resolvePeerLabel(peer);
  const timeStr = c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const isWelcome = peer === WELCOME_ROUTE_ID;
  const pinned = !isWelcome && isPeerPinned(peer);
  const unread = Number(c.unreadCount) || 0;
  const welcomeBadge = isWelcome ? `<span class="badge-pill" style="font-size:0.65rem;">Boas-vindas</span> ` : "";
  const pinBadge = pinned ? `<span class="badge-pill dm-pin-pill" title="Fixada">📌</span> ` : "";
  const unreadBadge = unread > 0 ? `<span class="dm-unread-badge" aria-label="${unread} não lidas">${unread}</span>` : "";
  const rowCls = `dm-inbox-row${unread > 0 ? " is-unread" : ""}${pinned ? " is-pinned" : ""}`;

  return `
    <div class="${rowCls}">
      <a class="dm-inbox-item" href="#/dm/${encodeURIComponent(peer)}">
        <div class="dm-inbox-avatar">${renderAvatarHtml(peer, label)}</div>
        <div class="dm-inbox-body">
          <div class="dm-inbox-header">
            <span class="dm-inbox-peer">${welcomeBadge}${pinBadge}${escapeHtml(label)}</span>
            <span class="dm-inbox-meta-right">${unreadBadge}<span class="meta" style="font-size:0.75rem;">${timeStr}</span></span>
          </div>
          <p class="dm-inbox-preview">${escapeHtml(c.lastText || c.lastMessage?.text || "")}</p>
        </div>
      </a>
      ${renderInboxPinButton(peer, isWelcome, pinned)}
    </div>`;
}

function renderContactQuickHtml(contactList = []) {
  if (!contactList.length) return "";
  const chips = contactList
    .slice(0, 12)
    .map((c) => {
      const label = c.label || resolvePeerLabel(c.routeId);
      return `<a class="btn btn-sm btn-outline" href="#/dm/${encodeURIComponent(c.routeId)}">${escapeHtml(label)}</a>`;
    })
    .join("");
  return `<div class="dm-contact-quick">
    <span class="section-title">Contatos salvos</span>
    <div class="dm-contact-chips">${chips}</div>
  </div>`;
}

function renderDmAdvancedSection(contactList = []) {
  const datalistOptions = contactList
    .map((c) => `<option value="${escapeHtml(c.routeId)}">${escapeHtml(c.label || resolvePeerLabel(c.routeId))}</option>`)
    .join("");
  return `
    <details class="dm-advanced">
      <summary class="dm-advanced-summary">Opções avançadas</summary>
      <div class="dm-advanced-body">
        <p class="desc dm-advanced-blurb"><strong>Copiar meu link</strong> — manda para alguém te achar nas mensagens.</p>
        <p class="desc dm-advanced-blurb"><strong>Colar código ou link</strong> — use se a pessoa te enviou um convite do Vox.</p>
        <form id="form-new-dm" class="dm-advanced-form">
          <input type="text" id="dm-peer-input" class="form-control" list="dm-contact-suggestions" placeholder="Cole o convite ou busque um contato" autocomplete="off" />
          <datalist id="dm-contact-suggestions">${datalistOptions}</datalist>
          <button type="submit" class="btn btn-primary">Abrir conversa</button>
        </form>
        <p class="meta dm-advanced-privacy">Suas mensagens ficam só neste navegador. Sem servidor lendo o texto.</p>
      </div>
    </details>`;
}

function renderDmHeroCard(contactList = []) {
  return `
    <div class="card dm-hero-simple">
      <h2 class="dm-hero-title">Mensagens</h2>
      <p class="desc dm-hero-lead">Conversas privadas neste navegador.</p>
      <div class="dm-hero-actions">
        <a href="#/people" class="btn btn-primary dm-hero-primary">Nova conversa</a>
        <button type="button" id="btn-copy-my-dm-link" class="btn btn-outline">Copiar meu link</button>
      </div>
      ${renderContactQuickHtml(contactList)}
    </div>`;
}

export function renderDmList(main, conversations = [], myAddress = "", { contactList = [], searchQuery = "" } = {}) {
  const sorted = sortAndFilterConversations(conversations, { query: searchQuery, welcomeId: WELCOME_ROUTE_ID, resolveLabel: resolvePeerLabel });
  const emptyText = searchQuery ? "Nenhuma conversa encontrada para esta busca." : "Nenhuma conversa ainda. Toque em <strong>Nova conversa</strong> ou peça para alguém te mandar mensagem.";
  const listHtml = !sorted.length ? `<div class="empty dm-empty-state"><p>${emptyText}</p></div>` : `<div class="dm-inbox-list" id="dm-inbox-list">${sorted.map(renderDmInboxItem).join("")}</div>`;

  main.innerHTML = `
    ${renderDmHeroCard(contactList)}
    <div class="actions-bar dm-recent-bar">
      <span class="section-title">Conversas recentes</span>
      <div class="dm-recent-controls">
        <input type="search" id="dm-search-input" class="form-control dm-search-input" value="${escapeHtml(searchQuery)}" placeholder="Buscar conversa…" aria-label="Buscar conversa" />
        <button type="button" id="btn-pull-inbox" class="btn btn-sm btn-outline">Atualizar</button>
      </div>
    </div>
    ${listHtml}
    ${renderDmAdvancedSection(contactList)}`;
}

function renderBubbleReplyQuote(replyTo) {
  if (!replyTo?.id || !replyTo?.snippet) return "";
  const who = replyTo.author ? resolvePeerLabel(replyTo.author) : "Mensagem";
  return `
    <blockquote class="dm-quote-block" data-reply-id="${escapeHtml(replyTo.id)}">
      <strong class="dm-quote-author">${escapeHtml(who)}</strong>
      <span class="dm-quote-snippet">${escapeHtml(replyTo.snippet)}</span>
    </blockquote>`;
}

function renderBubbleContextCard(card) {
  if (!card) return "";
  const badge = card.type === "listing" ? "🛒 Oferta da Feira" : card.type === "pix" ? "⚡ Pix" : "💬 Tópico";
  const priceHtml = card.price ? `<span class="dm-context-price">${escapeHtml(card.price)}</span>` : "";
  const linkHtml = card.url ? `<a class="dm-context-link" href="${escapeHtml(card.url)}">Abrir →</a>` : "";
  const pixBtn = card.pixKey
    ? `<button type="button" class="btn btn-sm btn-outline btn-dm-copy-pix" data-pix="${escapeHtml(card.pixKey)}" data-title="${escapeHtml(card.title)}">⚡ Copiar Pix</button>`
    : "";
  return `
    <div class="dm-context-card" data-card-type="${escapeHtml(card.type)}">
      <div class="dm-context-head"><span class="dm-context-kicker">${badge}</span>${priceHtml}</div>
      <div class="dm-context-title">${escapeHtml(card.title)}</div>
      <div class="dm-context-actions">${linkHtml}${pixBtn}</div>
    </div>`;
}

function renderBubbleReactions(m, myAddress) {
  const reactions = m.reactions && typeof m.reactions === "object" ? m.reactions : {};
  const activePills = Object.entries(reactions)
    .filter(([, list]) => Array.isArray(list) && list.length > 0)
    .map(([emoji, list]) => {
      const mine = myAddress && list.includes(myAddress);
      return `<button type="button" class="dm-reaction-pill${mine ? " active" : ""}" data-msg-id="${escapeHtml(m.id)}" data-emoji="${escapeHtml(emoji)}" aria-label="Reação ${escapeHtml(emoji)} (${list.length})">${escapeHtml(emoji)} <span>${list.length}</span></button>`;
    })
    .join("");
  const quickBtns = DM_REACTION_EMOJIS.map(
    (em) => `<button type="button" class="btn-dm-react-pick" data-msg-id="${escapeHtml(m.id)}" data-emoji="${escapeHtml(em)}" title="Reagir com ${escapeHtml(em)}" aria-label="Reagir com ${escapeHtml(em)}">${escapeHtml(em)}</button>`
  ).join("");
  const snippet = String(m.text || "").slice(0, 80);
  return `
    <div class="dm-bubble-bar">
      <div class="dm-reaction-pills">${activePills}</div>
      <div class="dm-bubble-tools">
        <div class="dm-react-picker" role="group" aria-label="Reações rápidas">${quickBtns}</div>
        <button type="button" class="btn-dm-reply-msg" data-msg-id="${escapeHtml(m.id)}" data-msg-author="${escapeHtml(m.from || "")}" data-msg-snippet="${escapeHtml(snippet)}" title="Responder esta mensagem" aria-label="Responder mensagem">↩ Responder</button>
      </div>
    </div>`;
}

function renderDmMessageBubbles(messages, myAddress) {
  if (!messages.length) {
    return `<div class="empty" style="text-align:center; padding:1.5rem 0;"><p>Início da conversa. As mensagens ficam só neste navegador.</p></div>`;
  }
  return messages
    .map((m) => {
      const cls = m.from === myAddress || m.status === "sent" ? "sent" : "received";
      const timeStr = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const statusLabel = m.status === "delivered" ? "✓✓ Direta" : m.status === "queued-relay" ? "✓ Caixa postal" : "✓";
      const card = m.contextCard || extractInlineVoxCard(m.text);
      return `
        <div class="dm-bubble ${cls}" data-msg-id="${escapeHtml(m.id)}">
          ${renderBubbleReplyQuote(m.replyTo)}
          ${renderBubbleContextCard(card)}
          <div class="dm-bubble-text">${escapeHtml(m.text)}</div>
          <div class="dm-bubble-meta">${timeStr} · ${statusLabel}</div>
          ${renderBubbleReactions(m, myAddress)}
        </div>`;
    })
    .join("");
}

function renderWelcomeThreadIntro() {
  const profileHref = `#/u/${encodeURIComponent(WELCOME_ROUTE_ID)}`;
  return `
    <div class="dm-welcome-intro card" role="complementary" aria-label="Boas-vindas Vox">
      <p class="desc" style="margin:0 0 0.5rem; font-size:0.88rem;">Conta oficial 📣 — dicas rápidas sem encher o feed.</p>
      <p style="margin:0; font-size:0.88rem;">
        <a href="#/people">Encontrar pessoas</a><span class="meta"> · </span>
        <a href="#/voxpedia">Voxpedia</a><span class="meta"> · </span>
        <a href="${profileHref}">Ver perfil</a>
      </p>
    </div>`;
}

function renderContextDraftBanner(card) {
  if (!card) return "";
  const price = card.price ? ` · <strong>${escapeHtml(card.price)}</strong>` : "";
  return `
    <div class="dm-draft-banner dm-context-draft-bar" id="dm-context-draft-bar" role="status">
      <div class="dm-draft-info">
        <span class="dm-draft-kicker">🛒 Anexado à próxima mensagem:</span>
        <span class="dm-draft-text">${escapeHtml(card.title)}${price}</span>
      </div>
      <button type="button" class="btn-dm-draft-close" id="btn-clear-dm-context" aria-label="Remover cartão anexado">×</button>
    </div>`;
}

function renderThreadKeyWarning(hasDmPub) {
  if (hasDmPub) return "";
  return `<details class="dm-advanced dm-thread-advanced">
    <summary class="dm-advanced-summary">Ativar conversa (modo técnico)</summary>
    <div class="dm-advanced-body">
      <p class="desc">Falta a chave desta pessoa. Cole o código que ela te passou:</p>
      <div class="dm-advanced-form">
        <input type="text" id="input-manual-dmpub" class="form-control" placeholder='{"kty":"EC","crv":"P-256",...}' />
        <button type="button" id="btn-save-manual-dmpub" class="btn btn-sm btn-primary">Salvar</button>
      </div>
    </div>
  </details>`;
}

function renderThreadComposerHtml(hasDmPub, pendingContextCard) {
  return `
    <div class="dm-composer-stack">
      ${renderContextDraftBanner(pendingContextCard)}
      <div class="dm-draft-banner dm-reply-draft-bar" id="dm-reply-draft-bar" hidden>
        <div class="dm-draft-info">
          <span class="dm-draft-kicker">↩ Respondendo:</span>
          <span class="dm-draft-text" id="dm-reply-draft-text"></span>
        </div>
        <button type="button" class="btn-dm-draft-close" id="btn-cancel-dm-reply" aria-label="Cancelar resposta">×</button>
      </div>
      <form id="form-send-dm" class="dm-form-sticky">
        <input type="text" id="dm-message-input" class="form-control" placeholder="Escreva aqui…" required autocomplete="off" />
        <button type="submit" id="btn-send-dm" class="btn btn-primary" ${!hasDmPub ? "disabled" : ""}>Enviar</button>
      </form>
    </div>`;
}

export function renderDmThread(main, peerAddress, messages = [], myAddress = "", opts = {}) {
  const { isRtcOnline = false, hasDmPub = false, pendingContextCard = null } = opts;
  const peerLabel = resolvePeerLabel(peerAddress);
  const welcomeIntro = peerAddress === WELCOME_ROUTE_ID ? renderWelcomeThreadIntro() : "";
  const statusBadge = isRtcOnline
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">Online agora</span>`
    : `<span class="badge-pill">Entrega quando conectar</span>`;

  main.innerHTML = `
    <a class="back-link" href="#/dm">← Voltar às conversas</a>
    ${welcomeIntro}
    ${renderThreadKeyWarning(hasDmPub)}
    <div class="dm-thread-container">
      <div class="dm-thread-header">
        <div><strong style="font-size:0.95rem;"><a href="#/u/${encodeURIComponent(peerAddress)}">${escapeHtml(peerLabel)}</a></strong></div>
        <div>${statusBadge}</div>
      </div>
      <div class="dm-thread-list" id="dm-thread-container">${renderDmMessageBubbles(messages, myAddress)}</div>
      ${renderThreadComposerHtml(hasDmPub, pendingContextCard)}
    </div>`;
}
