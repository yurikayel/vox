/**
 * @file Redução LWW (Last-Write-Wins) por `editedAt ?? ts ?? 0` com desempate determinístico por `sig`.
 * @module shared/reduce-lww
 */

/** Extrai o timestamp numérico (`editedAt ?? ts ?? 0`), retornando `0` para valores inválidos. */
const lwwTimestamp = (item) => Number(item?.editedAt ?? item?.ts ?? 0) || 0;

/**
 * Compara `incoming` contra `current` segundo a regra LWW (`editedAt ?? ts ?? 0` e desempate por `sig`).
 * Itens duplicados com o mesmo timestamp e assinatura são ignorados (`false`).
 *
 * @param {object|null|undefined} incoming Item candidato recebido.
 * @param {object|null|undefined} current Item atualmente vencedor.
 * @returns {boolean} `true` quando `incoming` supera `current`.
 */
export function isNewerLww(incoming, current) {
  if (!incoming || typeof incoming !== "object") return false;
  if (!current || typeof current !== "object") return true;
  const inTs = lwwTimestamp(incoming);
  const curTs = lwwTimestamp(current);
  if (inTs !== curTs) return inTs > curTs;
  const inSig = String(incoming.sig ?? "");
  const curSig = String(current.sig ?? "");
  if (inSig === curSig) return false;
  return inSig > curSig;
}

/**
 * Reduz uma coleção de itens mantendo apenas a versão vencedora por autor segundo {@link isNewerLww}.
 *
 * @template T
 * @param {Iterable<T>|null|undefined} items Lista ou iterável de itens.
 * @param {(item: T) => string} [getAuthor] Extrator do identificador de autor.
 * @returns {Map<string, T>} Mapa `autor -> item vencedor`.
 */
export function reduceLwwByAuthor(items, getAuthor = (item) => item?.author ?? "") {
  const winners = new Map();
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const author = getAuthor(item);
    if (!author) continue;
    if (isNewerLww(item, winners.get(author))) winners.set(author, item);
  }
  return winners;
}
