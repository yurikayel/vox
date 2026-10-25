/** @file OAuth, cantina gate, pact/zap/edit modals, people search. */
import * as brcode from "../brcode.js";
import * as i18n from "../i18n-pt-br.js";
import * as postOwnership from "../post-ownership.js";
import { escapeHtml, shortId, renderAvatarHtml } from "./util.js";

const CANTINA_ART_ALT =
  "Ilustração anime de uma cantina: o bartender de túnica bege aponta para a câmera; dois balões pintados na arte dizem 'Seus bots tem que esperar lá fora!' e 'Aqui não servimos esse tipo.'";

const CANTINA_ART =
  `<img class="cantina-art-img" src="./images/cantina-gate.jpg" alt="${CANTINA_ART_ALT}" width="1024" height="575" />`;

/** Ícones inline (GIS / Meta brand — sem asset extra no SW). */
const OAUTH_SVG_GOOGLE = `<svg class="oauth-btn__icon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const OAUTH_SVG_META = `<svg class="oauth-btn__icon oauth-btn__icon--meta" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;

export function renderOAuthEnrich(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay oauth-enrich-overlay" id="oauth-enrich-overlay" role="dialog" aria-modal="true" aria-labelledby="oauth-enrich-title">
      <div class="modal-dialog modal-dialog-solid oauth-enrich-dialog">
        <h2 id="oauth-enrich-title" class="oauth-enrich-title">Como quer aparecer?</h2>
        <p class="desc oauth-enrich-lead">Importe <strong>nome e foto</strong> (opcional). Seu ID na rede continua sendo <code>vx_*</code> neste aparelho — não é login centralizado.</p>
        <div id="oauth-enrich-error" class="oauth-enrich-error" role="alert" aria-live="polite" hidden></div>
        <div class="oauth-enrich-actions">
          <button type="button" id="btn-oauth-google" class="oauth-btn oauth-btn--google" aria-label="Entrar com Google para importar nome e foto">
            ${OAUTH_SVG_GOOGLE}
            <span class="oauth-btn__label">Continuar com Google</span>
          </button>
          <button type="button" id="btn-oauth-meta" class="oauth-btn oauth-btn--meta" aria-label="Entrar com Meta para importar nome e foto">
            ${OAUTH_SVG_META}
            <span class="oauth-btn__label">Continuar com Meta</span>
          </button>
        </div>
        <p class="oauth-enrich-divider" role="presentation"><span>ou</span></p>
        <button type="button" id="btn-oauth-skip" class="oauth-btn oauth-btn--skip">Pular — continuar só com vx_</button>
        <p id="oauth-enrich-error" class="oauth-enrich-error" role="alert" aria-live="polite" hidden></p>
        <p class="meta oauth-enrich-legal">Só claims públicos de perfil; tokens OAuth não são armazenados (LGPD — ver COMPLIANCE-BR.md).</p>
      </div>
    </div>`;
}

export function closeOAuthEnrich(container) {
  if (container) container.innerHTML = "";
}

function renderPeopleResultRow(p) {
  const name = escapeHtml(p.name || p.routeId.slice(0, 14));
  const handle = p.handle ? `@${escapeHtml(p.handle)}` : "";
  const av = renderAvatarHtml(p.routeId, name);
  return `
    <div class="card people-result" style="padding:0.65rem 0.85rem; margin-top:0.45rem; display:flex; gap:0.65rem; align-items:center;">
      ${av}
      <div style="flex:1; min-width:0;">
        <a href="#/u/${encodeURIComponent(p.routeId)}" style="font-weight:600;">${name}</a>
        ${handle ? `<span class="meta"> ${handle}</span>` : ""}
        <p class="meta" style="margin:2px 0 0;"><code>${escapeHtml(shortId(p.routeId))}</code></p>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.25rem;">
        <a class="btn btn-sm btn-outline" href="#/connect/${encodeURIComponent(p.routeId)}">Conectar</a>
        <a class="btn btn-sm btn-primary" href="#/dm/${encodeURIComponent(p.routeId)}">DM</a>
      </div>
    </div>`;
}

function renderPeopleSection(title, people) {
  if (!people?.length) return "";
  const rows = people.map((p) => renderPeopleResultRow(p)).join("");
  return `
    <div class="people-section" style="margin-top:0.75rem;">
      <h3 class="section-title" style="font-size:0.95rem; margin:0 0 0.35rem;">${escapeHtml(title)}</h3>
      ${rows}
    </div>`;
}

export function renderPeopleSearch(main, { sections = null, results = [], query = "" } = {}) {
  const q = escapeHtml(query);
  const hasQuery = Boolean(String(query || "").trim());
  let body = "";
  if (hasQuery) {
    body =
      results.length === 0
        ? `<div class="empty"><p>Nenhuma pessoa encontrada para “${q}”.</p></div>`
        : results.map((p) => renderPeopleResultRow(p)).join("");
  } else if (sections) {
    body =
      renderPeopleSection("Contatos", sections.contacts) +
      renderPeopleSection("Na malha", sections.mesh) +
      renderPeopleSection("Tour (demonstração)", sections.tour);
    if (!sections.contacts?.length && !sections.mesh?.length && !sections.tour?.length) {
      body = `<div class="empty"><p>Ninguém indexado ainda.</p></div>`;
    }
  } else {
    body = results.map((p) => renderPeopleResultRow(p)).join("");
  }

  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 4px;">Pessoas</h2>
      <p class="desc" style="margin:0 0 0.75rem;">Busca local: contatos, autores vistos na malha, cartões opt-in e tour (só se vazio).</p>
      <form id="form-people-search" style="display:flex; gap:0.5rem;">
        <input type="search" id="people-search-input" class="form-control" placeholder="Nome, @handle ou vx_…" value="${q}" />
        <button type="submit" class="btn btn-primary">Buscar</button>
      </form>
      <form id="form-people-paste-link" style="margin-top:0.65rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
        <input type="text" id="people-paste-input" class="form-control" placeholder="#/connect/… ou vx_…" style="flex:1; min-width:12rem;" />
        <button type="submit" class="btn btn-outline">Abrir conexão</button>
      </form>
      <p class="meta" style="margin:0.35rem 0 0; font-size:0.78rem;">Cole um link #/connect ou vx_ para conectar sem busca.</p>
    </div>
    <div class="people-results">${body}</div>`;
}

