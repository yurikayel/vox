/**
 * @file Fachada sob demanda (PM-01) para a tela `#/status`.
 * Mantém a implementação da tela (`screens-status-view.js`) fora do grafo estático de boot
 * e do precache (`SHELL_ASSETS`), preservando `buildStatusDiagnosticReport` síncrono.
 */
import * as signalingTelemetry from "../signaling-telemetry.js";
import * as availabilityMetrics from "../availability-metrics.js";

/** @type {Promise<typeof import("./screens-status-view.js")>|null} */
let viewModulePromise = null;

/**
 * Carrega sob demanda e memoiza a implementação da tela `#/status`.
 *
 * @returns {Promise<typeof import("./screens-status-view.js")>}
 */
function loadStatusView() {
  viewModulePromise ??= import("./screens-status-view.js");
  return viewModulePromise;
}

/**
 * Monta o relatório local de diagnóstico (sinalização PM-18 + disponibilidade offline PM-75).
 *
 * @param {object} [options={}]
 * @param {string} [options.swVersion=""] Versão do cache do Service Worker.
 * @param {object} [options.signalingStats] Resumo local de sinalização.
 * @param {object} [options.availabilityReport] Resumo local de disponibilidade offline.
 * @returns {string}
 */
export function buildStatusDiagnosticReport({
  swVersion = "",
  signalingStats = signalingTelemetry.getSignalingTelemetrySummary(),
  availabilityReport = availabilityMetrics.getAvailabilityMetricsSummary(),
} = {}) {
  const signalingPart = signalingTelemetry.formatSignalingReport(signalingStats, { swVersion });
  const availabilityPart = availabilityMetrics.formatAvailabilityReport(availabilityReport);
  return `${signalingPart}\n\n${availabilityPart}`;
}

/**
 * Abre o painel de status sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showStatus() {
  const view = await loadStatusView();
  return view.showStatus();
}
