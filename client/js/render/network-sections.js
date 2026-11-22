/** @file Status header, network statistics, telemetry link, POSSE and moderation sections. */
import { escapeHtml, shortId } from "./util.js";
import { honestMessage } from "../honest-errors.js";
import { renderNetworkChip, renderMeshStatusChip } from "./shell.js";
import { getMonthlyUsage, isDataSaverActive } from "../peers-settings.js";

function renderGatewayHealthBlock(gatewayHealth) {
  const state = gatewayHealth?.state || "all_ok";
  if (state === "all_ok") {
    return `<p class="desc" style="font-size:0.8rem; margin:0.85rem 0 0;">Leitura pública: normal neste aparelho (gateways). Publicar no Arweave exige flag e carteira — hoje desligado por padrão.</p>`;
  }
  const label =
    state === "critical"
      ? "Leitura reserva — gateways falharam recentemente; conteúdo vem do cache local ou relay."
      : "Leitura reserva ocasional — gateways falharam; a rede ou relay ajudam.";
  return `
    <div class="card" style="margin-top:0.85rem; padding:0.75rem 0.9rem; border-color:var(--warning-border, #fde68a); background:var(--warning-soft, #fef3c7);">
      <strong style="font-size:0.85rem;">📡 ${escapeHtml(label)}</strong>
      <p class="desc" style="font-size:0.78rem; margin:0.4rem 0 0;">Só histórico local. <a href="#/settings/network">Ajustar rede</a></p>
    </div>`;
}

/** LAN-21: em vez de "conectando…" para sempre, diz quando o servidor de conexão caiu. */
function renderPeerBadge(rtcStatus) {
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  if (rtcCount > 0) {
    return `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">${rtcCount} ${rtcCount === 1 ? "aparelho conectado" : "aparelhos conectados"}</span>`;
  }
  if (rtcStatus?.signalingDown) {
    return `<span class="badge-pill" style="background:var(--amber-soft, #fef3c7); color:var(--amber, #b45309);">Servidor de conexão fora do ar</span>`;
  }
  return `<span class="badge-pill">Conectando a aparelhos próximos…</span>`;
}

/**
 * Renderiza o cabeçalho de estado da rede e do nó.
 * @param {object} options Dados de estado da rede.
 * @param {object} options.settings Preferências salvas.
 * @param {object} options.metrics Métricas do nó.
 * @param {object} options.rtcStatus Estado WebRTC.
 * @param {object} options.gatewayHealth Saúde dos gateways.
 * @returns {string}
 */
export function renderNetworkHeader({ settings, metrics, rtcStatus, gatewayHealth }) {
  const isEnabled = Boolean(settings?.enabled);
  const meshChip = renderMeshStatusChip(renderNetworkChip(metrics, rtcStatus, settings));
  const statusBadge = isEnabled
    ? `<span class="pill" style="background:var(--success); color:#fff;">🟢 Ajudando a rede</span>`
    : `<span class="pill" style="background:var(--danger); color:#fff;">⏸️ Ajuda pausada</span>`;
  const peerBadge = renderPeerBadge(rtcStatus);
  const signalingNotice = rtcStatus?.signalingDown
    ? `<p class="desc network-signaling-down" role="status" style="margin-top:0.5rem;">${honestMessage("signalingDown")}</p>`
    : "";
  const reservePill =
    gatewayHealth?.state && gatewayHealth.state !== "all_ok"
      ? `<span class="badge-pill" style="background:var(--amber-soft, #fef3c7); color:var(--amber, #b45309);">Leitura reserva</span>`
      : "";

  return `
    <div class="card network-card">
      <h2>Sua rede</h2>
      <p class="desc">Seu aparelho ajuda a manter o Vox no ar.</p>
      <a class="agora-btn agora-btn--primary network-guided-btn" href="#/settings/network/guia">Configuração guiada</a>
      
      <div class="network-status" style="margin-top:1rem; display:flex; flex-wrap:wrap; gap:0.5rem;">
        ${meshChip}
        ${statusBadge}
        ${peerBadge}
        ${reservePill}
      </div>
      ${signalingNotice}
      ${renderGatewayHealthBlock(gatewayHealth)}
    </div>`;
}

