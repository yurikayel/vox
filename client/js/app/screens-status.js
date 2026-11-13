/** @file #/status dashboard. */
import * as render from "../render.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as communityMirror from "../community-mirror.js";
import * as signalingTelemetry from "../signaling-telemetry.js";
import { getActiveUser, makeShellProps } from "./context.js";

function bindSignalingReportActions(swVersionProvider) {
  const copyBtn = document.getElementById("status-copy-signaling-btn");
  const resetBtn = document.getElementById("status-reset-signaling-btn");
  const feedback = document.getElementById("status-signaling-feedback");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const report = signalingTelemetry.formatSignalingReport(
        signalingTelemetry.getSignalingTelemetrySummary(),
        { swVersion: swVersionProvider() },
      );
      try {
        await navigator.clipboard.writeText(report);
        if (feedback) feedback.textContent = "Relatório local copiado para a área de transferência.";
      } catch {
        if (feedback) feedback.textContent = "Não foi possível copiar automaticamente neste navegador.";
      }
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      signalingTelemetry.resetSignalingTelemetry();
      void showStatus();
    };
  }
}

export async function showStatus() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Status"));
  render.renderLoading(main, "Medindo a saúde do nó…");
  const relayStatus = await peers.checkDesktopRelay();
  render.renderStatusPage(main, {
    gatewayHealth: gatewayTelemetry.getGatewayHealthSummary(),
    relayStatus,
    relayHttpUrl: inbox.getRelayHttpUrl(),
    mirrorExport: communityMirror.getMirrorLastErrorExport(),
    rtcStatus: peers.getRtcStatus(),
    signalingStats: signalingTelemetry.getSignalingTelemetrySummary(),
  });

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    navigator.storage.estimate().then((est) => render.hydrateStatusStorage(est)).catch(() => render.hydrateStatusStorage({}));
  } else {
    render.hydrateStatusStorage({});
  }

  const cacheEl = document.getElementById("status-sw-cache");
  bindSignalingReportActions(() => cacheEl?.textContent || "");
  if (cacheEl && typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      const voxCaches = keys.filter((k) => k.startsWith("vox-pwa"));
      cacheEl.textContent = voxCaches.length ? voxCaches.join(", ") : "(nenhum — tente Ctrl+Shift+R)";
    } catch {
      cacheEl.textContent = "(indisponível neste contexto)";
    }
  }
}
