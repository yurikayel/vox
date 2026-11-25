/** @file Implementação sob demanda (PM-01) do painel `#/status`. */
import { renderShell, renderLoading } from "../render/shell.js";
import { renderStatusPage, hydrateStatusStorage } from "../render/status.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as communityMirror from "../community-mirror.js";
import * as signalingTelemetry from "../signaling-telemetry.js";
import * as availabilityMetrics from "../availability-metrics.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { buildStatusDiagnosticReport } from "./screens-status.js";

/**
 * Copia um texto para a área de transferência e escreve o retorno no elemento de feedback.
 *
 * @param {string} text Conteúdo a copiar.
 * @param {HTMLElement|null} feedback Elemento de status acessível.
 * @param {string} okMessage Mensagem de sucesso.
 * @returns {Promise<void>}
 */
async function copyTextWithFeedback(text, feedback, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    if (feedback) feedback.textContent = okMessage;
  } catch {
    if (feedback) feedback.textContent = "Não foi possível copiar automaticamente neste navegador.";
  }
}

/**
 * Liga os botões de copiar e zerar o relatório de sinalização.
 *
 * @param {Function} swVersionProvider Devolve a versão do Service Worker.
 */
function bindSignalingReportActions(swVersionProvider) {
  const copyBtn = document.getElementById("status-copy-signaling-btn");
  const resetBtn = document.getElementById("status-reset-signaling-btn");
  const feedback = document.getElementById("status-signaling-feedback");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const report = buildStatusDiagnosticReport({ swVersion: swVersionProvider() });
      await copyTextWithFeedback(report, feedback, "Relatório local copiado para a área de transferência.");
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      signalingTelemetry.resetSignalingTelemetry();
      void showStatus();
    };
  }
}

/**
 * Liga os botões de copiar e zerar as métricas locais de disponibilidade offline (PM-75).
 */
function bindAvailabilityReportActions() {
  const copyBtn = document.getElementById("status-copy-availability-btn");
  const resetBtn = document.getElementById("status-reset-availability-btn");
  const feedback = document.getElementById("status-availability-feedback");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const report = availabilityMetrics.formatAvailabilityReport(availabilityMetrics.getAvailabilityMetricsSummary());
      await copyTextWithFeedback(report, feedback, "Métricas locais de disponibilidade copiadas.");
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      availabilityMetrics.resetAvailabilityObservations();
      void showStatus();
    };
  }
}

/**
 * Preenche o elemento de cache do Service Worker com os caches `vox-pwa*`.
 *
 * @param {HTMLElement|null} cacheEl Elemento alvo.
 * @returns {Promise<void>}
 */
async function hydrateSwCacheLabel(cacheEl) {
  if (!cacheEl || typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    const voxCaches = keys.filter((k) => k.startsWith("vox-pwa"));
    cacheEl.textContent = voxCaches.length ? voxCaches.join(", ") : "(nenhum — tente Ctrl+Shift+R)";
  } catch {
    cacheEl.textContent = "(indisponível neste contexto)";
  }
}

/**
 * Monta o painel de status (peers, inbox, telemetria de signaling, disponibilidade offline PM-75).
 *
 * @returns {Promise<void>}
 */
export async function showStatus() {
  const user = await getActiveUser();
  const main = renderShell(makeShellProps(user, "network", "Status"));
  renderLoading(main, "Medindo como este aparelho está na rede…");
  const relayStatus = await peers.checkDesktopRelay();
  renderStatusPage(main, {
    gatewayHealth: gatewayTelemetry.getGatewayHealthSummary(),
    relayStatus,
    relayHttpUrl: inbox.getRelayHttpUrl(),
    mirrorExport: communityMirror.getMirrorLastErrorExport(),
    rtcStatus: peers.getRtcStatus(),
    signalingStats: signalingTelemetry.getSignalingTelemetrySummary(),
    availabilityReport: availabilityMetrics.getAvailabilityMetricsSummary(),
  });
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    navigator.storage.estimate().then((est) => hydrateStatusStorage(est)).catch(() => hydrateStatusStorage({}));
  } else {
    hydrateStatusStorage({});
  }
  const cacheEl = document.getElementById("status-sw-cache");
  bindSignalingReportActions(() => cacheEl?.textContent || "");
  bindAvailabilityReportActions();
  await hydrateSwCacheLabel(cacheEl);
}
