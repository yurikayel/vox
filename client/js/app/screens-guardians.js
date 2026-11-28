/**
 * @file Fachada sob demanda (PM-01) para a tela `#/guardioes` (ADR-032 §3.3).
 * Mantém a pilha rara de renderização dos guardiões (`screens-guardians-view.js` e
 * `render/guardians.js`) fora do grafo estático de boot e do precache (`SHELL_ASSETS`).
 */

import { lazyModule } from "./lazy-module.js";

/**
 * Carregador da implementação da tela `#/guardioes`: lembra só o sucesso; na falha mostra "Tentar de novo".
 * Exportado para os testes trocarem o `import()` (`useLoaderForTests`).
 */
export const guardiansView = lazyModule(() => import("./screens-guardians-view.js"));

/**
 * Abre a tela dos guardiões da conta ativa sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showGuardians() {
  return guardiansView.open((view) => view.showGuardians());
}
