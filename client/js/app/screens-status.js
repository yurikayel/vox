/** @file #/status dashboard. */
import * as render from "../render.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as communityMirror from "../community-mirror.js";
import { getActiveUser, makeShellProps } from "./context.js";

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
  });

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    navigator.storage.estimate().then((est) => render.hydrateStatusStorage(est)).catch(() => render.hydrateStatusStorage({}));
  } else {
    render.hydrateStatusStorage({});
  }

  const cacheEl = document.getElementById("status-sw-cache");
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
