/** @file Página #/status — telemetria honesta local. */
import { escapeHtml } from "./util.js";
import {
  DEFAULT_WINDOWS_HOURS,
  formatAvailabilityNum,
  formatAvailabilityPct,
} from "../availability-metrics.js";

/**
 * Linhas da tabela de gateways com estado e latência.
 *
 * @param {object|undefined} gatewayHealth
 * @returns {string}
 */
function renderGatewayTableRowsHtml(gatewayHealth) {
  const gwMap = gatewayHealth?.gateways && typeof gatewayHealth.gateways === "object" ? gatewayHealth.gateways : {};
  const entries = Object.entries(gwMap);
  if (!entries.length) return `<tr><td colspan="3" class="meta">Sem histórico local ainda.</td></tr>`;
  return entries
    .map(([label, g]) => `<tr><td>${escapeHtml(label)}</td><td>${g?.ok ?? 0}</td><td>${g?.fail ?? 0}</td></tr>`)
    .join("");
}

/**
 * Linha do último espelhamento ou do erro dele.
 *
 * @param {object|undefined} mirrorExport
 * @returns {string}
 */
function renderMirrorExportLineHtml(mirrorExport) {
  if (mirrorExport?.mirror_last_error) {
    return `<p><strong>Cópia no servidor comunitário (última falha):</strong> <code>${escapeHtml(mirrorExport.mirror_last_error)}</code> · ${escapeHtml(mirrorExport.mirror_last_error_community || "—")} · ${escapeHtml(mirrorExport.mirror_last_error_at || "")}</p>`;
  }
  return `<p class="meta"><strong>Cópia no servidor comunitário:</strong> sem falha registrada neste aparelho.</p>`;
}

/** Estado da leitura do Arweave em palavras de gente (a tela não mostra o código interno). */
const READ_STATE_LABELS = { all_ok: "Normal", degraded: "Instável", critical: "Leitura reserva" };

/**
 * Rótulo do estado de leitura; Desconhecido se não mapeado.
 *
 * @param {string} state
 * @returns {string}
 */
function readStateLabel(state) {
  return READ_STATE_LABELS[state] || "Desconhecido";
}

/**
 * Nota de leitura de reserva quando o estado não é normal.
 *
 * @param {string} state
 * @returns {string}
 */
function renderLeituraReservaNoteHtml(state) {
  if (state !== "all_ok") {
    return `<p class="desc status-leigo-note">Quando aparece <strong>leitura reserva</strong>, os pontos de leitura falharam ou demoraram aqui — o app usa o que já está guardado ou um servidor comunitário. É plano B, não significa que você quebrou a rede.</p>`;
  }
  return `<p class="desc status-leigo-note">Pontos de leitura respondendo neste aparelho. Se um dia aparecer <strong>leitura reserva</strong>, é backup (o que já está guardado ou vizinhos), não falha sua.</p>`;
}

/**
 * Cartões de estado de leitura, relay e pares.
 *
 * @param {string} state
 * @param {object} relayStatus
 * @param {object} rtcStatus
 * @returns {string}
 */
function renderStatusTilesHtml(state, relayStatus, rtcStatus) {
  const peers = Number(rtcStatus?.remotePeersConnected || 0);
  const readOk = state === "all_ok";
  return `
    <div class="agora-tiles">
      <div class="agora-tile${readOk ? "" : " agora-tile--bronze"}">
        <span class="agora-tile-label">Leitura pública</span>
        <span class="agora-tile-value">${escapeHtml(readStateLabel(state))}</span>
        <span class="agora-tile-hint">${readOk ? "Pontos de leitura ok" : "Leitura reserva ativa"}</span>
      </div>
      <div class="agora-tile${relayStatus?.online ? "" : " agora-tile--bronze"}">
        <span class="agora-tile-label">Servidor comunitário</span>
        <span class="agora-tile-value">${relayStatus?.online ? "Online" : "Offline"}</span>
        <span class="agora-tile-hint">${relayStatus?.online ? "Alcançável daqui" : "Sem servidor por perto — app segue do que está guardado"}</span>
      </div>
      <div class="agora-tile agora-tile--teal">
        <span class="agora-tile-label">Aparelhos conectados</span>
        <span class="agora-tile-value">${peers} ${peers === 1 ? "aparelho" : "aparelhos"}</span>
        <span class="agora-tile-hint">Ligação direta entre aparelhos</span>
      </div>
      <div class="agora-tile agora-tile--bronze">
        <span class="agora-tile-label">Assinatura da conta</span>
        <span class="agora-tile-value">P-256 (ECDSA)</span>
        <span class="agora-tile-hint">Cada ação é assinada neste aparelho</span>
      </div>
    </div>`;
}