function renderContributionAttestationCardHtml() {
  return `
    <div class="card network-attestation-card" style="margin-bottom:1.25rem; padding:1.05rem 1.15rem;">
      <p class="desc" style="font-size:0.84rem; margin:0 0 0.75rem; line-height:1.5;">
        Salva um comprovante local (<code>.json</code>) destas métricas — sem enviar para a rede.
      </p>
      <button type="button" id="btn-export-contribution-attestation" class="btn btn-outline btn-sm">
        Baixar Comprovante de Contribuição
      </button>
      <p class="meta" style="font-size:0.75rem; margin:0.7rem 0 0; line-height:1.45;">
        Uso individual (1 exportação/min). Métricas locais podem ser editadas antes de assinar.
      </p>
    </div>`;
}

function renderUsageStatsCard(dailyUsage, settings, monthlyUsage) {
  const capMb = settings?.dailyCapMb || 200;
  const servedTodayMb = ((dailyUsage?.bytesServedToday || 0) / (1024 * 1024)).toFixed(1);
  const cellularTodayMb = ((dailyUsage?.bytesCellularToday || 0) / (1024 * 1024)).toFixed(1);
  const pct = Math.min(100, Math.round((servedTodayMb / capMb) * 100));
  const servedMonthMb = ((monthlyUsage?.bytesServedMonth || 0) / (1024 * 1024)).toFixed(1);
  const cellularMonthMb = ((monthlyUsage?.bytesCellularMonth || 0) / (1024 * 1024)).toFixed(1);
  const saverNotice = isDataSaverActive()
    ? `<div class="meta" style="margin-top:0.25rem; font-size:0.75rem; color:var(--amber, #b45309);">Economia de dados / 4G ativa</div>`
    : "";

  return `
      <div class="card" style="text-align:center; padding:0.85rem 0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${servedTodayMb} / ${capMb} MB</div>
        <div class="usage-meter"><div class="usage-fill" style="width:${pct}%;"></div></div>
        <div class="meta" style="margin-top:0.3rem;">Uso hoje (${pct}%) · 4G: ${cellularTodayMb} MB</div>
        <div class="meta" style="margin-top:0.2rem; font-size:0.75rem;">No mês: ${servedMonthMb} MB · 4G: ${cellularMonthMb} MB</div>
        ${saverNotice}
      </div>`;
}

/**
 * Renderiza estatísticas de ajuda à rede e card de comprovante.
 * @param {object} metrics Métricas do nó.
 * @param {object} cacheStats Estatísticas do cache.
 * @param {object} dailyUsage Uso diário medido.
 * @param {object} settings Preferências com quotas.
 * @param {object} [monthlyUsage] Uso mensal acumulado medido.
 * @returns {string}
 */
export function renderNetworkStats(metrics, cacheStats, dailyUsage, settings, monthlyUsage = getMonthlyUsage()) {
  const blobs = metrics?.blobsServed || 0;
  const kb = ((metrics?.bytesServed || 0) / 1024).toFixed(1);
  const cCount = cacheStats?.count || 0;
  const cKb = cacheStats?.sizeKb || "0";

  return `
    <div class="actions-bar" style="margin:1.25rem 0 0.75rem;"><span class="section-title">Estatísticas de Ajuda</span></div>
    <div class="stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.75rem; margin-bottom:1.1rem;">
      <div class="card" style="text-align:center; padding:0.85rem 0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${blobs}</div>
        <div class="meta">Conteúdos entregues</div>
      </div>
      <div class="card" style="text-align:center; padding:0.85rem 0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${kb} KB</div>
        <div class="meta">Dados compartilhados</div>
      </div>
      ${renderUsageStatsCard(dailyUsage, settings, monthlyUsage)}
      <div class="card" style="text-align:center; padding:0.85rem 0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${cCount}</div>
        <div class="meta">Em cache (${cKb} KB)</div>
      </div>
    </div>
    ${renderContributionAttestationCardHtml()}`;
}

