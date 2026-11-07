/** @file Página #/status — telemetria honesta local. */
import { escapeHtml } from "./util.js";

function renderGatewayTableRowsHtml(gatewayHealth) {
  const gwMap = gatewayHealth?.gateways && typeof gatewayHealth.gateways === "object" ? gatewayHealth.gateways : {};
  const entries = Object.entries(gwMap);
  if (!entries.length) return `<tr><td colspan="3" class="meta">Sem histórico local ainda.</td></tr>`;
  return entries
    .map(([label, g]) => `<tr><td>${escapeHtml(label)}</td><td>${g?.ok ?? 0}</td><td>${g?.fail ?? 0}</td></tr>`)
    .join("");
}

function renderMirrorExportLineHtml(mirrorExport) {
  if (mirrorExport?.mirror_last_error) {
    return `<p><strong>Espelho relay (última falha):</strong> <code>${escapeHtml(mirrorExport.mirror_last_error)}</code> · ${escapeHtml(mirrorExport.mirror_last_error_community || "—")} · ${escapeHtml(mirrorExport.mirror_last_error_at || "")}</p>`;
  }
  return `<p class="meta"><strong>Espelho relay:</strong> sem falha registrada neste aparelho.</p>`;
}

function renderLeituraReservaNoteHtml(state) {
  if (state !== "all_ok") {
    return `<p class="desc status-leigo-note">Quando aparece <strong>leitura reserva</strong>, os gateways Arweave falharam ou demoraram aqui — o app usa cache local ou relay comunitário. Isso é plano B de leitura, não significa que você quebrou a rede.</p>`;
  }
  return `<p class="desc status-leigo-note">Gateways respondendo neste aparelho. Se um dia aparecer <strong>leitura reserva</strong>, é leitura de backup (cache ou vizinhos), não falha sua.</p>`;
}

function renderStatusTilesHtml(state, relayStatus, rtcStatus) {
  const peers = Number(rtcStatus?.remotePeersConnected || 0);
  const readOk = state === "all_ok";
  return `
    <div class="agora-tiles">
      <div class="agora-tile${readOk ? "" : " agora-tile--bronze"}">
        <span class="agora-tile-label">Leitura Arweave</span>
        <span class="agora-tile-value">${escapeHtml(state)}</span>
        <span class="agora-tile-hint">${readOk ? "Gateways respondendo" : "Leitura reserva ativa"}</span>
      </div>
      <div class="agora-tile${relayStatus?.online ? "" : " agora-tile--bronze"}">
        <span class="agora-tile-label">Relay HTTP</span>
        <span class="agora-tile-value">${relayStatus?.online ? "Online" : "Offline"}</span>
        <span class="agora-tile-hint">${relayStatus?.online ? "Relay comunitário alcançável" : "Sem relay local — app segue no cache"}</span>
      </div>
      <div class="agora-tile agora-tile--teal">
        <span class="agora-tile-label">Pares conectados</span>
        <span class="agora-tile-value">${peers} ${peers === 1 ? "par" : "pares"}</span>
        <span class="agora-tile-hint">WebRTC direto entre aparelhos</span>
      </div>
      <div class="agora-tile agora-tile--bronze">
        <span class="agora-tile-label">Criptografia local</span>
        <span class="agora-tile-value">Ed25519</span>
        <span class="agora-tile-hint">Assinatura no próprio aparelho</span>
      </div>
    </div>`;
}

/** Saúde do nó (Stitch tela 11): ladrilhos de estado, armazenamento e gateways — só dados locais. */
export function renderStatusPage(
  main,
  { gatewayHealth = {}, relayStatus = {}, relayHttpUrl = "", mirrorExport = null, rtcStatus = {} } = {},
) {
  const state = gatewayHealth.state || "all_ok";
  const relayLabel = relayStatus?.online ? "Online" : "Offline";
  const relayHost = relayHttpUrl ? escapeHtml(relayHttpUrl) : "—";

  main.innerHTML = `
    <div class="agora-wide agora-node-health">
      ${renderNodeHealthHeadHtml()}
      ${renderStatusTilesHtml(state, relayStatus, rtcStatus)}
      ${renderStorageTabletHtml()}
      ${renderMeshTabletHtml({ state, relayStatus, relayLabel, relayHost, mirrorExport, gatewayHealth })}
    </div>`;
}

function renderNodeHealthHeadHtml() {
  return `
      <header class="agora-page-head agora-page-head--wide">
        <div class="agora-page-head-text">
          <p class="agora-kicker"><span class="agora-pylon" aria-hidden="true"></span>Nó local · telemetria honesta</p>
          <h1 class="agora-page-title">Saúde do nó</h1>
          <p class="agora-page-sub">Sem envio externo — só cache local e tentativas de leitura registradas neste aparelho.</p>
        </div>
        <div class="agora-page-actions">
          <a class="agora-btn agora-btn--secondary" href="#/settings/network">Preferências de rede</a>
          <a class="agora-btn agora-btn--bronze" href="#/ajuda/teste">Roteiro de teste</a>
        </div>
      </header>`;
}

function renderStorageTabletHtml() {
  return `
      <section class="agora-tablet">
        <div class="agora-tablet-head">
          <h2 class="agora-section-title">Armazenamento IndexedDB</h2>
          <span class="agora-section-label" id="status-storage-label">Calculando…</span>
        </div>
        <div class="agora-bar" aria-hidden="true"><span class="is-teal" id="status-storage-bar" style="width:0%"></span></div>
        <p class="desc status-storage-note">Publicações, chaves e mídia ficam só no navegador deste aparelho. Ative a persistência em Preferências de rede para evitar despejo automático.</p>
      </section>`;
}

function renderMeshTabletHtml({ state, relayStatus, relayLabel, relayHost, mirrorExport, gatewayHealth }) {
  return `
      <section class="agora-tablet card">
        <div class="agora-tablet-head">
          <h2 class="agora-section-title">Status da malha (neste aparelho)</h2>
        </div>
        ${renderLeituraReservaNoteHtml(state)}
        <dl class="agora-kv">
          <div class="agora-kv-row"><dt>Leitura Arweave</dt><dd>${escapeHtml(state)}</dd></div>
          <div class="agora-kv-row"><dt>Relay HTTP</dt><dd class="${relayStatus?.online ? "" : "is-bronze"}">${relayLabel} · ${relayHost}</dd></div>
          <div class="agora-kv-row"><dt>Versão do cache (Service Worker)</dt><dd class="is-hash"><code id="status-sw-cache">…</code></dd></div>
        </dl>
        <div class="status-mirror-line">${renderMirrorExportLineHtml(mirrorExport)}</div>
        <table class="status-gw-table agora-table">
          <thead><tr><th>Gateway</th><th>OK</th><th>Falhas</th></tr></thead>
          <tbody>${renderGatewayTableRowsHtml(gatewayHealth)}</tbody>
        </table>
      </section>`;
}

/** Preenche a barra de armazenamento com `navigator.storage.estimate()` (quando disponível). */
export function hydrateStatusStorage({ usage = 0, quota = 0 } = {}) {
  const label = typeof document !== "undefined" ? document.getElementById("status-storage-label") : null;
  const bar = typeof document !== "undefined" ? document.getElementById("status-storage-bar") : null;
  if (!label || !bar) return;
  if (!quota) {
    label.textContent = "Estimativa indisponível";
    return;
  }
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} MB`;
  const pct = Math.min(100, Math.max(0.5, (usage / quota) * 100));
  label.textContent = `${mb(usage)} / ${mb(quota)}`;
  bar.style.width = `${pct.toFixed(1)}%`;
}