/**
 * Página #/status: telemetria local (gateways, relay, WebRTC, IndexedDB).
 * @param {HTMLElement} main Contêiner substituído por `innerHTML`.
 * @param {object} [options={}]
 * @param {object} [options.gatewayHealth={}]
 * @param {object} [options.relayStatus={}]
 * @param {string} [options.relayHttpUrl=""]
 * @param {object|null} [options.mirrorExport=null]
 * @param {object} [options.rtcStatus={}]
 * @param {object|null} [options.signalingStats=null]
 * @param {object|null} [options.availabilityReport=null]
 * @returns {void}
 */
export function renderStatusPage(
  main,
  {
    gatewayHealth = {},
    relayStatus = {},
    relayHttpUrl = "",
    mirrorExport = null,
    rtcStatus = {},
    signalingStats = null,
    availabilityReport = null,
  } = {},
) {
  const state = gatewayHealth.state || "all_ok";
  const relayLabel = relayStatus?.online ? "Online" : "Offline";
  const relayHost = relayHttpUrl ? escapeHtml(relayHttpUrl) : "—";

  main.innerHTML = `
    <div class="agora-wide agora-node-health">
      ${renderNodeHealthHeadHtml()}
      ${renderStatusTilesHtml(state, relayStatus, rtcStatus)}
      ${renderStorageTabletHtml()}
      ${renderSignalingTelemetryTabletHtml(signalingStats)}
      ${renderAvailabilityTabletHtml(availabilityReport)}
      ${renderMeshTabletHtml({ state, relayStatus, relayLabel, relayHost, mirrorExport, gatewayHealth })}
    </div>`;
}

/**
 * Cabeçalho da página de saúde do nó.
 *
 * @returns {string}
 */
function renderNodeHealthHeadHtml() {
  return `
      <header class="agora-page-head agora-page-head--wide">
        <div class="agora-page-head-text">
          <h1 class="agora-page-title">Como está este aparelho na rede</h1>
          <p class="agora-page-sub">Sem telemetria para fora — contadores locais, malha e <strong>leitura</strong> via gateways. <strong>Gravação no Arweave</strong> desligada por padrão (<code>arweaveUpload: false</code>).</p>
        </div>
        <div class="agora-page-actions">
          <a class="agora-btn agora-btn--secondary" href="#/settings/network">Preferências de rede</a>
          <a class="agora-btn agora-btn--bronze" href="#/ajuda/teste">Roteiro de teste</a>
        </div>
      </header>`;
}

/**
 * Quadro de armazenamento local.
 *
 * @returns {string}
 */
function renderStorageTabletHtml() {
  return `
      <section class="agora-tablet">
        <div class="agora-tablet-head">
          <h2 class="agora-section-title">Espaço neste navegador</h2>
          <span class="agora-section-label" id="status-storage-label">Calculando…</span>
        </div>
        <div class="agora-bar" aria-hidden="true"><span class="is-teal" id="status-storage-bar" style="width:0%"></span></div>
        <p class="desc status-storage-note">Publicações, chaves e mídia ficam só no navegador deste aparelho. Ative a persistência em Preferências de rede para evitar despejo automático.</p>
      </section>`;
}

/**
 * Quadro da malha, do relay e dos gateways.
 *
 * @param {object} options
 * @returns {string}
 */
function renderMeshTabletHtml({ state, relayStatus, relayLabel, relayHost, mirrorExport, gatewayHealth }) {
  return `
      <section class="agora-tablet card">
        <div class="agora-tablet-head">
          <h2 class="agora-section-title">Malha — rede entre aparelhos (aqui)</h2>
        </div>
        ${renderLeituraReservaNoteHtml(state)}
        <dl class="agora-kv">
          <div class="agora-kv-row"><dt>Leitura pública</dt><dd>${escapeHtml(readStateLabel(state))}</dd></div>
          <div class="agora-kv-row"><dt>Servidor comunitário</dt><dd class="${relayStatus?.online ? "" : "is-bronze"}">${relayLabel} · ${relayHost}</dd></div>
          <div class="agora-kv-row"><dt>Versão salva do app</dt><dd class="is-hash"><code id="status-sw-cache">…</code></dd></div>
        </dl>
        <div class="status-mirror-line">${renderMirrorExportLineHtml(mirrorExport)}</div>
        <table class="status-gw-table agora-table">
          <thead><tr><th>Ponto de leitura</th><th>OK</th><th>Falhas</th></tr></thead>
          <tbody>${renderGatewayTableRowsHtml(gatewayHealth)}</tbody>
        </table>
      </section>`;
}

