/** @file UI do painel de contas vinculadas, login social e auto-replicação. */

import { escapeHtml } from "./util.js";
import {
  SUPPORTED_NETWORKS,
  loadLinkedAccounts,
  isAutoReplicationEnabled,
  getGeneralWebhookUrl,
  getNetworkAuthUrl,
  getSuggestedHandle,
} from "../linked-accounts.js";

function renderConnectedCardBody(net, linkedData) {
  const handle = linkedData?.handle || "";
  const enabled = linkedData?.enabled ?? true;
  const webhook = linkedData?.webhook || "";
  const hasAppPwd = Boolean(linkedData?.appPassword);

  return `
    <div class="linked-connected-info" style="font-size:0.82rem; margin-bottom:0.6rem;">
      <p style="margin:0 0 4px;">Handle: <strong>@${escapeHtml(handle)}</strong></p>
      ${hasAppPwd ? `<p class="meta" style="margin:0 0 4px; font-size:0.75rem; color:var(--success);">🦋 AT Protocol direto configurado</p>` : ""}
      ${webhook ? `<p class="meta" style="margin:0 0 4px; font-size:0.75rem;">Webhook ativo: <code>${escapeHtml(webhook.slice(0, 32))}…</code></p>` : ""}
      <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; cursor:pointer; margin-top:4px;">
        <input type="checkbox" class="chk-network-replicate" data-net-id="${escapeHtml(net.id)}" ${enabled ? "checked" : ""} />
        Replicar posts nesta rede
      </label>
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      <button type="button" class="btn btn-sm btn-primary btn-test-network" data-net-id="${escapeHtml(net.id)}">🧪 Testar se conectou</button>
      <button type="button" class="btn btn-sm btn-outline btn-unlink-network" data-net-id="${escapeHtml(net.id)}">Desvincular @${escapeHtml(handle)}</button>
    </div>
    <div class="linked-test-feedback" id="test-feedback-${escapeHtml(net.id)}" style="display:none; font-size:0.78rem; padding:6px 8px; border-radius:var(--radius-sm); margin-top:6px;"></div>`;
}

function renderLinkNetworkForm(net) {
  const suggested = getSuggestedHandle(net.id);
  const authUrl = getNetworkAuthUrl(net.id, suggested);

  return `
    <div class="network-connect-box" data-net-id="${escapeHtml(net.id)}" style="margin-top:0.4rem;">
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-primary btn-one-click-connect" data-net-id="${escapeHtml(net.id)}" data-auth-url="${escapeHtml(authUrl)}" style="background:${escapeHtml(net.color || "#1e293b")}; border-color:${escapeHtml(net.color || "#1e293b")}; color:#fff; font-weight:600; padding:7px 16px; border-radius:var(--radius-sm); display:inline-flex; align-items:center; gap:6px;">
            <span>${net.icon}</span>
            <span>Conectar ${escapeHtml(net.name)} (1 Clique)</span>
          </button>
          <span class="meta" style="font-size:0.75rem; color:var(--muted); line-height:1.2;">
            Abre a rede no navegador, loga sozinho e volta ao Vox
          </span>
        </div>

        <div style="display:flex; align-items:center; gap:6px;">
          <span class="meta" style="font-size:0.82rem; font-weight:600; color:var(--muted);">@</span>
          <input type="text" class="input-net-handle form-control" placeholder="seu_usuario" value="${escapeHtml(suggested)}" style="font-size:0.8rem; padding:4px 8px; max-width:220px;" aria-label="Usuário nesta rede" />
          <button type="button" class="btn btn-xs btn-outline btn-save-handle-quick" data-net-id="${escapeHtml(net.id)}" title="Vincular com este @handle">Vincular @</button>
        </div>

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
        </details>
      </div>
    </div>`;
}

function renderNetworkCard(net, linkedData) {
  const isLinked = Boolean(linkedData?.handle);
  const statusBadge = isLinked
    ? `<span class="badge badge-success" style="font-size:0.7rem; background:rgba(22,163,74,0.15); color:#16a34a; border:1px solid #16a34a; padding:2px 6px; border-radius:999px;">🟢 Vinculado</span>`
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
      <div style="padding:0.75rem; background:var(--surface-soft); border-radius:var(--radius-sm); margin-bottom:1rem; border:1px solid var(--outline);">
        <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:0.9rem; cursor:pointer;">
          <input type="checkbox" id="chk-auto-replicate-master" ${autoRep ? "checked" : ""} />
          <span>⚡ Ativar Auto-Replicação ao Publicar</span>
        </label>
        <p class="meta" style="margin:4px 0 0 24px; font-size:0.78rem;">
          Quando ativado, novos posts no Vox disparam automaticamente para as redes vinculadas habilitadas.
        </p>
      </div>
      <div style="margin-bottom:0.25rem;">
        <label for="input-general-webhook" style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">
          Webhook Unificado de Automação (n8n / Make / Zapier):
        </label>
        <div style="display:flex; gap:8px;">
          <input type="url" id="input-general-webhook" class="form-control" placeholder="https://seu-n8n.com/webhook/vox-replicate" value="${escapeHtml(generalWebhook)}" style="font-size:0.8rem; flex:1;" />
          <button type="button" id="btn-save-general-webhook" class="btn btn-sm btn-primary">Salvar</button>
        </div>
      </div>
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
