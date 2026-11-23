/**
 * @file Receptor em memória central para repasse de posts e lápides gravados no cache local.
 */

let centralMemorySink = null;

/**
 * Define quem recebe cada post e lápide gravados, para repassar à memória central (substitui o anterior).
 * @param {((msg: {type: "GOSSIP"|"GOSSIP_DELETE", item?: object, tombstone?: object}) => void)|null} fn Receptor; outro valor desliga.
 */
export function registerCentralMemorySink(fn) {
  centralMemorySink = typeof fn === "function" ? fn : null;
}

/**
 * Envia uma mensagem para o receptor de memória central, se estiver configurado.
 * @param {{type: "GOSSIP"|"GOSSIP_DELETE", item?: object, tombstone?: object}} msg Mensagem para a memória central.
 */
export function dispatchCentralMemory(msg) {
  if (centralMemorySink) {
    centralMemorySink(msg);
  }
}