/**
 * Duração em ms para célula de tabela; traço se ausente.
 *
 * @param {number|null|undefined} ms
 * @returns {string}
 */
function formatDurationCell(ms) {
  return ms === null || ms === undefined ? "—" : `${Number(ms) || 0} ms`;
}

/**
 * Linha de telemetria de um canal de sinalização.
 *
 * @param {string} label
 * @param {object} bucket
 * @returns {string}
 */
function renderSignalingRowHtml(label, bucket) {
  const b = bucket && typeof bucket === "object" ? bucket : {};
  return `<tr><td>${escapeHtml(label)}</td><td>${Number(b.attempts) || 0}</td><td>${Number(b.ok) || 0}</td><td>${Number(b.fail) || 0}</td><td>${formatDurationCell(b.avgConnectMs)}</td></tr>`;
}

/**
 * Linha do tempo até o primeiro par conectado.
 *
 * @param {object|undefined} firstPeer
 * @returns {string}
 */
function renderFirstPeerLineHtml(firstPeer) {
  const fp = firstPeer && typeof firstPeer === "object" ? firstPeer : {};
  if (!Number(fp.count)) return "Sem pareamento medido neste aparelho ainda.";
  return `Último: <strong>${Number(fp.lastMs) || 0} ms</strong> · Média: <strong>${Number(fp.avgMs) || 0} ms</strong> · Mediana: <strong>${Number(fp.medianMs) || 0} ms</strong> (${Number(fp.count)} ${Number(fp.count) === 1 ? "sessão" : "sessões"})`;
}

/**
 * Quadro de telemetria de sinalização.
 *
 * @param {object|undefined} signalingStats
 * @returns {string}
 */
function renderSignalingTelemetryTabletHtml(signalingStats) {
  const ch = signalingStats?.channels || {};
  const peers = signalingStats?.peers || {};
  return `
      <section class="agora-tablet card" id="status-signaling-card">
        <div class="agora-tablet-head">
          <h2 class="agora-section-title">Como o app achou outros aparelhos</h2>
          <div class="agora-page-actions">
            <button type="button" class="agora-btn agora-btn--secondary" id="status-copy-signaling-btn">Copiar relatório</button>
            <button type="button" class="agora-btn agora-btn--secondary" id="status-reset-signaling-btn">Zerar</button>
          </div>
        </div>
        <p class="desc">Contadores só neste aparelho — nada disso é enviado para fora.</p>
        <p class="desc"><strong>Tempo até o 1º aparelho:</strong> ${renderFirstPeerLineHtml(signalingStats?.firstPeer)}</p>
        <table class="status-gw-table agora-table">
          <thead><tr><th>Caminho</th><th>Tentativas</th><th>Sucessos</th><th>Falhas</th><th>Tempo médio</th></tr></thead>
          <tbody>
            ${renderSignalingRowHtml("Canal WebSocket", ch.ws)}
            ${renderSignalingRowHtml("Canal Nostr", ch.nostr)}
            ${renderSignalingRowHtml("Aparelhos via WebSocket", peers.ws)}
            ${renderSignalingRowHtml("Aparelhos via Nostr", peers.nostr)}
          </tbody>
        </table>
        <p class="desc" id="status-signaling-feedback" aria-live="polite"></p>
      </section>`;
}

/**
 * Normaliza as janelas de disponibilidade para renderização segura.
 *
 * @param {object|null|undefined} report Relatório PM-75.
 * @returns {Array<{ windowHours: number, eligiblePosts: number, availablePosts: number, availabilityPct: number|null, avgReplicas: number|null }>}
 */
function normalizeAvailabilityWindows(report) {
  if (Array.isArray(report?.windows) && report.windows.length > 0) {
    return report.windows;
  }
  return DEFAULT_WINDOWS_HOURS.map((windowHours) => ({
    windowHours,
    eligiblePosts: 0,
    availablePosts: 0,
    availabilityPct: null,
    avgReplicas: null,
  }));
}