/**
 * Renderiza link para a tela de telemetria /status.
 * @returns {string}
 */
export function renderStatusLinkBlock() {
  return `
    <div class="card" style="margin-top:1.25rem;">
      <h3>Telemetria honesta</h3>
      <p class="desc" style="font-size:0.85rem;">Dados locais de conexão, sem envio externo. Veja também <a href="#/ajuda/teste">teste aberto</a>.</p>
      <a class="btn btn-sm btn-outline" href="#/status">Abrir #/status</a>
    </div>`;
}

/**
 * Renderiza seção de webhooks POSSE.
 * @param {string[]} [webhooks=[]] URLs de webhooks cadastradas.
 * @returns {string}
 */
export function renderPosseWebhooksSection(webhooks = []) {
  const lines = escapeHtml((webhooks || []).join("\n"));
  return `
    <div class="card" style="margin-top:1.25rem;">
      <h3>Ecoe POSSE — Webhooks</h3>
      <p class="desc" style="font-size:0.85rem;">Recebem JSON apenas ao tocar em <strong>Exportar JSON</strong> no Ecoe (máx. 8 URLs).</p>
      <div class="form-group">
        <label for="net-posse-webhooks">URLs de webhook (uma por linha)</label>
        <textarea id="net-posse-webhooks" class="form-control" rows="3" placeholder="https://discord.com/api/webhooks/…">${lines}</textarea>
      </div>
    </div>`;
}

function renderModerationUserRow(route, buttonClass, buttonLabel) {
  return `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;"><code>${escapeHtml(shortId(route))}</code><button type="button" class="btn btn-sm btn-outline ${buttonClass}" data-route="${escapeHtml(route)}">${buttonLabel}</button></div>`;
}

/**
 * Renderiza seção de moderação local e filtros soberanos.
 * @param {Array} [blockedUsers=[]] Usuários bloqueados.
 * @param {Array} [mutedUsers=[]] Usuários silenciados.
 * @returns {string}
 */
export function renderModerationSettingsSection(blockedUsers = [], mutedUsers = []) {
  const blockedList = blockedUsers.length
    ? blockedUsers.map((b) => b?.routeId ?? b).map((u) => renderModerationUserRow(u, "btn-unblock-item", "Desbloquear")).join("")
    : `<p class="meta" style="margin:0;">Nenhum autor bloqueado.</p>`;

  const mutedList = mutedUsers.length
    ? mutedUsers.map((m) => m?.routeId ?? m).map((u) => renderModerationUserRow(u, "btn-unmute-item", "Desilenciar")).join("")
    : `<p class="meta" style="margin:0;">Nenhum autor silenciado.</p>`;

  return `
    <div class="card" style="margin-top:1rem;">
      <h3>Moderação Local & Filtros</h3>
      <p class="desc" style="font-size:0.85rem; margin-bottom:0.6rem;">Filtros de conteúdo soberanos salvos apenas neste aparelho.</p>
      
      <div style="margin-bottom:0.75rem;">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Autores Bloqueados (${blockedUsers.length})</h4>
        <div class="card" style="background:var(--surface-soft); padding:8px 10px;">${blockedList}</div>
      </div>

      <div style="margin-bottom:0.75rem;">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Autores Silenciados (${mutedUsers.length})</h4>
        <div class="card" style="background:var(--surface-soft); padding:8px 10px;">${mutedList}</div>
      </div>

      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
        <button type="button" id="btn-export-moderation" class="btn btn-sm btn-outline">💾 Exportar Regras</button>
        <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
          📥 Importar Regras
          <input type="file" id="file-import-moderation" accept="application/json,.json" style="display:none;" />
        </label>
        <button type="button" id="btn-export-mod-log" class="btn btn-sm btn-outline">📋 Relatório de Transparência (.md)</button>
      </div>
    </div>`;
}
