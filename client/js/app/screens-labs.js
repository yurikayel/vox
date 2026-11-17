/** @file Labs — Open Frames iframe demo + T02 M-de-N. */
import * as render from "../render.js";
import * as mock from "../mock.js";
import { getFlags } from "../feature-flags.js";
import { root } from "../render/util.js";
import * as openFramesHost from "../open-frames-host.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { renderMofnLab, wireMofnLab } from "../labs/mofn-lab.js";
import { renderDungeonLab, wireDungeonLab } from "../labs/ai-social-dungeon-lab.js";

export async function showLabsFrames() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Open Frames"));
  main.innerHTML += `
    <a class="back-link" href="#/voxpedia">← Voxpedia</a>
    <div class="card">
      <h2>Open Frames (lab)</h2>
      <p class="desc">Iframe sandbox em origem opaca (sem <code>allow-same-origin</code>): o host só aceita mensagens da janela do próprio iframe, em lista fechada (<code>of:ready</code>, <code>of:resize</code>, <code>of:action</code>).</p>
      <div id="labs-frame-host" style="margin-top:0.75rem;"></div>
      <p class="meta" id="labs-frame-log" aria-live="polite">Nenhuma ação recebida ainda.</p>
    </div>`;
  const host = main.querySelector("#labs-frame-host");
  const iframe = document.createElement("iframe");
  iframe.title = "Open Frame demo";
  iframe.sandbox = "allow-scripts allow-forms";
  iframe.referrerPolicy = "no-referrer";
  iframe.src = "./embed/frame-demo.html";
  iframe.style.width = "100%";
  iframe.style.border = "1px solid var(--border)";
  iframe.style.borderRadius = "8px";
  host.appendChild(iframe);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  openFramesHost.attachOpenFrameHost(host, iframe, {
    allowedOrigins: origin ? [origin] : [],
    onAction: (payload) => {
      const log = main.querySelector("#labs-frame-log");
      if (log) log.textContent = `Ação recebida do frame: ${String(payload?.action || "?")} (${String(payload?.value ?? "")})`;
    },
  });
}

export async function showLabsMofn() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Lab M-de-N"));
  main.innerHTML += renderMofnLab();
  wireMofnLab(main);
}

/**
 * Monta e conecta a rota segregada AI Social Dungeon (`#/dungeon*`) fora do shell cívico.
 *
 * @param {object} [route={}] Parâmetros da sub-tela (`screen`, `tableId`, `charId`).
 * @returns {Promise<void>} Concluído após montar a tela segregada e conectar eventos.
 */
export async function showDungeonScreen(route = {}) {
  const appRoot = root();
  if (!appRoot) return;
  const notice = render.renderOpsNotice?.(getFlags().notice) || "";
  const demoBanner = mock.isDemoMode?.() ? render.renderDemoModeBanner?.() || "" : "";
  const opts = { screen: route.screen || "acampamento", tableId: route.tableId, charId: route.charId };
  appRoot.innerHTML = `${notice}${demoBanner}<div id="dungeon-host">${renderDungeonLab(opts)}</div>`;
  const host = appRoot.querySelector("#dungeon-host");
  wireDungeonLab(host, opts);
}

/**
 * Monta e conecta a rota experimental AI Social Dungeon (`#/labs/dungeon`).
 *
 * @returns {Promise<void>} Concluído após renderizar e conectar eventos do lab.
 */
export async function showLabsDungeon() {
  return showDungeonScreen({ screen: "acampamento" });
}
