/** @file Network settings form, server configuration inputs and linked accounts banner. */
import { escapeHtml } from "./util.js";
import { renderGeneralPreferencesHtml } from "./network-participation.js";

/**
 * Campos do servidor TURN personalizado.
 *
 * @param {object|undefined} customTurn
 * @returns {string}
 */
function renderTurnFields(customTurn) {
  return `
    <div style="border-top:1px solid var(--border); padding-top:0.75rem; margin-top:0.75rem;">
      <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.35rem;">Servidor auxiliar para conexões móveis (TURN)</label>
      <div class="form-group">
        <label for="net-turn-url">Endereço do servidor:</label>
        <input type="text" id="net-turn-url" class="form-control" placeholder="turn:turn.comunidade.org:3478" value="${escapeHtml(customTurn?.urls || "")}" />
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
        <div class="form-group">
          <label for="net-turn-user">Usuário:</label>
          <input type="text" id="net-turn-user" class="form-control" placeholder="vox" value="${escapeHtml(customTurn?.username || "")}" />
        </div>
        <div class="form-group">
          <label for="net-turn-pass">Credencial:</label>
          <input type="password" id="net-turn-pass" class="form-control" placeholder="••••••" value="${escapeHtml(customTurn?.credential || "")}" />
        </div>
      </div>
    </div>`;
}

/**
 * Texto do estado de saúde do relay, com o endereço quando houver.
 *
 * @param {object} relayStatus
 * @param {string} relayHttpUrl
 * @returns {string}
 */
function relayHealthLabel(relayStatus, relayHttpUrl) {
  const host = relayHttpUrl ? new URL(relayHttpUrl).host : "";
  if (relayStatus?.online) {
    return host ? `🔗🟢 (${escapeHtml(host)})` : "🔗🟢";
  }
  return host ? `🔗❌ (${escapeHtml(host)})` : "🔗❌";
}

/**
 * Faixa que leva às contas conectadas.
 *
 * @returns {string}
 */
function renderLinkedAccountsBannerHtml() {
  return `
    <div class="card" style="margin-bottom:1.25rem; padding:1rem 1.2rem; background:var(--surface-soft); border:1px solid var(--outline); border-radius:var(--radius-sm); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.85rem;">
      <div>
        <strong style="font-size:0.95rem; display:block; margin-bottom:0.2rem;">🔗 Redes vinculadas</strong>
        <span class="meta" style="font-size:0.82rem;">X, Bluesky, Threads, Instagram, Facebook e TikTok.</span>
      </div>
      <a href="#/settings/linked-accounts" class="btn btn-sm btn-primary">Gerenciar Redes</a>
    </div>`;
}

/**
 * Campos de endereço do relay.
 *
 * @param {object} opts
 * @returns {string}
 */
function renderRelayUrlInputsHtml(opts) {
  return `
    <div class="form-group">
      <label for="net-signaling-url">Servidor de conexão (opcional):</label>
      <input type="text" id="net-signaling-url" class="form-control" placeholder="wss://signal.comunidade.org" value="${escapeHtml(opts.customSignalingUrl || "")}" />
    </div>
    <div class="form-group">
      <label for="net-relay-http-url">Relay HTTP (cache e inbox, opcional):</label>
      <input type="text" id="net-relay-http-url" class="form-control" placeholder="https://relay.comunidade.org ou 192.168.0.10:3920" value="${escapeHtml(opts.customRelayHttpUrl || "")}" />
      <p class="desc" style="font-size:0.75rem; margin:0.35rem 0 0;">Usado para buscar posts e mensagens efêmeras. Vazio = derivado do servidor de conexão ou localhost.</p>
    </div>
    <div class="form-group">
      <label for="net-relay-buddy-http-url">Relay Buddy (reserva/espelho B, opcional):</label>
      <input type="text" id="net-relay-buddy-http-url" class="form-control" placeholder="https://buddy.comunidade.org ou https://usuario-space.hf.space" value="${escapeHtml(opts.customRelayBuddyHttpUrl || "")}" />
      <p class="desc" style="font-size:0.75rem; margin:0.35rem 0 0;">Segundo nó para failover automático se o relay principal cair durante o piloto.</p>
    </div>`;
}

