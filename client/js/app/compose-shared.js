/**
 * @file Utilitários compartilhados entre fluxos de composição (kill-switch, leitura de input e saída pós-publicação).
 *
 * @module app/compose-shared
 */

import * as featureFlags from "../feature-flags.js";
import * as render from "../render.js";
import * as share from "../share.js";
import { focusComposeAfterSteppedPublish } from "./compose-stepper.js";

/**
 * Lê e apara o valor textual de um campo de formulário pelo ID.
 *
 * @param {string} id ID do elemento no DOM.
 * @returns {string} Valor aparado ou string vazia se ausente.
 */
export function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

/**
 * LAN-08: se o recurso estiver pausado no kill-switch, exibe o aviso e retorna true.
 *
 * @param {HTMLElement} main Container principal da tela.
 * @param {string} flag Nome da feature flag a verificar.
 * @returns {boolean} True quando o recurso está pausado.
 */
export function renderIfPaused(main, flag) {
  if (featureFlags.isFeatureEnabled(flag)) return false;
  render.renderError(main, featureFlags.disabledMessage(flag));
  return true;
}

/**
 * Mostra toast, reposiciona foco acessível do compositor em etapas e navega para a rota destino.
 *
 * @param {string} message Mensagem de confirmação exibida ao usuário.
 * @param {string} hash Rota hash de destino.
 * @returns {void}
 */
export function leaveComposeAfterPublish(message, hash) {
  share.showToast(message);
  focusComposeAfterSteppedPublish(message);
  location.hash = hash;
}
