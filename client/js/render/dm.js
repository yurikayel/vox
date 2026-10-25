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
    listHtml = `<div class="empty"><p>Nenhuma conversa privada ainda.</p></div>`;
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

  const contactChips =
    contactList.length === 0
      ? ""
      : `<div class="card" style="margin-top:0.5rem; padding:0.55rem 0.75rem;">
          <span class="section-title" style="font-size:0.82rem;">Contatos</span>
          <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.35rem;">
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
    <div class="card">
      <h2 style="margin:0 0 2px;">Mensagens</h2>
      <p class="desc" style="margin:0 0 8px;">Privadas. Só neste aparelho. Criptografia ponta a ponta sem nuvem.</p>
      
      <div style="background:var(--surface-soft); border:1px solid var(--border); padding:8px 12px; border-radius:var(--radius-sm); margin:8px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span class="meta" style="font-size:0.8rem;">Seu link de mensagens: <code>${escapeHtml(shortId(myAddress))}</code></span>
        <button id="btn-copy-my-dm-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(myAddress)}">📋 Copiar Link</button>
      </div>

      <form id="form-new-dm" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
        <input type="text" id="dm-peer-input" class="form-control" list="dm-contact-suggestions" placeholder="vx_…, #/connect/… ou contato" required />
        <datalist id="dm-contact-suggestions">${datalistOptions}</datalist>
        <button type="submit" class="btn btn-primary" style="white-space:nowrap;">Conversar →</button>
      </form>
    </div>
    ${contactChips}

    <div class="actions-bar">
      <span class="section-title">Conversas Recentes</span>
      <button id="btn-pull-inbox" class="btn btn-sm btn-outline">🔄 Atualizar</button>
    </div>
    ${listHtml}
  `;
}

function renderDmMessageBubbles(messages, myAddress, peerAddress) {
  if (!messages.length) {
    return `<div class="empty" style="text-align:center; padding:1.5rem 0;"><p>Início da conversa com ${escapeHtml(shortId(peerAddress))}. Mensagens salvas apenas neste aparelho.</p></div>`;
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

export function renderDmThread(main, peerAddress, messages = [], myAddress = "", { isRtcOnline = false, hasDmPub = false } = {}) {
  const statusBadge = isRtcOnline
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">🟢 Conectado</span>`
    : `<span class="badge-pill">📦 Entrega offline</span>`;

  const keyWarning = !hasDmPub
    ? `<div class="card error" style="margin-bottom:0.75rem;">
        ⚠️ Chave de <code>${escapeHtml(shortId(peerAddress))}</code> não encontrada. Cole para ativar conversa privada:
        <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
          <input type="text" id="input-manual-dmpub" class="form-control" placeholder='{"kty":"EC","crv":"P-256",...}' />
          <button type="button" id="btn-save-manual-dmpub" class="btn btn-sm btn-primary">Salvar</button>
        </div>
      </div>`
    : "";

  main.innerHTML = `
    <a class="back-link" href="#/dm">← Voltar às conversas</a>
    ${keyWarning}

    <div class="dm-thread-container">
      <div class="dm-thread-header">
        <div>
          <strong style="font-size:0.95rem;"><a href="#/u/${encodeURIComponent(peerAddress)}">${escapeHtml(shortId(peerAddress))}</a></strong>
        </div>
        <div>${statusBadge}</div>
      </div>

      <div class="dm-thread-list" id="dm-thread-container">
        ${renderDmMessageBubbles(messages, myAddress, peerAddress)}
      </div>

      <form id="form-send-dm" class="dm-form-sticky">
        <input type="text" id="dm-message-input" class="form-control" placeholder="Mensagem privada..." required autocomplete="off" />
        <button type="submit" id="btn-send-dm" class="btn btn-primary" ${!hasDmPub ? "disabled" : ""}>Enviar 🔒</button>
      </form>
    </div>
  `;
}
