/**
 * @file Guardiões, parte 3c — fachada sob demanda (PM-01) para `#/guardiao?…` e `#/voltar`.
 * Mantém a pilha rara de devolução/recuperação fora do grafo estático de boot e do precache (`SHELL_ASSETS`).
 */

/** @type {Promise<typeof import("./screens-guardian-return-view.js")>|null} */
let viewModulePromise = null;

/**
 * Carrega sob demanda e memoiza a implementação das telas de devolução pelos guardiões.
 *
 * @returns {Promise<typeof import("./screens-guardian-return-view.js")>}
 */
function loadGuardianReturnView() {
  viewModulePromise ??= import("./screens-guardian-return-view.js");
  return viewModulePromise;
}

/**
 * Tela do guardião para um pedido aberto pelo link (`#/guardiao?…`).
 *
 * @param {URLSearchParams} query Campos do pedido.
 * @returns {Promise<void>}
 */
export async function showGuardianReturn(query) {
  const view = await loadGuardianReturnView();
  return view.showGuardianReturn(query);
}

/**
 * Tela do aparelho novo: pedir a conta de volta aos guardiões (`#/voltar`).
 *
 * @returns {Promise<void>}
 */
export async function showGuardianRecover() {
  const view = await loadGuardianReturnView();
  return view.showGuardianRecover();
}
