/**
 * @file Cofre na malha (ADR-037) — o que roda com o app aberto: mandar o cofre a quem ainda não tem, olhar os pedidos
 * dos cofres guardados (ao abrir e a cada 10 minutos) e a faixa "Foi você?" quando alguém pede o cofre desta conta.
 * @module app/mesh-vault-ui
 */

import { decideMeshRequest, holderTick, pendingNotices, shareMyVault } from "./mesh-vault-flow.js";

/** Id da faixa de aviso, para não montar duas vezes. */
export const NOTICE_BANNER_ID = "meshVaultNoticeBanner";
/** Intervalo da volta de quem guarda com o app aberto. */
export const TICK_MS = 10 * 60 * 1000;

function formatWhen(ts) {
  try {
    return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

/**
 * HTML da faixa de aviso de um pedido.
 * @param {{ requestId: string, firstSeen: number }} notice
 * @returns {string}
 */
export function renderNoticeBannerHtml(notice) {
  const when = formatWhen(notice.firstSeen);
  return `<div class="account-exit-banner mesh-vault-notice" id="${NOTICE_BANNER_ID}" role="alertdialog" aria-label="Pedido para abrir sua conta" data-request="${notice.requestId}">
    <p class="banner-text"><strong>Alguém está abrindo sua conta em outro aparelho${when ? ` (pedido de ${when})` : ""}. Foi você?</strong> Se não foi, troque sua senha em Perfil → Soberania.</p>
    <div class="banner-actions">
      <button type="button" class="agora-btn agora-btn--primary" id="btnMeshVaultYes">Fui eu</button>
      <button type="button" class="agora-btn" id="btnMeshVaultNo">Não fui eu</button>
    </div>
  </div>`;
}

/**
 * Mostra a faixa do pedido mais antigo que espera decisão, ou a tira.
 * @param {{ doc?: Document, decide?: typeof decideMeshRequest, notices?: typeof pendingNotices }} [opts]
 * @returns {boolean} se a faixa ficou na tela
 */
export function refreshNoticeBanner({ doc = globalThis.document, decide = decideMeshRequest, notices = pendingNotices } = {}) {
  doc?.getElementById(NOTICE_BANNER_ID)?.remove();
  const next = notices().sort((a, b) => a.firstSeen - b.firstSeen)[0];
  if (!doc?.body || !next) return false;
  const holder = doc.createElement("div");
  holder.innerHTML = renderNoticeBannerHtml(next);
  doc.body.appendChild(holder.firstElementChild);
  const answer = (decision) => {
    doc.getElementById(NOTICE_BANNER_ID)?.remove();
    void Promise.resolve(decide(next.requestId, decision)).finally(() => refreshNoticeBanner({ doc, decide, notices }));
  };
  doc.getElementById("btnMeshVaultYes")?.addEventListener("click", () => answer("sim"));
  doc.getElementById("btnMeshVaultNo")?.addEventListener("click", () => answer("nao"));
  return true;
}

let started = false;

/**
 * Liga o cofre na malha neste aparelho: manda o cofre, roda a volta de quem guarda agora e a cada 10 minutos, e
 * mostra a faixa quando chega aviso. Só uma vez por página.
 * @param {{ win?: Window, hasAccount: () => boolean }} opts
 * @returns {boolean} se ligou agora
 */
export function startMeshVault({ win = globalThis.window, hasAccount }) {
  if (started || !win?.addEventListener) return false;
  started = true;
  const tick = () => {
    if (!hasAccount()) return;
    void shareMyVault().catch(() => {});
    void holderTick().catch(() => {});
  };
  win.addEventListener("vox-cofre-malha-mudou", () => void shareMyVault().catch(() => {}));
  win.addEventListener("vox-cofre-malha-aviso", () => refreshNoticeBanner());
  win.setInterval?.(tick, TICK_MS);
  tick();
  refreshNoticeBanner();
  return true;
}