export function renderPostPactConnectModal(container, routeId) {
  if (!container || !routeId) return;
  const link = `${typeof location !== "undefined" ? location.origin + location.pathname : ""}#/connect/${encodeURIComponent(routeId)}`;
  container.innerHTML = `
    <div class="modal-overlay" id="post-pact-connect-overlay" role="dialog" aria-modal="true" style="z-index:10001;">
      <div class="modal-dialog card" style="max-width:420px;">
        <h3 style="margin:0 0 0.5rem;">Seu link #/connect</h3>
        <p class="desc" style="margin:0 0 0.75rem;">Compartilhe para outros adicionarem você diretamente.</p>
        <p class="meta" style="word-break:break-all;"><code id="post-pact-connect-url">${escapeHtml(link)}</code></p>
        <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
          <button type="button" id="btn-post-pact-share-connect" class="btn btn-primary" data-route="${escapeHtml(routeId)}">Compartilhar</button>
          <button type="button" id="btn-post-pact-connect-close" class="btn btn-outline">Continuar</button>
        </div>
      </div>
    </div>`;
}

export function closePostPactConnectModal(container) {
  if (container) container.innerHTML = "";
}

export function renderConnectPreview(main, profile, routeId, { isContact = false } = {}) {
  const name = escapeHtml(profile?.name || routeId);
  const bio = profile?.bio ? `<p class="desc">${escapeHtml(profile.bio)}</p>` : "";
  const av = renderAvatarHtml(routeId, name);
  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 0.5rem;">Conectar</h2>
      <div style="display:flex; gap:0.75rem; align-items:flex-start;">
        ${av}
        <div>
          <h3 style="margin:0;">${name}</h3>
          <p class="meta"><code>${escapeHtml(routeId)}</code></p>
          ${bio}
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:1rem;">
        <button type="button" id="btn-connect-add" class="btn btn-primary" data-route="${escapeHtml(routeId)}" ${isContact ? "disabled" : ""}>
          ${isContact ? "✓ Já nos contatos" : "Adicionar contato"}
        </button>
        <a class="btn btn-outline" href="#/dm/${encodeURIComponent(routeId)}">Enviar mensagem</a>
        <a class="btn btn-outline" href="#/u/${encodeURIComponent(routeId)}">Ver perfil</a>
        <button type="button" id="btn-connect-share" class="btn btn-outline" data-route="${escapeHtml(routeId)}">Compartilhar link</button>
      </div>
    </div>`;
}

export function renderCantinaGate(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay cantina-overlay" id="cantina-modal-overlay" role="dialog" aria-modal="true" aria-label="Porta da Cantina">
      <div class="modal-dialog cantina-dialog">
        <div class="cantina-art-wrap">
          ${CANTINA_ART}
        </div>
        <div class="cantina-actions" style="display:flex; flex-direction:column; gap:0.6rem;">
          <button id="btn-cantina-enter" class="btn btn-primary btn-cantina-enter" style="padding:0.75rem; font-weight:700; font-size:1rem;">Entrar — sou humano</button>
          <details class="cantina-details" style="font-size:0.82rem; margin-top:0.35rem; cursor:pointer;">
            <summary style="color:var(--muted); text-align:center;">O que isso significa?</summary>
            <p class="desc" style="margin:0.4rem 0 0; text-align:left; font-size:0.8rem; background:var(--surface-soft); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border);">No Vox você não precisa de CPF nem de cadastro sob vigilância. Protegemos o espaço recusando fazendas de automação para que pessoas reais conversem em paz sob o Pacto Vox.</p>
          </details>
        </div>
      </div>
    </div>
  `;
}

