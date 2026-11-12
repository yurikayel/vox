/**
 * @file Data de corte (gênese): tudo publicado antes dela era teste e não aparece no app.
 * O Arweave é permanente; o corte é só de leitura e cada aparelho o aplica sozinho.
 */

/**
 * Timestamp da data de corte (gênese) em milissegundos UTC.
 * @type {number}
 */
export const GENESIS_MS = Date.UTC(2026, 10, 11, 23, 55, 0); // 2026-11-11 20:55 (Brasília)

const GENESIS_SEC = Math.floor(GENESIS_MS / 1000);

function tagTimestampMs(tags) {
  if (!Array.isArray(tags)) return 0;
  const t = tags.find((x) => x?.name === "Timestamp");
  const n = Number(t?.value || 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Transação do Arweave é anterior à gênese? A hora do bloco manda; sem bloco
 * (ainda pendente), usa a tag Timestamp; sem nenhuma das duas, é recente e fica.
 * @param {object} node Nó de transação GraphQL.
 * @returns {boolean} True se for anterior à gênese.
 */
export function isBeforeGenesisNode(node) {
  const blockSec = Number(node?.block?.timestamp || 0);
  if (blockSec > 0) return blockSec < GENESIS_SEC;
  const tagMs = tagTimestampMs(node?.tags);
  return tagMs > 0 && tagMs < GENESIS_MS;
}

/**
 * Item local ou da memória central (ms) anterior à gênese. Sem data, fica.
 * @param {number|string} ms Timestamp em milissegundos.
 * @returns {boolean} True se for anterior à gênese.
 */
export function isBeforeGenesisMs(ms) {
  const n = Number(ms || 0);
  return n > 0 && n < GENESIS_MS;
}

/**
 * Remove das respostas GraphQL as transações anteriores à gênese.
 * @param {object} data Objeto data retornado pelo endpoint GraphQL.
 * @returns {object} Objeto filtrado.
 */
export function filterGraphqlData(data) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };
  if (out.transactions?.edges) {
    out.transactions = {
      ...out.transactions,
      edges: out.transactions.edges.filter((e) => !isBeforeGenesisNode(e?.node)),
    };
  }
  if (out.transaction && isBeforeGenesisNode(out.transaction)) {
    out.transaction = null;
  }
  return out;
}
