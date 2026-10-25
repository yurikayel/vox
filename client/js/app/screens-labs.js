/** @file Labs — Open Frames iframe demo. */
import * as render from "../render.js";
import * as openFramesHost from "../open-frames-host.js";
import { getActiveUser, makeShellProps } from "./context.js";

export async function showLabsFrames() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Open Frames"));
  main.innerHTML += `
    <a class="back-link" href="#/voxpedia">← Voxpedia</a>
    <div class="card">
      <h2>Open Frames (lab)</h2>
      <p class="desc">Iframe sandbox same-origin — postMessage whitelist (<code>of:ready</code>, <code>of:resize</code>, <code>of:action</code>).</p>
      <div id="labs-frame-host" style="margin-top:0.75rem;"></div>
    </div>`;
  const host = main.querySelector("#labs-frame-host");
  const iframe = document.createElement("iframe");
  iframe.title = "Open Frame demo";
  iframe.sandbox = "allow-scripts allow-forms";
  iframe.src = "./embed/frame-demo.html";
  iframe.style.width = "100%";
  iframe.style.border = "1px solid var(--border)";
  iframe.style.borderRadius = "8px";
  host.appendChild(iframe);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  openFramesHost.attachOpenFrameHost(host, iframe, {
    allowedOrigins: origin ? [origin] : [],
    onAction: (payload) => {
      console.info("[open-frame-action]", payload);
    },
  });
}
