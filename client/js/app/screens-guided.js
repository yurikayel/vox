/**
 * @file Fachada sob demanda (PM-01) para os assistentes guiados (`#/rede/guia`, `#/backup/guia`, `#/wallet/guia`).
 * Mantém a pilha rara dos assistentes (`screens-guided-view.js`, `render/guided-setup.js` e `mobile-test-guide.js`)
 * fora do grafo estático de boot e do precache (`SHELL_ASSETS`).
 */

import { lazyModule } from "./lazy-module.js";

/**
 * Carregador da implementação das telas dos assistentes guiados: lembra só o sucesso; na falha mostra "Tentar de novo".
 * Exportado para os testes trocarem o `import()` (`useLoaderForTests`).
 */
export const guidedView = lazyModule(() => import("./screens-guided-view.js"));

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
  return guidedView.open((view) => view.showNetworkWizard(applyNetworkWizardChoices));
}

/**
 * Monta assistente de backup sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showBackupWizard() {
  return guidedView.open((view) => view.showBackupWizard());
}

/**
 * Monta assistente de carteira sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showWalletWizard() {
  return guidedView.open((view) => view.showWalletWizard());
}

/**
 * Monta assistente de teste de campo no celular sob demanda (PM-73).
 *
 * @param {object} [nav] Fonte opcional de ambiente (`navigator`) para testes.
 * @returns {Promise<{ getReport: () => object }|void>} Sem o módulo da tela (falha de carga), mostra o aviso e devolve `undefined`.
 */
export async function showMobileTestGuide(nav = globalThis.navigator) {
  return guidedView.open((view) => view.showMobileTestGuide(nav));
}
