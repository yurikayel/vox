/**
 * @file Fachada sob demanda (PM-01) para os assistentes guiados (`#/rede/guia`, `#/backup/guia`, `#/wallet/guia`).
 * Mantém a pilha rara dos assistentes (`screens-guided-view.js`, `render/guided-setup.js` e `mobile-test-guide.js`)
 * fora do grafo estático de boot e do precache (`SHELL_ASSETS`).
 */

/** @type {Promise<typeof import("./screens-guided-view.js")>|null} */
let viewModulePromise = null;

/**
 * Carrega sob demanda e memoiza a implementação das telas dos assistentes guiados.
 *
 * @returns {Promise<typeof import("./screens-guided-view.js")>}
 */
function loadGuidedView() {
  viewModulePromise ??= import("./screens-guided-view.js");
  return viewModulePromise;
}

/**
 * Pura: aplica as escolhas do assistente sobre as configurações atuais.
 *
 * @param {object} current Configurações de peer atuais.
 * @param {object} choices Valores do formulário (`enabled`, `cap`, `wifiOnly`, `backgroundRelay`).
 * @returns {object} Novas configurações mescladas.
 */
export function applyNetworkWizardChoices(current, { enabled, cap, wifiOnly, backgroundRelay }) {
  return {
    ...current,
    enabled: enabled === "sim",
    dailyCapMb: Number(cap) || current.dailyCapMb,
    wifiOnly: Boolean(wifiOnly),
    backgroundRelay: Boolean(backgroundRelay),
  };
}

/**
 * Monta assistente de configuração de rede sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showNetworkWizard() {
  const view = await loadGuidedView();
  return view.showNetworkWizard(applyNetworkWizardChoices);
}

/**
 * Monta assistente de backup sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showBackupWizard() {
  const view = await loadGuidedView();
  return view.showBackupWizard();
}

/**
 * Monta assistente de carteira sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showWalletWizard() {
  const view = await loadGuidedView();
  return view.showWalletWizard();
}

/**
 * Monta assistente de teste de campo no celular sob demanda (PM-73).
 *
 * @param {object} [nav] Fonte opcional de ambiente (`navigator`) para testes.
 * @returns {Promise<{ getReport: () => object }>}
 */
export async function showMobileTestGuide(nav = globalThis.navigator) {
  const view = await loadGuidedView();
  return view.showMobileTestGuide(nav);
}
