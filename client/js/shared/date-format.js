/**
 * @file Formatação de datas e horários em pt-BR (fuso local). Lógica pura: sem DOM nem estado.
 *
 * Usado pelo domínio e pela camada de renderização para evitar `toLocaleString` espalhado e
 * vazar "Invalid Date" na interface quando o instantâneo é inválido.
 *
 * @module shared/date-format
 * @see docs/ARCHITECTURE.md (seção "Camadas")
 */

const LOCALE = "pt-BR";

/**
 * Converte timestamp numérico (ms) em `Date` ou devolve `null` se inválido.
 * @param {unknown} ts Instantâneo em milissegundos (número ou string numérica).
 * @returns {Date|null}
 */
export function parseInstant(ts) {
  if (ts == null || ts === "" || Number.isNaN(Number(ts))) return null;
  const d = new Date(Number(ts));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Completa com zero à esquerda até duas casas.
 *
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Data calendário DD/MM/AAAA a partir de timestamp.
 * @param {number|string} ts Instantâneo em ms.
 * @returns {string}
 */
export function formatAbsoluteDate(ts) {
  const d = parseInstant(ts);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Data e hora local DD/MM/AAAA HH:MM.
 * @param {number|string} ts
 * @returns {string}
 */
export function formatAbsoluteDateTime(ts) {
  const d = parseInstant(ts);
  if (!d) return "";
  return `${formatAbsoluteDate(ts)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Data e hora curtas no estilo pt-BR (equivalente a `dateStyle`/`timeStyle` `short`).
 * @param {unknown} at Instantâneo em ms.
 * @returns {string}
 */
export function formatPtBrDateTimeShort(at) {
  const d = parseInstant(at);
  return d ? d.toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" }) : "";
}

/**
 * Data por extenso com hora curta (convocações na UI do aviso).
 * @param {unknown} at Instantâneo em ms.
 * @returns {string}
 */
export function formatPtBrDateTimeFull(at) {
  const d = parseInstant(at);
  return d ? d.toLocaleString(LOCALE, { dateStyle: "full", timeStyle: "short" }) : "";
}

/**
 * Só a data calendário no estilo pt-BR (`toLocaleDateString`).
 * @param {unknown} at Instantâneo em ms.
 * @returns {string}
 */
export function formatPtBrDateOnly(at) {
  const d = parseInstant(at);
  return d ? d.toLocaleDateString(LOCALE) : "";
}