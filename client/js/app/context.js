/**
 * @file Helpers compartilhados do shell das telas: identidade ativa, props do layout e ações de post.
 */

import * as wallet from "../wallet.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";

/**
 * Identidade ativa no aparelho: carteira conectada ou rota da conta local.
 *
 * @returns {Promise<string>} Endereço ou rota; string vazia se indisponível.
 */
export async function getActiveUser() {
  try {
    const w = await wallet.getAddress();
    if (w) return w;
  } catch {}
  return await localAccount.getRouteId();
}

/**
 * Nome de exibição da conta local (vazio se não há), para telas que o anunciam a outros pares.
 *
 * @returns {string} Nome de exibição.
 */
export function getLocalDisplayName() {
  return localAccount.getDisplayName();
}

/**
 * Monta as props padrão passadas a {@link render.renderShell}.
 *
 * @param {string} user Identidade ativa.
 * @param {string} activeTab Id da aba destacada no shell.
 * @param {string} [title=""] Título da tela.
 * @param {string} [subtitle=""] Subtítulo.
 * @param {object|null} [breadcrumb=null] Trilha de navegação opcional.
 * @returns {object} Props do shell (métricas, RTC, configurações de peer).
 */
export function makeShellProps(user, activeTab, title = "", subtitle = "", breadcrumb = null) {
  const settings = peers.getPeerSettings();
  const metrics = peers.getPeerMetrics();
  const rtcStatus = peers.getRtcStatus();
  return {
    title,
    subtitle,
    breadcrumb,
    walletAddress: user,
    activeTab,
    metrics,
    rtcStatus,
    settings,
  };
}

/**
 * Abre o sheet de compartilhar externo quando o post não está em quarentena local.
 *
 * @param {object} [opts={}] Metadados do post (`topicId`, título, autor, corpo, comunidade).
 * @returns {boolean} `false` quando o post está em quarentena (toast já mostrado).
 */
export function shareTopicUnlessQuarantined(opts = {}) {
  if (!mod.canEchoPost(opts.topicId)) {
    share.showToast(mod.QUARANTINE_HINT);
    return false;
  }
  import("../explode-dispatch.js").then((m) => {
    m.openExplodeSheet({
      id: opts.topicId,
      title: opts.title || "Post no Vox",
      author: opts.author || "",
      body: opts.body || "",
      communityId: opts.communityId || "",
    });
  });
  return true;
}

/**
 * Rótulo do botão de quarentena conforme o estado.
 *
 * @param {boolean} on Quarentena ligada.
 * @returns {string}
 */
function quarantineButtonLabel(on) {
  return on ? "Tirar da quarentena local" : mod.QUARANTINE_ACTION_LABEL;
}

/**
 * Liga ou desliga os botões de compartilhar do post.
 *
 * @param {string} postId Post.
 * @param {boolean} on Desabilitar.
 */
function setShareDisabled(postId, on) {
  document.querySelectorAll(".btn-share-post").forEach((el) => {
    if (el.dataset.id !== postId) return;
    el.disabled = on;
    el.setAttribute("aria-disabled", on ? "true" : "false");
  });
}

/**
 * Sincroniza aparência e rótulo do botão de quarentena com o estado.
 *
 * @param {HTMLElement} btn Botão de quarentena.
 * @param {boolean} on Quarentena ligada.
 */
function syncQuarantineButton(btn, on) {
  const label = quarantineButtonLabel(on);
  btn.classList.toggle("is-quarantined", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", label);
  const span = btn.querySelector(".toolbar-overflow-label");
  if (span) span.textContent = label;
}

/**
 * Alterna quarentena local do post ao clicar no botão da barra de ferramentas.
 *
 * @param {HTMLElement} btn Botão `.btn-quarantine-post` com `data-id`.
 * @returns {void}
 */
export function onQuarantinePostClick(btn) {
  const id = btn?.dataset?.id;
  if (!id) return;
  const hiding = !mod.isPostQuarantined(id);
  if (hiding) mod.quarantinePost(id);
  else mod.unquarantinePost(id);
  share.showToast(hiding ? mod.QUARANTINE_HINT : "Post visível de novo neste aparelho.");
  if (hiding) btn.closest("article.post")?.remove();
  setShareDisabled(id, hiding);
  syncQuarantineButton(btn, hiding);
}

let quarantineWired = false;

/**
 * Liga delegação de clique para quarentena de posts (uma vez por sessão).
 *
 * @returns {void}
 */
export function attachQuarantineHandlers() {
  if (quarantineWired) return;
  quarantineWired = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-quarantine-post");
    if (!btn) return;
    e.preventDefault();
    onQuarantinePostClick(btn);
  });
}

/**
 * Liga botões `.btn-share-post` já presentes no DOM ao fluxo de compartilhar externo.
 *
 * @returns {void}
 */
export function attachPostShareHandlers() {
  document.querySelectorAll(".btn-share-post").forEach((btn) => {
    btn.addEventListener("click", () => {
      shareTopicUnlessQuarantined({
        title: btn.dataset.title || "Post no Vox",
        topicId: btn.dataset.id,
        author: btn.dataset.author || "",
        body: btn.dataset.body || "",
      });
    });
  });
}
