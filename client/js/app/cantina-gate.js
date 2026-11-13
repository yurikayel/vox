/**
 * @file Quando pedir a entrada (nome e 18+). A tela de portão "sou humano" saiu; a chave `vox-cantina-v1`
 * ficou com o nome antigo para quem já entrou não ver a entrada de novo.
 */

import { isReadFirstRoute } from "./read-first.js";

export const CANTINA_STORAGE_KEY = "vox-cantina-v1";

/**
 * @param {Storage | null | undefined} [storage]
 */
export function hasPassedCantinaGate(storage = globalThis.localStorage) {
  return storage?.getItem(CANTINA_STORAGE_KEY) === "true";
}

/**
 * @param {string} routeName
 * @param {Storage | null | undefined} [storage]
 */
export function shouldShowCantinaGate(routeName, storage = globalThis.localStorage) {
  if (hasPassedCantinaGate(storage)) return false;
  if (routeName === "ajuda-teste") return false;
  // PM-54: link direto para conteúdo abre para leitura; o portão vem na primeira ação que escreve.
  if (isReadFirstRoute(routeName)) return false;
  return true;
}
