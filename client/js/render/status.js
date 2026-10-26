/** @file Página #/status — telemetria honesta local. */
import { escapeHtml } from "./util.js";

export function renderStatusPage(
  main,
  { gatewayHealth = {}, relayStatus = {}, relayHttpUrl = "", mirrorExport = null } = {},
) {
  const state = gatewayHealth.state || "all_ok";
  const gwMap = gatewayHealth.gateways && typeof gatewayHealth.gateways === "object" ? gatewayHealth.gateways : {};
  const gwEntries = Object.entries(gwMap);
  const relayLabel = relayStatus?.online ? "Online" : "Offline";
  const relayHost = relayHttpUrl ? escapeHtml(relayHttpUrl) : "—";
  const mirrorLine = mirrorExport?.mirror_last_error
    ? `<p><strong>Espelho relay (última falha):</strong> <code>${escapeHtml(mirrorExport.mirror_last_error)}</code> · ${escapeHtml(mirrorExport.mirror_last_error_community || "—")} · ${escapeHtml(mirrorExport.mirror_last_error_at || "")}</p>`
    : `<p class="meta"><strong>Espelho relay:</strong> sem falha registrada neste aparelho.</p>`;

  const gwRows = gwEntries.length
    ? gwEntries
        .map(
          ([label, g]) =>
            `<tr><td>${escapeHtml(label)}</td><td>${g?.ok ?? 0}</td><td>${g?.fail ?? 0}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="meta">Sem histórico local ainda.</td></tr>`;

  main.innerHTML = `
    <a class="back-link" href="#/settings/network">← Preferências de rede</a>
    <div class="card">
      <h2>Status da malha (neste aparelho)</h2>
      <p class="desc">Sem envio externo — só cache local e tentativas de leitura Arweave registradas aqui.</p>
      <p><strong>Leitura Arweave:</strong> ${escapeHtml(state)}</p>
      <p><strong>Relay HTTP:</strong> ${relayLabel} · ${relayHost}</p>
      ${mirrorLine}
      <table class="status-gw-table" style="width:100%; margin-top:0.75rem; font-size:0.85rem;">
        <thead><tr><th>Gateway</th><th>OK</th><th>Falhas</th></tr></thead>
        <tbody>${gwRows}</tbody>
      </table>
    </div>`;
}
