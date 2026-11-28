/**
 * @file Linha do tempo do carrossel de mídia (PM-77): até 4 itens do mesmo tipo tocando como uma peça só.
 * Modelo puro, sem DOM nem decodificação: dá os trechos de cada parte, as marcas da barra de progresso, a posição de um
 * arrasto e o agendamento sem emenda das partes de áudio. Os limites espelham `scripts/media-v2-budget.mjs`
 * (um teste confere os dois). O fluxo contínuo de Opus e o MP4 fragmentado dependem do PM-71 e ficam fora daqui.
 * @module carousel-timeline
 */

/** Limites do carrossel (mídia v2, § Carrossel). */
export const CAROUSEL_LIMITS = Object.freeze({
  maxItems: 4,
  maxAudioItemSec: 60,
  maxVideoItemSec: 10,
  maxAudioTotalSec: 240,
  maxVideoTotalSec: 40,
});

const PER_ITEM_MAX = { audio: CAROUSEL_LIMITS.maxAudioItemSec, video: CAROUSEL_LIMITS.maxVideoItemSec };
const TOTAL_MAX = { audio: CAROUSEL_LIMITS.maxAudioTotalSec, video: CAROUSEL_LIMITS.maxVideoTotalSec };

function validDuration(kind, sec) {
  return sec > 0 && sec <= PER_ITEM_MAX[kind];
}

function sameKind(items) {
  const kind = items[0]?.kind;
  return kind && items.every((i) => i?.kind === kind) ? kind : null;
}

function sliceParts(items) {
  let cursor = 0;
  return items.map((item, index) => {
    const part = { index, startSec: cursor, endSec: cursor + item.durationSec };
    cursor = part.endSec;
    return part;
  });
}

/**
 * Monta a linha do tempo de um carrossel. Fotos não têm duração.
 * @param {Array<{kind: "photo"|"audio"|"video", durationSec?: number}>} items De 1 a 4 itens, todos do mesmo tipo.
 * @returns {{ kind: string, parts: Array<{index: number, startSec: number, endSec: number}>, totalSec: number, marks: number[] }|null}
 * `marks` são as divisões da barra, de 0 a 1 (uma por fronteira entre partes). `null` se o carrossel for inválido.
 */
export function buildCarouselTimeline(items) {
  if (!Array.isArray(items) || items.length > CAROUSEL_LIMITS.maxItems) return null;
  const kind = sameKind(items);
  if (!kind) return null;
  if (kind === "photo") return { kind, parts: items.map((_, index) => ({ index, startSec: 0, endSec: 0 })), totalSec: 0, marks: [] };
  if (!items.every((i) => validDuration(kind, i.durationSec))) return null;
  const parts = sliceParts(items);
  const totalSec = parts[parts.length - 1].endSec;
  if (totalSec > TOTAL_MAX[kind]) return null;
  return { kind, parts, totalSec, marks: parts.slice(1).map((p) => p.startSec / totalSec) };
}

/**
 * Diz em que parte e em que ponto dela cai um instante do conjunto (pausar, avançar e arrastar valem para o todo).
 * Fora do intervalo, vale a ponta mais próxima; na fronteira, vale a parte que começa.
 * @param {{ parts: Array<{index: number, startSec: number, endSec: number}>, totalSec: number }} timeline Linha do tempo.
 * @param {number} sec Instante em segundos do conjunto.
 * @returns {{ index: number, offsetSec: number }}
 */
export function locateInCarousel(timeline, sec) {
  const t = Math.min(Math.max(Number(sec) || 0, 0), timeline.totalSec);
  const last = timeline.parts[timeline.parts.length - 1];
  const part = timeline.parts.find((p) => t < p.endSec) || last;
  return { index: part.index, offsetSec: t - part.startSec };
}

/**
 * Converte a posição da barra de progresso (0 a 1) em instante do conjunto.
 * @param {{ totalSec: number }} timeline Linha do tempo.
 * @param {number} fraction Posição na barra; fora de 0–1 vale a ponta.
 * @returns {number} Segundos.
 */
export function secondsAtFraction(timeline, fraction) {
  return Math.min(Math.max(Number(fraction) || 0, 0), 1) * timeline.totalSec;
}

function onSampleGrid(sec, sampleRate) {
  return Math.round(sec * sampleRate) / sampleRate;
}

/**
 * Agenda as partes de áudio uma atrás da outra para `AudioBufferSourceNode.start(when, offset)`, com os instantes na
 * grade de amostras. Parte já tocada fica de fora; a que está no meio começa no `offset` certo.
 * @param {{ kind: string, parts: Array<{index: number, startSec: number, endSec: number}> }} timeline Linha do tempo de áudio.
 * @param {{ startAt: number, fromSec?: number, sampleRate?: number }} options `startAt` é o relógio do contexto de áudio.
 * @returns {Array<{ index: number, when: number, offset: number }>}
 */
export function scheduleAudioParts(timeline, { startAt, fromSec = 0, sampleRate = 48000 }) {
  if (timeline.kind !== "audio") return [];
  return timeline.parts
    .filter((p) => p.endSec > fromSec)
    .map((p) => ({
      index: p.index,
      when: onSampleGrid(startAt + Math.max(0, p.startSec - fromSec), sampleRate),
      offset: Math.max(0, fromSec - p.startSec),
    }));
}