/**
 * Estado do relay e conexões da malha.
 *
 * @param {object} opts
 * @returns {string}
 */
function renderRelayHealthAndTourHtml(opts) {
  const rtcCount = opts.rtcStatus?.remotePeersConnected || 0;
  return `
    <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
      <div class="meta" style="margin-bottom:0.4rem;">
        Conexões ativas: <strong>${rtcCount} aparelhos</strong> · Conteúdos via WebRTC: <strong>${opts.metrics?.blobsServedRtc || 0}</strong>
      </div>
      <button type="button" id="btn-check-relay" class="btn btn-outline btn-sm">Verificar Relay HTTP</button>
      <span class="meta" style="margin-left:0.5rem;">${relayHealthLabel(opts.relayStatus, opts.relayHttpUrl)}</span>
    </div>
    <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
      <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.25rem;">Modo demonstração</label>
      <p class="desc" style="font-size:0.8rem; margin:0 0 0.4rem;">${opts.demoMode
        ? "Ligado: perfis de exemplo (fictícios) aparecem com uma faixa no topo da tela."
        : "Desligado: só pessoas e posts reais na malha. Ligue para o tour com perfis fictícios (faixa no topo; sem Arweave por padrão)."}</p>
      <button type="button" id="btn-reset-demo" class="btn btn-outline btn-sm" data-demo-on="${opts.demoMode ? "1" : "0"}">${opts.demoMode ? "Desligar demonstração" : "Ligar demonstração"}</button>
    </div>`;
}

/**
 * Configurações avançadas dos servidores.
 *
 * @param {object} opts
 * @returns {string}
 */
function renderAdvancedServerSettingsHtml(opts) {
  const isBg = Boolean(opts.settings?.backgroundRelay);
  const notifNotice = opts.notifPermission === "granted"
    ? `<span style="font-size:0.8rem; color:var(--success);">✓ Notificações permitidas</span>`
    : `<button type="button" id="btn-request-notif" class="btn btn-outline btn-sm">Ativar Notificações</button>`;

  return `
    <details class="advanced-settings">
      <summary>Avançado (Conexões e Servidores)</summary>
      <div id="net-relay-steward" style="margin-top:0.75rem;">
        <p class="desc" style="font-size:0.8rem; margin-bottom:0.5rem;">Detalhes técnicos da malha WebRTC, relay e camada Steward.</p>
        <p style="margin-bottom:0.75rem;"><a href="#/settings/network/steward" class="btn btn-outline btn-sm">Assistente steward (5 passos)</a></p>
        ${renderRelayUrlInputsHtml(opts)}
        ${renderTurnFields(opts.customTurn)}
        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.75rem;">
          <input type="checkbox" id="net-bg-relay" ${isBg ? "checked" : ""} style="width:1rem; height:1rem;" />
          <div style="flex:1;">
            <label for="net-bg-relay" style="margin:0; font-weight:600;">Segundo plano via Service Worker (Wi-Fi)</label>
            <div style="margin-top:0.2rem;">${notifNotice}</div>
          </div>
        </div>
        ${renderRelayHealthAndTourHtml(opts)}
      </div>
    </details>`;
}

/**
 * Renderiza o formulário de preferências de ajuda e opções avançadas de conexão.
 * @param {object} opts Opções com configurações, status e permissões.
 * @returns {string}
 */
export function renderNetworkForm(opts) {
  return `
    ${renderLinkedAccountsBannerHtml()}
    <div class="card">
      <h3>Preferências de Ajuda</h3>
      <form id="form-network-settings">
        ${renderGeneralPreferencesHtml(opts.settings, opts.meshDiscoverable, opts.customSignalingUrl)}
        ${renderAdvancedServerSettingsHtml(opts)}
        <div class="actions-row" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary">Salvar Preferências</button>
          <button type="button" id="btn-clear-cache" class="btn btn-outline">Limpar Cache Local</button>
        </div>
      </form>
    </div>`;
}
