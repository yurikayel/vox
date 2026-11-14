/**
 * @file ADR-032 §3.5 — faixa "esta conta só existe neste navegador" para quem tem conta e ainda não tem
 * saída soberana. Não bloqueia nada. "Agora não" a esconde por 7 dias ou 10 posts; a cada troca de tela
 * ela confere de novo e some quando a saída existe. Quem só está lendo não vê: ainda não há chave.
 * @module app/account-exit-banner
 */
import * as accountExit from "../account-exit.js";
import * as localAccount from "../local-account.js";

/** Id da faixa, para não montar duas vezes. */
export const EXIT_BANNER_ID = "accountExitBanner";
/** Para onde "Criar minha saída" leva. */
export const EXIT_ROUTE = "#/frase";
/** Telas que já criam uma saída: nelas a faixa só repetiria a tela. */
const EXIT_SCREENS = [EXIT_ROUTE, "#/backup", "#/guardioes"];

/**
 * HTML da faixa.
 * @returns {string}
 */
export function renderAccountExitBannerHtml() {
  return `<div class="account-exit-banner" id="${EXIT_BANNER_ID}" role="region" aria-label="Sua conta ainda não tem saída">
    <p class="banner-text"><strong>Esta conta só existe neste navegador.</strong> Se você limpar os dados ou perder o aparelho, ela some — e entrar com Google não traz de volta.</p>
    <div class="banner-actions">
      <a class="agora-btn agora-btn--primary" id="btnAccountExitCreate" href="${EXIT_ROUTE}">Criar minha saída</a>
      <button type="button" class="banner-dismiss" id="btnAccountExitLater">Agora não</button>
    </div>
  </div>`;
}

async function currentState() {
  const routeId = await localAccount.getRouteId().catch(() => "");
  const [hasExit, ownPosts] = await Promise.all([accountExit.hasSovereignExit(routeId), accountExit.countOwnPosts(routeId)]);
  return { routeId, hasExit, ownPosts };
}

function mountBanner(doc, state) {
  const holder = doc.createElement("div");
  holder.innerHTML = renderAccountExitBannerHtml();
  const banner = holder.firstElementChild;
  doc.body.appendChild(banner);
  doc.getElementById("btnAccountExitLater")?.addEventListener("click", () => {
    accountExit.snoozeExitBanner(state.ownPosts, state.routeId);
    banner.remove();
  });
}

/**
 * Mostra ou tira a faixa conforme o estado agora.
 * @param {{ doc?: Document, hasAccount: () => boolean }} opts
 * @returns {Promise<boolean>} se a faixa ficou na tela
 */
export async function refreshAccountExitBanner({ doc = globalThis.document, hasAccount }) {
  const existing = doc?.getElementById(EXIT_BANNER_ID);
  const hash = String(globalThis.location?.hash || "");
  const onExitScreen = EXIT_SCREENS.some((route) => hash.startsWith(route));
  if (!doc?.body || !hasAccount() || onExitScreen) {
    existing?.remove();
    return false;
  }
  const state = await currentState();
  const show = accountExit.shouldShowExitBanner(state);
  if (!show) existing?.remove();
  else if (!doc.getElementById(EXIT_BANNER_ID)) mountBanner(doc, state);
  return show;
}

let listening = false;

/**
 * Liga a faixa: confere agora e a cada troca de tela.
 * @param {{ doc?: Document, win?: Window, hasAccount: () => boolean }} opts
 * @returns {Promise<boolean>}
 */
export function startAccountExitBanner({ doc = globalThis.document, win = globalThis.window, hasAccount }) {
  if (!listening && win?.addEventListener) {
    listening = true;
    win.addEventListener("hashchange", () => void refreshAccountExitBanner({ doc, hasAccount }).catch(() => {}));
  }
  return refreshAccountExitBanner({ doc, hasAccount });
}
