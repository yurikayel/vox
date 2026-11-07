/** @file UI do painel de contas vinculadas, login social e auto-replicação. */

import { escapeHtml } from "./util.js";
import {
  SUPPORTED_NETWORKS,
  loadLinkedAccounts,
  isAutoReplicationEnabled,
  getGeneralWebhookUrl,
  getSuggestedHandle,
} from "../linked-accounts.js";

function connectedWho(linkedData) {
  return linkedData?.handle ? `@${escapeHtml(linkedData.handle)}` : escapeHtml(linkedData?.displayName || "conta conectada");
}

function renderConnectedExtras(linkedData) {
  const webhook = linkedData?.webhook || "";
  const appPwd = linkedData?.appPassword ? `<p class="meta" style="margin:0 0 4px; font-size:0.75rem; color:var(--success);">🦋 AT Protocol direto configurado</p>` : "";
  const hook = webhook ? `<p class="meta" style="margin:0 0 4px; font-size:0.75rem;">Webhook ativo: <code>${escapeHtml(webhook.slice(0, 32))}…</code></p>` : "";
  return appPwd + hook;
}

function renderConnectedCardBody(net, linkedData) {
  const who = connectedWho(linkedData);
  const enabled = linkedData?.enabled ?? true;
  const label = linkedData?.via === "oauth" ? "Conectado por login como" : "Usuário:";

  return `
    <div class="linked-connected-info" style="font-size:0.82rem; margin-bottom:0.6rem;">
      <p style="margin:0 0 4px;">${label} <strong>${who}</strong></p>
      ${renderConnectedExtras(linkedData)}
      <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; cursor:pointer; margin-top:4px;">
        <input type="checkbox" class="chk-network-replicate" data-net-id="${escapeHtml(net.id)}" ${enabled ? "checked" : ""} />
        Replicar posts nesta rede
      </label>
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      <button type="button" class="btn btn-sm btn-primary btn-test-network" data-net-id="${escapeHtml(net.id)}">🧪 Testar se conectou</button>
      ${linkedData?.verified ? "" : `<button type="button" class="btn btn-sm btn-outline btn-confirm-network" data-net-id="${escapeHtml(net.id)}">É minha conta</button>`}
      <button type="button" class="btn btn-sm btn-outline btn-unlink-network" data-net-id="${escapeHtml(net.id)}">Desconectar ${who}</button>
    </div>
    <div class="linked-test-feedback" id="test-feedback-${escapeHtml(net.id)}" style="display:none; font-size:0.78rem; padding:6px 8px; border-radius:var(--radius-sm); margin-top:6px;"></div>`;
}

function renderAdvancedCredentialsForm(net) {
  return `
        <details class="network-advanced-opts" style="margin-top:2px; font-size:0.75rem; color:var(--muted);">
          <summary style="cursor:pointer; user-select:none; padding:2px 0;">⚙️ Configuração avançada (App Password / Webhook manual)</summary>
          <form class="form-link-network" data-net-id="${escapeHtml(net.id)}" style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">
            ${net.supportsAtProto ? `
              <input type="password" class="input-net-app-password form-control" placeholder="App Password Bluesky (opcional — post direto ATProto)" autocomplete="off" style="font-size:0.75rem; padding:4px 8px;" />
            ` : ""}
            ${net.canAutoWebhook ? `
              <input type="url" class="input-net-webhook form-control" placeholder="URL do Webhook pessoal (opcional — n8n/Make/Zapier)..." style="font-size:0.75rem; padding:4px 8px;" />
            ` : ""}
            <button type="submit" class="btn btn-xs btn-outline" style="align-self:flex-start;">Salvar credenciais manuais</button>
          </form>
        </details>`;
}

const HANDLE_PLACEHOLDERS = { bsky: "voce.bsky.social", github: "seu-usuario" };

const LOGIN_NOTES = {
  facebook: "A Meta não informa o @usuário — conectamos a sua identidade.",
  instagram: "Só contas profissionais (Comercial ou Criador).",
};

/** Botão "Conectar com login": Bluesky sempre; demais só se o deploy configurou o app. */
function renderSocialLoginButton(net) {
  const always = net.id === "bsky";
  const note = LOGIN_NOTES[net.id] ? `<span class="meta" style="font-size:0.75rem; color:var(--muted);">${escapeHtml(LOGIN_NOTES[net.id])}</span>` : "";
  return `
        <div class="social-login-row" data-login-net="${escapeHtml(net.id)}" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;"${always ? "" : " hidden"}>
          <button type="button" class="btn btn-sm btn-primary btn-social-login" data-net-id="${escapeHtml(net.id)}">${net.icon} Conectar com ${escapeHtml(net.name)}</button>
          ${note}
        </div>`;
}

function renderLinkNetworkForm(net) {
  const suggested = getSuggestedHandle(net.id);
  return `
    <div class="network-connect-box" data-net-id="${escapeHtml(net.id)}" style="margin-top:0.4rem;">
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${renderSocialLoginButton(net)}
        <details class="manual-link-details" data-manual-net="${escapeHtml(net.id)}"${net.id === "bsky" ? "" : " open"}>
          <summary style="cursor:pointer; font-size:0.78rem; color:var(--muted);">Vincular manualmente (sem login)</summary>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:6px;">
          <span class="meta" style="font-size:0.82rem; font-weight:600; color:var(--muted);">@</span>
          <input type="text" class="input-net-handle form-control" placeholder="${escapeHtml(HANDLE_PLACEHOLDERS[net.id] || "seu_usuario")}" value="${escapeHtml(suggested)}" autocomplete="off" autocapitalize="off" spellcheck="false" style="font-size:0.8rem; padding:4px 8px; max-width:240px;" aria-label="Seu usuário no ${escapeHtml(net.name)}" />
          <button type="button" class="btn btn-sm btn-primary btn-one-click-connect" data-net-id="${escapeHtml(net.id)}">Vincular ${escapeHtml(net.name)}</button>
        </div>
        <p class="meta" style="margin:0; font-size:0.75rem; color:var(--muted);">Digite o <strong>seu</strong> @usuário. Vamos abrir o perfil para você conferir — o Vox não faz login na sua conta.</p>
        </details>
        ${renderAdvancedCredentialsForm(net)}
      </div>
    </div>`;
}