/**
 * Linha da tabela de disponibilidade offline por janela (1 h / 6 h / 24 h).
 *
 * @param {object} win Dados da janela.
 * @returns {string}
 */
function renderAvailabilityRowHtml(win) {
  const hours = escapeHtml(`${Number(win?.windowHours) || 0} h`);
  const eligible = escapeHtml(String(Number(win?.eligiblePosts) || 0));
  const available = escapeHtml(String(Number(win?.availablePosts) || 0));
  const pct = escapeHtml(formatAvailabilityPct(win?.availabilityPct));
  const replicas = escapeHtml(formatAvailabilityNum(win?.avgReplicas));
  return `<tr><td>${hours}</td><td>${eligible}</td><td>${available}</td><td>${pct}</td><td>${replicas}</td></tr>`;
}

/**
 * Linha de resumo geral da disponibilidade offline.
 *
 * @param {object|null|undefined} report Relatório PM-75.
 * @returns {string}
 */
function renderAvailabilitySummaryLineHtml(report) {
  const totalPosts = Number(report?.totalPosts) || 0;
  const eligible = Number(report?.summary?.totalEligibleEvaluations) || 0;
  if (!totalPosts || !eligible) {
    return "Sem posts elegíveis medidos neste aparelho ainda — as janelas 1 h, 6 h e 24 h aparecem conforme sondas locais são registradas.";
  }
  const pct = escapeHtml(formatAvailabilityPct(report?.summary?.overallAvailabilityPct));
  const postsLabel = escapeHtml(String(totalPosts));
  const probesLabel = escapeHtml(String(Number(report?.totalProbes) || 0));
  return `<strong>${pct}</strong> no agregado · ${postsLabel} ${totalPosts === 1 ? "post" : "posts"} analisados · ${probesLabel} sondas locais.`;
}

/**
 * Quadro local-only de disponibilidade offline de posts (PM-75: 1 h / 6 h / 24 h).
 *
 * @param {object|null|undefined} availabilityReport Relatório PM-75.
 * @returns {string}
 */
function renderAvailabilityTabletHtml(availabilityReport) {
  const windows = normalizeAvailabilityWindows(availabilityReport);
  const rows = windows.map(renderAvailabilityRowHtml).join("");
  return `
      <section class="agora-tablet card" id="status-availability-card">
        <div class="agora-tablet-head">
          <h2 class="agora-section-title">Disponibilidade offline dos posts (PM-75)</h2>
          <div class="agora-page-actions">
            <button type="button" class="agora-btn agora-btn--secondary" id="status-copy-availability-btn">Copiar métricas</button>
            <button type="button" class="agora-btn agora-btn--secondary" id="status-reset-availability-btn">Zerar</button>
          </div>
        </div>
        <p class="desc">Medição 100% local (zero telemetria central): % de posts acessíveis com o autor offline nas janelas <strong>1 h</strong>, <strong>6 h</strong> e <strong>24 h</strong>.</p>
        <p class="desc" id="status-availability-summary">${renderAvailabilitySummaryLineHtml(availabilityReport)}</p>
        <table class="status-gw-table agora-table" id="status-availability-table">
          <thead><tr><th>Janela</th><th>Elegíveis</th><th>Acessíveis</th><th>Disponibilidade</th><th>Média de réplicas</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="desc" id="status-availability-feedback" aria-live="polite"></p>
      </section>`;
}

/**
 * Atualiza barra e rótulo de uso do IndexedDB na página de status.
 * @param {object} [options={}]
 * @param {number} [options.usage=0] Bytes usados.
 * @param {number} [options.quota=0] Cota estimada.
 * @returns {void}
 */
export function hydrateStatusStorage({ usage = 0, quota = 0 } = {}) {
  const label = typeof document !== "undefined" ? document.getElementById("status-storage-label") : null;
  const bar = typeof document !== "undefined" ? document.getElementById("status-storage-bar") : null;
  if (!label || !bar) return;
  if (!quota) {
    label.textContent = "Estimativa indisponível";
    return;
  }
  /**
   * Formata bytes em MB, sem casas decimais acima de 100 MB.
   *
   * @param {number} n
   * @returns {string}
   */
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} MB`;
  const pct = Math.min(100, Math.max(0.5, (usage / quota) * 100));
  label.textContent = `${mb(usage)} / ${mb(quota)}`;
  bar.style.width = `${pct.toFixed(1)}%`;
}
