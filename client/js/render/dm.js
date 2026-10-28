/** @file Direct message inbox and thread UI. */
import * as profileDirectory from "../profile-directory.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "../vox-welcome-profile.js";
import { escapeHtml, shortId, renderAvatarHtml } from "./util.js";

export function renderDmList(main, conversations = [], myAddress = "", { contactList = [] } = {}) {
  const sorted = [...conversations].sort((a, b) => {
    if (a.peerAddress === WELCOME_ROUTE_ID) return -1;
    if (b.peerAddress === WELCOME_ROUTE_ID) return 1;
    return (b.lastTs || 0) - (a.lastTs || 0);
  });

  let listHtml = "";
  if (!sorted.length) {
    listHtml = `<div class="empty dm-empty-state"><p>Nenhuma conversa ainda. Toque em <strong>Nova conversa</strong> ou peça para alguém te mandar mensagem.</p></div>`;
  } else {
    const items = sorted
      .map((c) => {
        const peer = c.peerAddress || "";
        const label =
          profileDirectory.getAuthorDisplaySync(peer) || (peer === WELCOME_ROUTE_ID ? getWelcomeProfile().name : shortId(peer));
        const timeStr = c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const pin = peer === WELCOME_ROUTE_ID ? `<span class="badge-pill" style="font-size:0.65rem;">Boas-vindas</span> ` : "";
        const avInner = renderAvatarHtml(peer, label);
        return `
          <a class="dm-inbox-item" href="#/dm/${encodeURIComponent(peer)}">
            <div class="dm-inbox-avatar">${avInner}</div>
            <div class="dm-inbox-body">
              <div class="dm-inbox-header">
                <span class="dm-inbox-peer">${pin}${escapeHtml(label)}</span>
                <span class="meta" style="font-size:0.75rem;">${timeStr}</span>
              </div>
              <p class="dm-inbox-preview">${escapeHtml(c.lastText)}</p>
            </div>
          </a>`;
      })
      .join("");
    listHtml = `<div class="dm-inbox-list">${items}</div>`;
  }

  const contactQuick =
    contactList.length === 0
      ? ""
      : `<div class="dm-contact-quick">
          <span class="section-title">Contatos salvos</span>
          <div class="dm-contact-chips">
            ${contactList
              .slice(0, 12)
              .map((c) => {
                const label = c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || shortId(c.routeId);
                return `<a class="btn btn-sm btn-outline" href="#/dm/${encodeURIComponent(c.routeId)}">${escapeHtml(label)}</a>`;
              })
              .join("")}
          </div>
        </div>`;

  const datalistOptions = contactList
    .map((c) => {
      const label = c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || "";
      return `<option value="${escapeHtml(c.routeId)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  main.innerHTML = `
    <div class="card dm-hero-simple">
      <h2 class="dm-hero-title">Mensagens</h2>
      <p class="desc dm-hero-lead">Conversas privadas neste navegador.</p>
      <div class="dm-hero-actions">
        <a href="#/people" class="btn btn-primary dm-hero-primary">Nova conversa</a>
        <button type="button" id="btn-copy-my-dm-link" class="btn btn-outline">Copiar meu link</button>
      </div>
      ${contactQuick}
    </div>

    <div class="actions-bar dm-recent-bar">
      <span class="section-title">Conversas recentes</span>
      <button type="button" id="btn-pull-inbox" class="btn btn-sm btn-outline">Atualizar</button>
    </div>
    ${listHtml}

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
    </details>
  `;
}

function renderDmMessageBubbles(messages, myAddress, peerAddress) {
  if (!messages.length) {
    return `<div class="empty" style="text-align:center; padding:1.5rem 0;"><p>Início da conversa. As mensagens ficam só neste navegador.</p></div>`;
  }
  return messages
    .map((m) => {
      const isSent = m.from === myAddress || m.status === "sent";
      const cls = isSent ? "sent" : "received";
      const timeStr = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const statusLabel = m.status === "delivered" ? "✓✓ Direta" : m.status === "queued-relay" ? "✓ Caixa postal" : "✓";
      return `
        <div class="dm-bubble ${cls}">
          <div>${escapeHtml(m.text)}</div>
          <div class="dm-bubble-meta">${timeStr} · ${statusLabel}</div>
        </div>`;
    })
    .join("");
}

function renderWelcomeThreadIntro() {
  const profileHref = `#/u/${encodeURIComponent(WELCOME_ROUTE_ID)}`;
  return `
    <div class="dm-welcome-intro card" role="complementary" aria-label="Boas-vindas Vox">
      <p class="desc" style="margin:0 0 0.5rem; font-size:0.88rem;">
        Conta oficial 📣 — dicas rápidas sem encher o feed.
      </p>
      <p style="margin:0; font-size:0.88rem;">
        <a href="#/people">Encontrar pessoas</a>
        <span class="meta"> · </span>
        <a href="#/voxpedia">Voxpedia</a>
        <span class="meta"> · </span>
        <a href="${profileHref}">Ver perfil</a>
      </p>
    </div>`;
}

export function renderDmThread(main, peerAddress, messages = [], myAddress = "", { isRtcOnline = false, hasDmPub = false } = {}) {
  const peerLabel =
    profileDirectory.getAuthorDisplaySync(peerAddress) ||
    (peerAddress === WELCOME_ROUTE_ID ? getWelcomeProfile().name : shortId(peerAddress));

  const welcomeIntro = peerAddress === WELCOME_ROUTE_ID ? renderWelcomeThreadIntro() : "";

  const statusBadge = isRtcOnline
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">Online agora</span>`
    : `<span class="badge-pill">Entrega quando conectar</span>`;

  const keyWarning = !hasDmPub
    ? `<details class="dm-advanced dm-thread-advanced">
        <summary class="dm-advanced-summary">Ativar conversa (modo técnico)</summary>
        <div class="dm-advanced-body">
          <p class="desc">Falta a chave desta pessoa. Cole o código que ela te passou:</p>
          <div class="dm-advanced-form">
            <input type="text" id="input-manual-dmpub" class="form-control" placeholder='{"kty":"EC","crv":"P-256",...}' />
            <button type="button" id="btn-save-manual-dmpub" class="btn btn-sm btn-primary">Salvar</button>
          </div>
        </div>
      </details>`
    : "";

  main.innerHTML = `
    <a class="back-link" href="#/dm">← Voltar às conversas</a>
    ${welcomeIntro}
    ${keyWarning}

    <div class="dm-thread-container">
      <div class="dm-thread-header">
        <div>
          <strong style="font-size:0.95rem;"><a href="#/u/${encodeURIComponent(peerAddress)}">${escapeHtml(peerLabel)}</a></strong>
        </div>
        <div>${statusBadge}</div>
      </div>

      <div class="dm-thread-list" id="dm-thread-container">
        ${renderDmMessageBubbles(messages, myAddress, peerAddress)}
      </div>

      <form id="form-send-dm" class="dm-form-sticky">
        <input type="text" id="dm-message-input" class="form-control" placeholder="Escreva aqui…" required autocomplete="off" />
        <button type="submit" id="btn-send-dm" class="btn btn-primary" ${!hasDmPub ? "disabled" : ""}>Enviar</button>
      </form>
    </div>
  `;
}