function renderNetworkCard(net, linkedData) {
  const isLinked = Boolean(linkedData?.handle || linkedData?.via === "oauth");
  const verifiedBadge = `<span class="badge badge-success" style="font-size:0.7rem; background:rgba(22,163,74,0.15); color:#16a34a; border:1px solid #16a34a; padding:2px 6px; border-radius:999px;">🟢 Verificado</span>`;
  const unverifiedBadge = `<span class="badge badge-warning" style="font-size:0.7rem; background:rgba(231,194,107,0.12); color:var(--sa-secondary, #b07a00); border:1px solid currentColor; padding:2px 6px; border-radius:999px;">🟡 Não verificado</span>`;
  const statusBadge = isLinked
    ? (linkedData?.verified ? verifiedBadge : unverifiedBadge)
    : `<span class="badge badge-muted" style="font-size:0.7rem; background:var(--surface-soft); color:var(--muted); border:1px solid var(--outline); padding:2px 6px; border-radius:999px;">⚪ Não conectado</span>`;

  return `
    <div class="card linked-network-card" data-net-id="${escapeHtml(net.id)}" style="padding:0.85rem; border:1px solid var(--outline); border-radius:var(--radius-sm); margin-bottom:0.75rem; background:var(--surface);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.4rem;">${net.icon}</span>
          <strong>${escapeHtml(net.name)}</strong>
        </div>
        ${statusBadge}
      </div>
      ${isLinked ? renderConnectedCardBody(net, linkedData) : renderLinkNetworkForm(net)}
    </div>`;
}

function renderAutoReplicationCheckboxHtml(autoRep) {
  return `
      <div style="padding:0.75rem; background:var(--surface-soft); border-radius:var(--radius-sm); margin-bottom:1rem; border:1px solid var(--outline);">
        <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:0.9rem; cursor:pointer;">
          <input type="checkbox" id="chk-auto-replicate-master" ${autoRep ? "checked" : ""} />
          <span>⚡ Ativar Auto-Replicação ao Publicar</span>
        </label>
        <p class="meta" style="margin:4px 0 0 24px; font-size:0.78rem;">
          Quando ativado, novos posts no Vox disparam automaticamente para as redes vinculadas habilitadas.
        </p>
      </div>`;
}

function renderGeneralWebhookInputHtml(generalWebhook) {
  return `
      <div style="margin-bottom:0.25rem;">
        <label for="input-general-webhook" style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">
          Webhook Unificado de Automação (n8n / Make / Zapier):
        </label>
        <div style="display:flex; gap:8px;">
          <input type="url" id="input-general-webhook" class="form-control" placeholder="https://seu-n8n.com/webhook/vox-replicate" value="${escapeHtml(generalWebhook)}" style="font-size:0.8rem; flex:1;" />
          <button type="button" id="btn-save-general-webhook" class="btn btn-sm btn-primary">Salvar</button>
        </div>
      </div>`;
}

function renderAutoReplicationBannerHtml(autoRep, generalWebhook) {
  return `
    <div class="card" style="margin:0.75rem 0 1.25rem; padding:1rem; border:1px solid var(--outline); border-radius:var(--radius-sm); background:var(--surface);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:0.5rem;">
        <h2 style="font-size:1.2rem; margin:0; display:flex; align-items:center; gap:8px;">
          <span>🔗</span> Redes Vinculadas & Auto-Replicação
        </h2>
        <button type="button" id="btn-open-oauth-from-linked" class="btn btn-sm btn-outline">🔐 Login Google / Meta / GitHub</button>
      </div>
      <p class="desc" style="font-size:0.84rem; margin:0 0 0.85rem; color:var(--muted);">
        O Vox é o seu escudo cívico soberano. Publique com sua chave <code>vx_*</code> permanente e replique automaticamente para as Big Techs (ATProto direto no Bluesky + Webhooks pessoais + Launchpad em 1 toque).
      </p>
      ${renderAutoReplicationCheckboxHtml(autoRep)}
      ${renderGeneralWebhookInputHtml(generalWebhook)}
    </div>`;
}

export function renderLinkedAccountsHtml() {
  const accounts = loadLinkedAccounts();
  const autoRep = isAutoReplicationEnabled();
  const generalWebhook = getGeneralWebhookUrl();
  const cardsHtml = SUPPORTED_NETWORKS.map((net) => renderNetworkCard(net, accounts[net.id])).join("");

  return `
    <div class="linked-accounts-screen" style="max-width:680px; margin:0 auto; padding:1rem 0.5rem;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <a class="back-link" href="#/settings/network">← Voltar às Configurações de Rede</a>
        <a class="btn btn-xs btn-outline" href="#/?feed=external">🌐 Ver Feeds Externos</a>
      </div>
      ${renderAutoReplicationBannerHtml(autoRep, generalWebhook)}
      <h3 style="font-size:1rem; margin:1rem 0 0.6rem;">Redes Sociais Suportadas</h3>
      <div class="linked-networks-grid">${cardsHtml}</div>
    </div>`;
}

export function renderLinkedAccountsPage(main) {
  if (!main) return;
  main.innerHTML = renderLinkedAccountsHtml();
}
