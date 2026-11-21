/**
 * @file Identificadores e constantes fundamentais da malha de pares (BroadcastChannel e WebRTC).
 */

import { randomBase36 } from "./shared/html.js";

/** Nome do canal padrão do BroadcastChannel para sincronização entre abas. */
export const CHANNEL_NAME = "vox-peer-v0";

/** Identificador aleatório e efêmero deste nó na malha. */
export const myPeerId = "peer_" + randomBase36(7);

const TXID_REGEX = /^[a-zA-Z0-9_-]{3,128}$/;

/**
 * Valida o formato de um identificador de transação.
 * @param {unknown} txId Identificador a validar.
 * @returns {boolean} Verdadeiro se o identificador é uma string alfanumérica válida.
 */
export function isValidTxId(txId) {
  return typeof txId === "string" && TXID_REGEX.test(txId);
}
