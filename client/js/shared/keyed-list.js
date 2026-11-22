/**
 * @file Reconciliador de lista DOM por chave (estilo `<For>`).
 *
 * Mantém instâncias DOM existentes quando a lista muda (gossip, DMs, tokens),
 * preservando foco de inputs, `<details open>` e rolagem.
 *
 * @module shared/keyed-list
 */

/**
 * Remove nós que saíram da lista nova e dispara limpeza opcional.
 * @param {Map<unknown, Node>} nodeMap Mapa atual de chave para nó.
 * @param {Set<unknown>} nextKeys Conjunto de chaves presentes na nova lista.
 * @param {((node: Node, key: unknown) => void)|null} onRemove Callback opcional de remoção.
 * @returns {void}
 */
function pruneRemoved(nodeMap, nextKeys, onRemove) {
  for (const [key, node] of nodeMap) {
    if (nextKeys.has(key)) continue;
    if (onRemove) onRemove(node, key);
    if (node.parentNode) node.parentNode.removeChild(node);
    nodeMap.delete(key);
  }
}

/**
 * Aplica a nova ordem e cria ou atualiza cada nó pela chave.
 * @template T
 * @param {object} cfg Configuração interna do reconciliador.
 * @param {Array<T>} items Lista ordenada de itens.
 * @param {Map<unknown, Node>} nodeMap Mapa de nós vivos.
 * @returns {void}
 */
function reconcileOrder(cfg, items, nodeMap) {
  let refNode = cfg.container.firstChild || null;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const key = cfg.getKey(item);
    let node = nodeMap.get(key);
    if (!node) {
      node = cfg.createNode(item, i);
      nodeMap.set(key, node);
    } else if (cfg.updateNode) {
      cfg.updateNode(node, item, i);
    }
    if (node !== refNode) cfg.container.insertBefore(node, refNode);
    refNode = node.nextSibling || null;
  }
}

/**
 * Cria um controlador de lista DOM indexada por chave única.
 * @template T
 * @param {object} options Opções da lista.
 * @param {Element} options.container Elemento pai onde os itens vivem.
 * @param {(item: T) => unknown} options.getKey Extrator de chave única por item.
 * @param {(item: T, index: number) => Node} options.createNode Fábrica para item novo.
 * @param {((node: Node, item: T, index: number) => void)|null} [options.updateNode] Atualização in-place.
 * @param {((node: Node, key: unknown) => void)|null} [options.onRemove] Limpeza ao remover item.
 * @returns {{ update: (items: Array<T>) => void, clear: () => void }} Controlador da lista.
 * @throws {Error} Se houver chaves duplicadas em `items`.
 */
export function createKeyedList(options) {
  const nodeMap = new Map();
  const cfg = {
    container: options.container,
    getKey: options.getKey,
    createNode: options.createNode,
    updateNode: typeof options.updateNode === "function" ? options.updateNode : null,
    onRemove: typeof options.onRemove === "function" ? options.onRemove : null
  };
  return {
    update(items) {
      const nextKeys = new Set();
      for (const item of items) {
        const key = cfg.getKey(item);
        if (nextKeys.has(key)) throw new Error(`keyed-list: chave duplicada (${String(key)})`);
        nextKeys.add(key);
      }
      pruneRemoved(nodeMap, nextKeys, cfg.onRemove);
      reconcileOrder(cfg, items, nodeMap);
    },
    clear() {
      pruneRemoved(nodeMap, new Set(), cfg.onRemove);
    }
  };
}
