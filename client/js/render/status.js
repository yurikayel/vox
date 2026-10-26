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

  const leituraReservaNote =
    state !== "all_ok"
      ? `<p class="desc status-leigo-note">Quando aparece <strong>leitura reserva</strong>, os gateways Arweave falharam ou demoraram aqui — o app usa cache local ou relay comunitário. Isso é plano B de leitura, não significa que você quebrou a rede.</p>`
      : `<p class="desc status-leigo-note">Gateways respondendo neste aparelho. Se um dia aparecer <strong>leitura reserva</strong>, é leitura de backup (cache ou vizinhos), não falha sua.</p>`;

  main.innerHTML = `
    <a class="back-link" href="#/settings/network">← Preferências de rede</a>
    <p class="meta"><a href="#/ajuda/teste">Roteiro teste aberto (~15 min)</a></p>
    <div class="card">
      <h2>Status da malha (neste aparelho)</h2>
      <p class="desc">Sem envio externo — só cache local e tentativas de leitura Arweave registradas aqui.</p>
      ${leituraReservaNote}
      <p><strong>Leitura Arweave:</strong> ${escapeHtml(state)}</p>
      <p><strong>Relay HTTP:</strong> ${relayLabel} · ${relayHost}</p>
      <p class="desc"><strong>Versão do cache (Service Worker):</strong> <code id="status-sw-cache">…</code> — compare após <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>; detalhes em <a href="#/ajuda/teste">#/ajuda/teste</a>.</p>
      ${mirrorLine}
      <table class="status-gw-table" style="width:100%; margin-top:0.75rem; font-size:0.85rem;">
        <thead><tr><th>Gateway</th><th>OK</th><th>Falhas</th></tr></thead>
        <tbody>${gwRows}</tbody>
      </table>
    </div>`;
}
