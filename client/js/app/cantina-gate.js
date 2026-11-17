/**
 * @file Quando pedir a entrada (nome e 18+). A tela de portão "sou humano" saiu; a chave `vox-cantina-v1`
 * ficou com o nome antigo para quem já entrou não ver a entrada de novo.
 */

import { isReadFirstRoute } from "./read-first.js";

/**
 * Chave em `localStorage` que marca que o aparelho já passou pelo portão de entrada (nome e 18+).
 *
 * @type {string}
 */
export const CANTINA_STORAGE_KEY = "vox-cantina-v1";

/**
 * Diz se este aparelho já concluiu o portão de entrada (nome e 18+).
 *
 * @param {Storage | null | undefined} [storage=globalThis.localStorage] Armazenamento lido.
 * @returns {boolean}
 */
export function hasPassedCantinaGate(storage = globalThis.localStorage) {
  return storage?.getItem(CANTINA_STORAGE_KEY) === "true";
}

/**
 * Diz se a rota atual deve exibir o portão de entrada antes de ações que escrevem.
 *
 * @param {string} routeName Nome lógico da rota ativa.
 * @param {Storage | null | undefined} [storage=globalThis.localStorage] Armazenamento lido.
 * @returns {boolean} `false` em ajuda-teste, rotas read-first e após o portão já passado.
 */
export function shouldShowCantinaGate(routeName, storage = globalThis.localStorage) {
  if (hasPassedCantinaGate(storage)) return false;
  if (routeName === "ajuda-teste") return false;
  // PM-54: link direto para conteúdo abre para leitura; o portão vem na primeira ação que escreve.
  if (isReadFirstRoute(routeName)) return false;
  return true;
}
