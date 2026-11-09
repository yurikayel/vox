/**
 * LAN-16 — comportamentos que antes eram atributos inline (onerror=, onclick=).
 * A CSP proíbe handlers inline; estes listeners delegados fazem o mesmo trabalho.
 *
 * - <img data-fallback-next>: se a imagem falhar, esconde-a e mostra o irmão seguinte (iniciais).
 * - [data-click-target="seletor"]: clica no primeiro elemento que casar com o seletor.
 * - [data-focus-target="seletor"][data-focus-fallback="#/rota"]: foca o alvo ou navega para a rota.
 * - [data-app-feedback]: abre "Algo errado aqui?", carregando o modal só no clique (fora do boot).
 */

import { showToast } from "./share.js";

export function handleImageFallback(img) {
  if (!img?.matches?.("img[data-fallback-next]")) return false;
  img.style.display = "none";
  if (img.nextElementSibling) img.nextElementSibling.style.display = "flex";
  return true;
}

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

/** "Algo errado aqui?": o modal só é importado no clique, para não pesar na abertura do app. */
export function openFeedbackOnClick(target, load = () => import("./app/feedback-flow.js")) {
  if (!target?.closest?.("[data-app-feedback]")) return false;
  load()
    .then((m) => m.openFeedbackFlow())
    .catch(() => showToast("Não foi possível abrir \"Algo errado aqui?\" agora. Tente de novo com internet.", "error"));
  return true;
}

let installed = false;

export function installDomDelegates(doc = globalThis.document) {
  if (installed || !doc?.addEventListener) return;
  installed = true;
  doc.addEventListener("error", (e) => handleImageFallback(e.target), true);
  doc.addEventListener("click", (e) => openFeedbackOnClick(e.target) || handleDelegatedClick(e.target, doc));
}