export function closeCantinaGate(container) {
  if (container) container.innerHTML = "";
}

export function renderPactModal(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay" id="pact-modal-overlay">
      <div class="modal-dialog">
        <div style="text-align:center; margin-bottom:1rem;">
          <h2 style="margin:0 0 0.25rem; font-size:1.25rem;">Bem-vindo ao Vox</h2>
          <p class="desc" style="margin:0;">Vox populi na prática: conversas e comunidades direto nos aparelhos, sem controle central.</p>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🛡️</div>
          <div>
            <strong>1. Seus dados são seus</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Suas mensagens e publicações pertencem a você. Nenhuma empresa controla sua conta.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">⚡</div>
          <div>
            <strong>2. Rede cooperativa</strong>
            <p class="desc" style="margin:0.2rem 0 0;">O app aberto ajuda a distribuir conteúdos para outros usuários sem servidores caros.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🔒</div>
          <div>
            <strong>3. Controle total</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Respeita conexão Wi-Fi, teto diário de dados e você pode pausar a qualquer momento.</p>
          </div>
        </div>

        <div style="margin-top:1.25rem; display:flex; flex-direction:column; gap:0.5rem;">
          <button id="btn-pact-accept" class="btn btn-primary" style="padding:0.65rem; font-weight:700;">Continuar</button>
          <button id="btn-pact-settings" class="btn btn-outline" style="padding:0.5rem; font-size:0.85rem;">Ajustar rede depois</button>
        </div>
      </div>
    </div>
  `;
}

export function closePactModal(container) {
  if (container) container.innerHTML = "";
}

export function renderZapModal(container, { author = "", authorName = "Autor", pixKey = "", title = "", defaultAmount = 5 } = {}) {
  if (!container) return;
  const initialAmount = defaultAmount || 5;
  let initialPayload = "";
  try {
    initialPayload = brcode.buildPixPayload({
      key: pixKey,
      name: authorName,
      amount: initialAmount,
      description: "Apoio Vox",
    });
  } catch {
    initialPayload = pixKey;
  }

  container.innerHTML = `
    <div class="modal-overlay" id="zap-modal-overlay">
      <div class="modal-dialog zap-modal-dialog" style="max-width: 440px; width: 100%; padding: 1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
          <h3 style="margin:0; font-size:1.15rem; display:flex; align-items:center; gap:6px;">
            <span>⚡</span> Pix Zap para ${escapeHtml(authorName)}
          </h3>
          <button class="btn btn-sm btn-outline btn-close-zap" style="border:none; padding:4px 8px; font-size:1.1rem; cursor:pointer;" aria-label="Fechar">✕</button>
        </div>
        ${title ? `<p class="desc" style="font-size:0.82rem; margin:0 0 0.75rem; color:var(--muted);">${escapeHtml(title.slice(0, 60))}${title.length > 60 ? "…" : ""}</p>` : ""}
        
        <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:6px;">Escolha o valor do apoio:</label>
        <div class="zap-amount-buttons" style="display:flex; gap:6px; margin-bottom:0.75rem;">
          <button class="btn btn-sm btn-zap-val ${initialAmount === 2 ? "btn-primary" : "btn-outline"}" data-val="2">R$ 2</button>
          <button class="btn btn-sm btn-zap-val ${initialAmount === 5 ? "btn-primary" : "btn-outline"}" data-val="5">R$ 5</button>
          <button class="btn btn-sm btn-zap-val ${initialAmount === 10 ? "btn-primary" : "btn-outline"}" data-val="10">R$ 10</button>
          <button class="btn btn-sm btn-zap-val ${![2, 5, 10].includes(initialAmount) ? "btn-primary" : "btn-outline"}" data-val="custom">Outro</button>
        </div>
        
        <div class="zap-custom-container" style="display:${![2, 5, 10].includes(initialAmount) ? "block" : "none"}; margin-bottom:0.75rem;">
          <input type="text" id="zap-custom-input" class="form-control" placeholder="Ex: 15 ou R$ 20,00" value="${![2, 5, 10].includes(initialAmount) ? initialAmount : ""}" style="font-size:0.9rem;" />
        </div>

        <div class="form-group" style="margin-bottom:0.75rem;">
          <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Pix Copia e Cola (BR Code EMV):</label>
          <textarea id="zap-payload-area" class="form-control" rows="3" readonly style="font-family:monospace; font-size:0.75rem; resize:none; word-break:break-all; background:var(--surface-soft);">${escapeHtml(initialPayload)}</textarea>
        </div>

        <button id="btn-copy-zap-payload" class="btn btn-primary" style="width:100%; margin-bottom:0.75rem; font-weight:600;">
          ⚡ Copiar Pix Copia e Cola
        </button>

        <div class="zap-disclaimer banner-info" style="font-size:0.74rem; line-height:1.4; margin:0; padding:0.5rem 0.75rem;">
          🛡️ <strong>O Vox não é PSP:</strong> Código gerado 100% offline no seu navegador. O Vox não custodia valores nem cobra taxas. A liquidação é feita diretamente no seu banco pelo Banco Central.
        </div>
      </div>
    </div>`;
}

export function closeZapModal(container) {
  if (container) container.innerHTML = "";
}

export function postEditInitialText({ title = "", body = "" } = {}) {
  const disp = postOwnership.formatPostDisplay({ title, body });
  if (disp.mode === "caption") return disp.text || "";
  if (disp.mode === "title-body" && body.trim()) return body.trim();
  return [title, body].filter(Boolean).join("\n").trim();
}

export function renderPostEditModal(container, { id = "", title = "", body = "", hasImage = false } = {}) {
  if (!container) return;
  const initialText = postEditInitialText({ title, body });
  const imageRow = hasImage
    ? `<label class="post-edit-remove-image">
        <input type="checkbox" id="post-edit-remove-image" /> Remover imagem anexada
      </label>`
    : "";
  container.innerHTML = `
    <div class="modal-overlay post-edit-overlay" id="post-edit-modal-overlay" role="dialog" aria-modal="true" aria-label="Editar publicação">
      <div class="modal-dialog modal-dialog-solid post-edit-dialog">
        <div class="post-edit-head">
          <h3 class="post-edit-title">Editar publicação</h3>
          <button type="button" class="btn btn-sm btn-outline btn-close-post-edit post-edit-close" aria-label="Fechar">✕</button>
        </div>
        <form id="form-post-edit" data-id="${escapeHtml(id)}">
          <label class="post-edit-label" for="post-edit-text">Texto da publicação</label>
          <textarea id="post-edit-text" class="form-control inline-composer-textarea post-edit-textarea" rows="6" maxlength="5000" required placeholder="O que você quer dizer?">${escapeHtml(initialText)}</textarea>
          <p class="post-edit-char meta" id="post-edit-char" aria-live="polite">${initialText.length} / 5000</p>
          <p class="post-edit-local-hint meta" title="${escapeHtml(i18n.localMutateEditDeleteTooltip)}">${escapeHtml(i18n.localMutateEditDeleteHint)}</p>
          ${imageRow}
          <div class="post-edit-actions">
            <button type="button" class="btn btn-outline btn-cancel-post-edit">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btn-post-edit-save">Salvar</button>
          </div>
        </form>
      </div>
    </div>`;
}

export function closePostEditModal(container) {
  if (container) container.innerHTML = "";
}
