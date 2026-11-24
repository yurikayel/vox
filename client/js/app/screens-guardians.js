/**
 * @file Fachada sob demanda (PM-01) para a tela `#/guardioes` (ADR-032 §3.3).
 * Mantém a pilha rara de renderização dos guardiões (`screens-guardians-view.js` e
 * `render/guardians.js`) fora do grafo estático de boot e do precache (`SHELL_ASSETS`).
 */

/** @type {Promise<typeof import("./screens-guardians-view.js")>|null} */
let viewModulePromise = null;

/**
 * Carrega sob demanda e memoiza a implementação da tela `#/guardioes`.
 *
 * @returns {Promise<typeof import("./screens-guardians-view.js")>}
 */
function loadGuardiansView() {
  viewModulePromise ??= import("./screens-guardians-view.js");
  return viewModulePromise;
}

/**
 * Abre a tela dos guardiões da conta ativa sob demanda.
 *
 * @returns {Promise<void>}
 */
export async function showGuardians() {
  const view = await loadGuardiansView();
  return view.showGuardians();
}
