/**
 * @file Matemática pura do pacote `gurps4e`: atributos secundários, níveis de carga e resolução `3d6_sob_nh`.
 * Só fórmulas de mecânica de jogo implementadas pelo Vox; nenhuma tabela de perícias, vantagens, desvantagens ou texto de regra.
 * Funções puras, sem estado: a ficha nunca grava o resultado (spec brainstorm v0, §4).
 *
 * @module dungeon/system-gurps-math
 * @see docs/specs/pacote-gurps4e-v0.md
 */

const SCORE_MIN = 1;
const SCORE_MAX = 40;
const SCORE_DEFAULT = 10;
const CARGA = Object.freeze([
  Object.freeze({ id: "nenhuma", maxBl: 1, move: 1, dodge: 0 }),
  Object.freeze({ id: "leve", maxBl: 2, move: 0.8, dodge: -1 }),
  Object.freeze({ id: "media", maxBl: 3, move: 0.6, dodge: -2 }),
  Object.freeze({ id: "pesada", maxBl: 6, move: 0.4, dodge: -3 }),
  Object.freeze({ id: "muito-pesada", maxBl: 10, move: 0.2, dodge: -4 }),
]);

/** Níveis de carga (múltiplo da Carga Básica, fator de Deslocamento e redutor de Esquiva). @type {readonly object[]} */
export const GURPS_LOAD_LEVELS = CARGA;

/**
 * Valor de atributo como inteiro de 1 a 40; ausente ou inválido vira 10.
 * @param {unknown} value Valor cru.
 * @returns {number} Inteiro seguro.
 */
export function gurpsScore(value) {
  if (value === null || value === undefined || value === "") return SCORE_DEFAULT;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(SCORE_MAX, Math.max(SCORE_MIN, n)) : SCORE_DEFAULT;
}

/**
 * Carga Básica em libras: ST² / 5, arredondada a inteiro quando chega a 10 ou mais.
 * @param {number} st Força.
 * @returns {number} Carga Básica.
 */
export function basicLift(st) {
  const raw = (gurpsScore(st) * gurpsScore(st)) / 5;
  return raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
}

/**
 * Atributos secundários a partir de ST, DX, IQ e HT: PV = ST, Vontade = Percepção = IQ, PF = HT,
 * Velocidade Básica = (DX + HT) / 4, Deslocamento Básico = parte inteira dela, Esquiva = Deslocamento + 3.
 * @param {{st?: number, dx?: number, iq?: number, ht?: number}} [scores] Atributos primários.
 * @returns {{hp: number, will: number, per: number, fp: number, basicSpeed: number, basicMove: number, dodge: number, basicLift: number}} Secundários.
 */
export function gurpsSecondaries(scores = {}) {
  const [st, dx, iq, ht] = ["st", "dx", "iq", "ht"].map((id) => gurpsScore(scores[id]));
  const basicSpeed = (dx + ht) / 4;
  const basicMove = Math.floor(basicSpeed);
  return { hp: st, will: iq, per: iq, fp: ht, basicSpeed, basicMove, dodge: basicMove + 3, basicLift: basicLift(st) };
}

/**
 * Nível de carga para um peso carregado, com o Deslocamento e a Esquiva já ajustados.
 * @param {{st?: number, dx?: number, ht?: number}} scores Atributos primários.
 * @param {number} weightLb Peso carregado, em libras (negativo ou inválido conta como zero).
 * @returns {{level: string, index: number, move: number, dodge: number, overloaded: boolean}} Nível, Deslocamento e Esquiva; `overloaded` passa de 10 × Carga Básica.
 */
export function encumbrance(scores, weightLb) {
  const sec = gurpsSecondaries(scores);
  const weight = Number.isFinite(Number(weightLb)) ? Math.max(0, Number(weightLb)) : 0;
  const found = CARGA.findIndex((c) => weight <= c.maxBl * sec.basicLift);
  const index = found === -1 ? CARGA.length - 1 : found;
  const row = CARGA[index];
  return { level: row.id, index, move: Math.max(1, Math.floor(sec.basicMove * row.move)), dodge: Math.max(1, sec.dodge + row.dodge), overloaded: found === -1 };
}

/**
 * Resolve um teste `3d6_sob_nh`: sucesso com a soma até o NH (3 e 4 sempre, 17 e 18 nunca); crítico de sucesso em 3, 4,
 * 5 com NH 15+ e 6 com NH 16+; crítico de falha em 18, em 17 com NH 15 ou menos e em 10 ou mais acima do NH.
 * @param {number} nh Nível de habilidade efetivo.
 * @param {number} roll Soma real dos três dados (3 a 18); o chamador a fornece, e esta função não valida NaN nem faixa.
 * @returns {{success: boolean, critical: boolean, margin: number}} Resultado e margem (NH − soma).
 */
export function resolve3d6(nh, roll) {
  const total = Math.trunc(Number(roll));
  const level = Math.trunc(Number(nh));
  const success = total <= 4 || (total < 17 && total <= level);
  const critSuccess = total <= 4 || (total === 5 && level >= 15) || (total === 6 && level >= 16);
  const critFail = total === 18 || (total === 17 && level <= 15) || total - level >= 10;
  return { success, critical: success ? critSuccess : critFail, margin: level - total };
}
