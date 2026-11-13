/**
 * @file Armazenamento durável no aparelho (PM-72, parte do REV-14): a chave da conta mora no navegador,
 * e o navegador pode apagar os dados de um site sem avisar (pouco espaço; no Safari, 7 dias sem uso numa aba comum).
 *
 * Para quem já tem conta neste aparelho:
 * - pede ao navegador que não apague os dados do Vox (`navigator.storage.persist`);
 * - no Safari em aba comum, mostra uma vez a faixa que ensina a pôr o Vox na Tela de Início.
 *
 * Quem só está lendo não vê nada disso: ainda não há chave a proteger. Lógica de detecção em `storage-persistence.js`.
 *
 * @module app/storage-durability-flow
 */
import * as storagePersistence from "../storage-persistence.js";

/** @type {string} Id do elemento da faixa do Safari, para não montar duas vezes. */
export const SAFARI_BANNER_ID = "safariHomeBanner";

/**
 * Monta a faixa "Adicionar à Tela de Início" e liga o botão que a dispensa de vez.
 * @param {Document} doc Documento da página.
 * @param {object} [persistence] Módulo de persistência (trocável em teste).
 * @returns {boolean} Verdadeiro se a faixa foi montada agora.
 */
export function mountSafariHomeBanner(doc, persistence = storagePersistence) {
  if (!doc?.body || doc.getElementById(SAFARI_BANNER_ID)) return false;
  const holder = doc.createElement("div");
  holder.innerHTML = persistence.renderSafariHomeBannerHtml();
  const banner = holder.firstElementChild;
  doc.body.appendChild(banner);
  doc.getElementById("btnDismissSafariBanner")?.addEventListener("click", () => {
    persistence.dismissSafariHomePrompt();
    banner.remove();
  });
  return true;
}

/**
 * Protege os dados de quem tem conta neste aparelho. Não faz nada para quem só está lendo.
 * @param {object} opts Dependências.
 * @param {Document} [opts.doc] Documento da página.
 * @param {function(): boolean} opts.hasAccount Diz se a pessoa já entrou (tem chave a proteger).
 * @param {object} [opts.persistence] Módulo de persistência (trocável em teste).
 * @returns {Promise<{asked: boolean, persisted: boolean, banner: boolean}>} O que foi feito: se pediu, se o navegador concedeu e se a faixa apareceu.
 */
export async function startStorageDurability({ doc = globalThis.document, hasAccount, persistence = storagePersistence }) {
  if (!hasAccount()) return { asked: false, persisted: false, banner: false };
  const already = await persistence.checkPersistence();
  const persisted = already || (await persistence.requestPersistence()).persisted;
  const banner = Boolean(doc) && persistence.shouldShowSafariHomePrompt() && mountSafariHomeBanner(doc, persistence);
  return { asked: !already, persisted, banner: Boolean(banner) };
}
