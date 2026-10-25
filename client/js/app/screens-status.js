/** @file #/status dashboard. */
import * as render from "../render.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import { getActiveUser, makeShellProps } from "./context.js";

export async function showStatus() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Status"));
  const relayStatus = await peers.checkDesktopRelay();
  render.renderStatusPage(main, {
    gatewayHealth: gatewayTelemetry.getGatewayHealthSummary(),
    relayStatus,
    relayHttpUrl: inbox.getRelayHttpUrl(),
  });
}
