/**
 * @file LAN-16 — comportamentos que antes eram atributos inline (onerror=, onclick=).
 * A CSP proíbe handlers inline; estes listeners delegados fazem o mesmo trabalho.
 *
 * - <img data-fallback-next>: se a imagem falhar, esconde-a e mostra o irmão seguinte (iniciais).
 * - [data-click-target="seletor"]: clica no primeiro elemento que casar com o seletor.
 * - [data-focus-target="seletor"][data-focus-fallback="#/rota"]: foca o alvo ou navega para a rota.
 * - [data-app-feedback]: abre "Algo errado aqui?", carregando o modal só no clique (fora do boot).
 * - [data-action="reveal-blurred-post"]: remove borrão local persistido e revela o cartão no feed.
 */

import { showToast } from "../share.js";
import * as moderation from "../moderation.js";

/**
 * Fallback de avatar: esconde a imagem que falhou e mostra iniciais no irmão seguinte.
 *
 * @param {HTMLElement} img Elemento `img[data-fallback-next]`.
 * @returns {boolean} `true` quando tratou o erro.
 */
export function handleImageFallback(img) {
  if (!img?.matches?.("img[data-fallback-next]")) return false;
  img.style.display = "none";
  if (img.nextElementSibling) img.nextElementSibling.style.display = "flex";
  return true;
}

/**
 * Delega cliques `[data-click-target]` e foco `[data-focus-target]` sem handlers inline.
 *
 * @param {EventTarget} target Alvo do evento de clique.
 * @param {Document} [doc=globalThis.document] Documento para `querySelector`.
 * @param {Location} [loc=globalThis.location] Localização para fallback de hash.
 * @returns {boolean} `true` quando consumiu o clique.
 */
export function handleDelegatedClick(target, doc = globalThis.document, loc = globalThis.location) {
  const clicker = target?.closest?.("[data-click-target]");
  if (clicker) {
    doc.querySelector(clicker.dataset.clickTarget)?.click();
    return true;
  }
  const focuser = target?.closest?.("[data-focus-target]");
  if (!focuser) return false;
  const input = doc.querySelector(focuser.dataset.focusTarget);
  if (input) input.focus();
  else if (focuser.dataset.focusFallback?.startsWith("#/")) loc?.assign?.(focuser.dataset.focusFallback);
  return true;
}

/**
 * "Algo errado aqui?": o modal só é importado no clique, para não pesar na abertura do app.
 *
 * @param {EventTarget} target Alvo do clique.
 * @param {() => Promise<object>} [load] Import dinâmico do fluxo de feedback.
 * @returns {boolean} `true` quando abriu o fluxo.
 */
export function openFeedbackOnClick(target, load = () => import("./feedback-flow.js")) {
  if (!target?.closest?.("[data-app-feedback]")) return false;
  load()
    .then((m) => m.openFeedbackFlow())
    .catch(() => showToast("Não foi possível abrir \"Algo errado aqui?\" agora. Tente de novo com internet.", "error"));
  return true;
}

/**
 * Limpa estado visual e banner de borrão local do cartão do post.
 *
 * @param {HTMLElement|null} card Cartão `.post` mais próximo.
 * @param {HTMLElement} btn Botão acionado.
 * @returns {void}
 */
function clearCardLocalBlur(card, btn) {
  if (!card) {
    btn.closest("[data-local-blur-banner]")?.remove();
    return;
  }
  card.classList.remove("is-locally-blurred");
  card.removeAttribute("data-locally-blurred");
  card.querySelector("[data-local-blur-banner]")?.remove();
}

/**
 * Revela localmente um post borrado ao clicar em `[data-action="reveal-blurred-post"]`.
 * Remove o estado persistido neste aparelho, a classe/atributo de borrão e o banner do card `.post`.
 *
 * @param {EventTarget} target Alvo do evento de clique.
 * @returns {boolean} `true` quando tratou o clique de revelação.
 */
export function handleRevealBlurredPostClick(target) {
  const btn = target?.closest?.('[data-action="reveal-blurred-post"]');
  if (!btn) return false;
  const card = btn.closest(".post");
  const postId = btn.dataset?.postId || card?.dataset?.id || "";
  if (postId) moderation.unblurPostLocally(postId);
  clearCardLocalBlur(card, btn);
  return true;
}

let installed = false;

/**
 * Instala delegação global de imagem, clique e feedback (uma vez por sessão).
 *
 * @param {Document} [doc=globalThis.document] Documento que recebe os listeners.
 * @returns {void}
 */
export function installDomDelegates(doc = globalThis.document) {
  if (installed || !doc?.addEventListener) return;
  installed = true;
  doc.addEventListener("error", (e) => handleImageFallback(e.target), true);
  doc.addEventListener("click", (e) => (
    handleRevealBlurredPostClick(e.target)
    || openFeedbackOnClick(e.target)
    || handleDelegatedClick(e.target, doc)
  ));
}
