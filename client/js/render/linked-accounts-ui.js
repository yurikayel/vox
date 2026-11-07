/**
 * @file Redes Vinculadas — tela de baixa carga cognitiva. Intenção: conectar rápido as contas
 * para replicar as postagens do Vox. Uma linha por rede, UM botão "Conectar" (login quando a
 * rede permite; senão o campo do @usuário abre ali mesmo). Webhooks e App Password ficam em
 * "Opções avançadas".
 */

import { escapeHtml } from "./util.js";
import {
  SUPPORTED_NETWORKS,
  loadLinkedAccounts,
  isAutoReplicationEnabled,
  getGeneralWebhookUrl,
  getSuggestedHandle,
} from "../linked-accounts.js";

const HANDLE_PLACEHOLDERS = { bsky: "voce.bsky.social", github: "seu-usuario" };
const LOGIN_NOTES = { instagram: "Login só para contas profissionais." };

function isConnected(acc) {
  return Boolean(acc?.handle || acc?.via === "oauth");
}

function whoLabel(acc) {
  return acc?.handle ? `@${escapeHtml(acc.handle)}` : escapeHtml(acc?.displayName || "conta conectada");
}

function renderConnectedRow(net, acc) {
  const id = escapeHtml(net.id);
  const status = acc.verified ? `<span class="link-ok">✓ verificado</span>` : `<span class="link-warn">não verificado</span>`;
  return `
      <div class="link-row-main">
        <span class="link-icon" aria-hidden="true">${net.icon}</span>
        <div class="link-text"><strong>${escapeHtml(net.name)}</strong><span class="link-sub">${whoLabel(acc)} · ${status}</span></div>
        <label class="link-switch" title="Replicar nesta rede">
          <input type="checkbox" class="chk-network-replicate" data-net-id="${id}" ${acc.enabled ?? true ? "checked" : ""} aria-label="Replicar no ${escapeHtml(net.name)}" />
          <span aria-hidden="true"></span>
        </label>
        <details class="link-menu">
          <summary aria-label="Mais opções">⋯</summary>
          <div class="link-menu-pop">
            <button type="button" class="btn-test-network" data-net-id="${id}">Testar conexão</button>
            ${acc.verified ? "" : `<button type="button" class="btn-confirm-network" data-net-id="${id}">É minha conta</button>`}
            <button type="button" class="btn-unlink-network" data-net-id="${id}">Desconectar</button>
          </div>
        </details>
      </div>
      <div class="linked-test-feedback link-feedback" id="test-feedback-${id}" style="display:none;"></div>`;
}

function renderDisconnectedRow(net) {
  const id = escapeHtml(net.id);
  const note = LOGIN_NOTES[net.id] ? `<p class="link-hint">${escapeHtml(LOGIN_NOTES[net.id])}</p>` : "";
  return `
      <div class="link-row-main">
        <span class="link-icon" aria-hidden="true">${net.icon}</span>
        <div class="link-text"><strong>${escapeHtml(net.name)}</strong><span class="link-sub">Não conectado</span></div>
        <button type="button" class="agora-btn agora-btn--solid btn-link-connect" data-net-id="${id}">Conectar</button>
      </div>
      <div class="network-connect-box link-manual" data-net-id="${id}" hidden>
        ${note}
        <div class="link-manual-row">
          <span aria-hidden="true">@</span>
          <input type="text" class="input-net-handle form-control" placeholder="${escapeHtml(HANDLE_PLACEHOLDERS[net.id] || "seu_usuario")}" value="${escapeHtml(getSuggestedHandle(net.id))}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Seu usuário no ${escapeHtml(net.name)}" />
          <button type="button" class="agora-btn agora-btn--primary btn-one-click-connect" data-net-id="${id}">Vincular</button>
        </div>
        <p class="link-hint">Digite o <strong>seu</strong> @usuário — abrimos o perfil para você conferir.</p>
      </div>
      <button type="button" class="link-alt btn-link-manual" data-net-id="${id}" hidden>ou digitar @usuário</button>`;
}

function renderNetworkRow(net, acc) {
  return `
    <li class="link-row linked-network-card" data-net-id="${escapeHtml(net.id)}">
      ${isConnected(acc) ? renderConnectedRow(net, acc) : renderDisconnectedRow(net)}
    </li>`;
}

function renderAdvancedCredentials(net, acc) {
  const id = escapeHtml(net.id);
  const pwd = net.supportsAtProto ? `<input type="password" class="input-net-app-password form-control" placeholder="App Password do Bluesky (opcional)" autocomplete="off" />` : "";
  const hook = net.canAutoWebhook ? `<input type="url" class="input-net-webhook form-control" placeholder="Webhook pessoal (n8n / Make / Zapier)" />` : "";
  if (!pwd && !hook) return "";
  return `
        <form class="form-link-network link-adv-form" data-net-id="${id}">
          <span class="link-adv-name">${net.icon} ${escapeHtml(net.name)}</span>
          <input type="text" class="input-net-handle form-control" placeholder="@usuário" value="${escapeHtml(acc?.handle || "")}" aria-label="Usuário no ${escapeHtml(net.name)}" />
          ${pwd}${hook}
          <button type="submit" class="agora-btn agora-btn--secondary">Salvar</button>
        </form>`;
}

function renderAdvanced(accounts) {
  return `
    <details class="link-advanced">
      <summary>Opções avançadas</summary>
      <p class="link-hint">Para quem usa automação: um webhook recebe cada postagem do Vox; App Password posta direto no Bluesky sem login.</p>
      <label for="input-general-webhook" class="agora-field-label">Webhook geral</label>
      <div class="link-manual-row">
        <input type="url" id="input-general-webhook" class="form-control" placeholder="https://seu-n8n.com/webhook/vox" value="${escapeHtml(getGeneralWebhookUrl())}" />
        <button type="button" id="btn-save-general-webhook" class="agora-btn agora-btn--secondary">Salvar</button>
      </div>
      ${SUPPORTED_NETWORKS.map((n) => renderAdvancedCredentials(n, accounts[n.id])).join("")}
    </details>`;
}

export function renderLinkedAccountsHtml() {
  const accounts = loadLinkedAccounts();
  const rows = SUPPORTED_NETWORKS.map((net) => renderNetworkRow(net, accounts[net.id])).join("");
  return `
    <div class="linked-accounts-screen">
      <a class="back-link" href="#/settings/network">← Voltar</a>
      <header class="link-head">
        <h1 class="agora-page-title">Redes Vinculadas</h1>
        <p class="agora-page-sub">Conecte suas contas e o que você publicar no Vox vai junto para elas.</p>
        <label class="link-master">
          <input type="checkbox" id="chk-auto-replicate-master" ${isAutoReplicationEnabled() ? "checked" : ""} />
          <span>Replicar automaticamente ao publicar</span>
        </label>
      </header>
      <ul class="link-list">${rows}</ul>
      ${renderAdvanced(accounts)}
    </div>`;
}

export function renderLinkedAccountsPage(main) {
  if (!main) return;
  main.innerHTML = renderLinkedAccountsHtml();
}
