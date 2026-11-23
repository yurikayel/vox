/**
 * @file Exportação de eventos e convocações da comunidade em formato iCalendar (.ics, RFC 5545).
 *
 * Lógica pura: sem DOM, sem rede e sem IndexedDB.
 * Gera arquivos compatíveis com calendários móveis e desktop (Google Agenda, Apple Calendar, etc.).
 *
 * @module aviso-ics
 * @see RFC 5545 (Internet Calendaring and Scheduling Core Object Specification)
 * @see docs/specs/aviso-assinado-v0.md
 */

/**
 * Formata um timestamp em milissegundos para a string UTC no formato RFC 5545 (`YYYYMMDDTHHMMSSZ`).
 *
 * @param {unknown} ms Instantâneo em milissegundos (número ou string numérica).
 * @returns {string} Timestamp formatado ou string vazia se inválido.
 */
export function formatIcsUtc(ms) {
  const num = Number(ms);
  if (!Number.isFinite(num) || num <= 0) return "";
  const d = new Date(num);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/**
 * Escapa caracteres especiais em propriedades de texto conforme a RFC 5545 §3.3.11.
 *
 * @param {unknown} value Texto bruto.
 * @returns {string} Texto com barras invertidas, ponto e vírgulas, vírgulas e quebras de linha escapadas.
 */
export function escapeIcsText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Dobra linhas longas de conteúdo em no máximo 75 caracteres com `\r\n ` (RFC 5545 §3.1).
 *
 * @param {string} line Linha simples sem quebras.
 * @returns {string} Linha dobrada com continuação em espaço simples.
 */
export function foldIcsLine(line) {
  if (!line) return "";
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let cur = 75;
  while (cur < line.length) {
    out += `\r\n ${line.slice(cur, cur + 74)}`;
    cur += 74;
  }
  return out;
}

/**
 * Gera um nome de arquivo seguro terminado em `.ics` baseado no título ou identificador do aviso.
 *
 * @param {object} avisoItem Aviso bruto ou envelopado.
 * @returns {string} Nome de arquivo seguro para download (slug + `.ics`).
 */
export function icsDownloadFilename(avisoItem) {
  const item = avisoItem?.aviso || avisoItem || {};
  const rawTitle = String(item.title || avisoItem?.title || "").trim();
  const base = rawTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  if (base) return `${base}.ics`;
  const rawId = String(item.id || avisoItem?.id || "evento").replace(/[^a-z0-9_-]/gi, "");
  return `${rawId || "evento"}.ics`;
}

/**
 * Monta os componentes VEVENT para o payload iCalendar.
 *
 * @param {object} item Dados normalizados do aviso.
 * @param {number} eventAt Timestamp de início em ms.
 * @param {number} durationMs Duração do evento em ms.
 * @param {number} nowMs Timestamp de geração (DTSTAMP) em ms.
 * @param {string} url URL opcional associada ao evento.
 * @returns {string[]} Linhas do VEVENT dobradas.
 */
function buildVeventLines(item, eventAt, durationMs, nowMs, url) {
  const id = String(item.id || "aviso");
  const uid = id.includes("@") ? id : `${id}@vox`;
  const summary = item.title || item.summary || "Aviso da Comunidade";
  const desc = item.body || item.description || "";
  const place = item.eventPlace || item.location || "";
  const lines = [
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${uid}`),
    foldIcsLine(`DTSTAMP:${formatIcsUtc(nowMs)}`),
    foldIcsLine(`DTSTART:${formatIcsUtc(eventAt)}`),
    foldIcsLine(`DTEND:${formatIcsUtc(eventAt + durationMs)}`),
    foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
    foldIcsLine(`DESCRIPTION:${escapeIcsText(desc)}`),
  ];
  if (place) lines.push(foldIcsLine(`LOCATION:${escapeIcsText(place)}`));
  if (url) lines.push(foldIcsLine(`URL:${url}`));
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Constrói o conteúdo de um arquivo `.ics` (RFC 5545) a partir de um aviso com data de evento.
 *
 * @param {object} avisoItem Aviso da comunidade ou item da listagem.
 * @param {object} [options={}]
 * @param {number} [options.durationMs=3600000] Duração estimada do encontro em ms (padrão 1 hora).
 * @param {number} [options.nowMs=Date.now()] Timestamp de geração para DTSTAMP.
 * @param {string} [options.url=""] URL do aviso ou conferência.
 * @returns {string} Texto iCalendar separado e terminado por `\r\n`, ou string vazia se inválido.
 */
export function buildAvisoIcs(avisoItem, { durationMs = 3600000, nowMs = Date.now(), url = "" } = {}) {
  const item = avisoItem?.aviso || avisoItem;
  if (!item) return "";
  const eventAt = Number(item.eventAt ?? avisoItem?.eventAt);
  if (!Number.isFinite(eventAt) || eventAt <= 0) return "";
  const vevent = buildVeventLines(item, eventAt, durationMs, nowMs, url);
  const calendarLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vox//Agenda Comunidade//PT-BR",
    "METHOD:PUBLISH",
    ...vevent,
    "END:VCALENDAR",
  ];
  return `${calendarLines.join("\r\n")}\r\n`;
}
