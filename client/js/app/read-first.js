/**
 * PM-54 — "ler antes de entrar".
 * Quem chega por um link direto (post, comunidade, perfil, tag, proposta) lê o conteúdo na hora.
 * O portão de boas-vindas e o pacto só aparecem na primeira ação que ESCREVE
 * (curtir, responder, postar, votar, entrar na comunidade) ou num botão "Entrar no Vox".
 */
import { escapeHtml } from "../render/util.js";

/** Rotas de leitura que um link compartilhado costuma abrir. */
export const READ_FIRST_ROUTES = new Set([
  "home",
  "people",
  "connect",
  "sync",
  "topic",
  "community",
  "communities",
  "profile",
  "handle-lookup",
  "tag-feed",
  "proposal",
  "voxpedia",
  "download",
  "revolucao",
]);

/** Cliques que escrevem algo em nome da pessoa. */
export const WRITE_CLICK_SELECTOR = [
  ".btn-like",
  ".btn-star",
  ".btn-repost",
  ".repost-btn",
  "#btn-join-comm",
  ".vote-btn",
  ".agora-vote-btn",
  ".btn-mod-action",
  ".btn-mod-hide",
  "[data-requires-entry]",
].join(", ");

/** Formulários que só leem (busca) ou ficam no aparelho (denúncia, apontamento) não pedem entrada. */
const SUBMIT_ALLOWED = new Set(["agora-search-form", "form-people-search", "form-report", "form-feedback"]);

/** Os formulários do próprio fluxo de entrada (onboarding e pacto) ficam no #modal-container. */
const ENTRY_FLOW_CONTAINER = "#modal-container";

export const READ_FIRST_BANNER_ID = "read-first-banner";

export function isReadFirstRoute(routeName) {
  return READ_FIRST_ROUTES.has(routeName);
}

export function submitNeedsEntry(form) {
  if (form?.closest?.(ENTRY_FLOW_CONTAINER)) return false;
  return !SUBMIT_ALLOWED.has(form?.id || "");
}

export function renderReadFirstBannerHtml() {
  return `
    <div class="read-first-banner" id="${READ_FIRST_BANNER_ID}" role="region" aria-label="Você está lendo o Vox">
      <span>${escapeHtml("Para curtir ou responder, entre: não pede CPF nem e-mail.")}</span>
      <button type="button" class="btn btn-primary btn-sm" id="btn-read-first-enter">Entrar no Vox</button>
    </div>`;
}

export function mountReadFirstBanner(doc, onEnter) {
  if (!doc?.body || doc.getElementById(READ_FIRST_BANNER_ID)) return;
  const holder = doc.createElement("div");
  holder.innerHTML = renderReadFirstBannerHtml();
  const banner = holder.firstElementChild;
  doc.body.appendChild(banner);
  doc.getElementById("btn-read-first-enter")?.addEventListener("click", onEnter);
}

export function removeReadFirstBanner(doc = globalThis.document) {
  doc?.getElementById?.(READ_FIRST_BANNER_ID)?.remove();
}

let guardsInstalled = false;

/**
 * Intercepta, em fase de captura, cliques e envios que escrevem enquanto a pessoa não entrou.
 * @param {{ doc?: Document, hasEntered: () => boolean, openEntry: () => void }} opts
 */
export function installReadFirstGuards({ doc = globalThis.document, hasEntered, openEntry }) {
  if (guardsInstalled || !doc?.addEventListener) return;
  guardsInstalled = true;
  const block = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    openEntry();
  };
  doc.addEventListener(
    "click",
    (e) => {
      if (!hasEntered() && e.target?.closest?.(WRITE_CLICK_SELECTOR)) block(e);
    },
    true
  );
  doc.addEventListener(
    "submit",
    (e) => {
      if (!hasEntered() && submitNeedsEntry(e.target)) block(e);
    },
    true
  );
}

export function __resetReadFirstGuardsForTests() {
  guardsInstalled = false;
}
