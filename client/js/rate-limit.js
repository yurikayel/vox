/**
 * LAN-14 — limite de taxa por chave na malha (sem servidor, sem ranking pago).
 *
 * Cada aparelho conta, por autor (chave pública), quantos posts NOVOS aceitou do gossip
 * numa janela deslizante. Acima do teto, o item é descartado e não é repassado —
 * o spam morre no primeiro salto honesto. A contagem só vale depois de verificar a
 * assinatura, para ninguém esgotar a cota de outra pessoa.
 *
 * Parâmetros (ajuste aqui e em docs/strategy/backlog-lancamento-publico-2026-11.md):
 *   GOSSIP_WINDOW_MS = 10 min · GOSSIP_MAX_PER_WINDOW = 20 posts por autor.
 */

/** Janela deslizante do limitador de gossip em milissegundos (10 min). */
export const GOSSIP_WINDOW_MS = 10 * 60 * 1000;
/** Máximo de posts novos aceitos por autor dentro da janela de gossip. */
export const GOSSIP_MAX_PER_WINDOW = 20;
const MAX_TRACKED_KEYS = 5000;

/**
 * Cria um limitador de taxa em memória com janela deslizante por chave.
 * @param {{ windowMs?: number, max?: number, now?: () => number }} [options={}] Parâmetros da janela.
 * @returns {{ allow: (key: string) => boolean, size: () => number }} Instância do limitador.
 */
export function createRateLimiter({ windowMs = GOSSIP_WINDOW_MS, max = GOSSIP_MAX_PER_WINDOW, now = () => Date.now() } = {}) {
  const hits = new Map();

  /**
   * Remove da lista os instantes que já saíram da janela.
   * @param {number[]} list Instantes registrados
   * @param {number} t Instante atual (ms)
   */
  function prune(list, t) {
    while (list.length && t - list[0] >= windowMs) list.shift();
  }

  /** true se o autor ainda pode publicar nesta janela (e registra a tentativa aceita). */
  function allow(key) {
    if (!key) return false;
    const t = now();
    const list = hits.get(key) || [];
    prune(list, t);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(t);
    hits.delete(key);
    hits.set(key, list);
    if (hits.size > MAX_TRACKED_KEYS) hits.delete(hits.keys().next().value);
    return true;
  }

  return { allow, size: () => hits.size };
}

const gossipLimiter = createRateLimiter();

/**
 * Verifica e contabiliza se o autor ainda pode propagar um item novo de gossip nesta janela.
 * @param {string} author Identificador/chave pública do autor.
 * @returns {boolean} `true` quando dentro do limite.
 */
export function allowGossipFromAuthor(author) {
  return gossipLimiter.allow(author);
}
