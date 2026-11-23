/**
 * @file Calendário customizável de campanha (E4): tempo do mundo, turnos de 6s e descansos.
 * @module dungeon/vtt-calendar
 */

/** @type {ReadonlyArray<{ id: string, name: string, daysInMonth: number }>} */
export const DEFAULT_MONTHS = Object.freeze([
  { id: "m1", name: "Veredas", daysInMonth: 30 },
  { id: "m2", name: "Brumas", daysInMonth: 30 },
  { id: "m3", name: "Colheita", daysInMonth: 31 },
  { id: "m4", name: "Geada", daysInMonth: 30 },
  { id: "m5", name: "Estrelas", daysInMonth: 31 },
  { id: "m6", name: "Marés", daysInMonth: 30 },
  { id: "m7", name: "Brasa", daysInMonth: 31 },
  { id: "m8", name: "Silêncio", daysInMonth: 30 },
  { id: "m9", name: "Espinho", daysInMonth: 30 },
  { id: "m10", name: "Vidro", daysInMonth: 31 },
  { id: "m11", name: "Vigília", daysInMonth: 30 },
  { id: "m12", name: "Renascença", daysInMonth: 31 },
]);

const ROUND_SECONDS = 6;
const MOON_PHASES = Object.freeze(["nova", "crescente", "cheia", "minguante"]);

function normMonth(raw, idx) {
  const id = String(raw?.id || `m${idx + 1}`).slice(0, 16);
  const name = String(raw?.name || `Mês ${idx + 1}`).trim().slice(0, 40);
  const daysInMonth = Math.min(40, Math.max(1, Math.trunc(Number(raw?.daysInMonth) || 30)));
  return { id, name, daysInMonth };
}

/**
 * Cria o estado padrão do calendário de campanha.
 * @param {object} [init={}] Sobrescritas (`year`, `monthIndex`, `day`, `minuteOfDay`, `secondInMinute`, `moonPhase`, `months`, `roundSeconds`).
 * @returns {object} Estado do calendário.
 */
export function createDefaultCalendar(init = {}) {
  const months = Array.isArray(init.months) && init.months.length
    ? init.months.map(normMonth)
    : DEFAULT_MONTHS.map((m, i) => normMonth(m, i));
  const rawMin = Number.isFinite(Number(init.minuteOfDay)) ? Number(init.minuteOfDay) : 8 * 60;
  const wholeMin = Math.max(0, Math.min(24 * 60 - 1, Math.floor(rawMin)));
  const fracSec = Math.round((rawMin - Math.floor(rawMin)) * 60);
  const rawSec = Number.isFinite(Number(init.secondInMinute)) ? Math.trunc(Number(init.secondInMinute)) : fracSec;
  return {
    year: Math.max(1, Math.trunc(Number(init.year) || 1)),
    monthIndex: Math.max(0, Math.min(months.length - 1, Math.trunc(Number(init.monthIndex) || 0))),
    day: Math.max(1, Math.trunc(Number(init.day) || 1)),
    minuteOfDay: wholeMin,
    secondInMinute: Math.max(0, Math.min(59, rawSec)),
    moonPhase: MOON_PHASES.includes(init.moonPhase) ? init.moonPhase : "crescente",
    months,
    roundSeconds: Math.max(1, Math.trunc(Number(init.roundSeconds) || ROUND_SECONDS)),
    totalRounds: Math.max(0, Math.trunc(Number(init.totalRounds) || 0)),
  };
}

function monthAt(cal, idx) {
  const i = ((idx % cal.months.length) + cal.months.length) % cal.months.length;
  return { month: cal.months[i], index: i };
}

function nextMoonPhase(current) {
  const idx = MOON_PHASES.indexOf(current);
  return MOON_PHASES[(idx + 1) % MOON_PHASES.length];
}

function bumpDay(cal) {
  const { month, index } = monthAt(cal, cal.monthIndex);
  let day = cal.day + 1;
  let monthIndex = index;
  let year = cal.year;
  if (day > month.daysInMonth) {
    day = 1;
    monthIndex += 1;
    if (monthIndex >= cal.months.length) {
      monthIndex = 0;
      year += 1;
    }
  }
  const moonPhase = (day - 1) % 7 === 0 ? nextMoonPhase(cal.moonPhase) : cal.moonPhase;
  return { ...cal, day, monthIndex, year, moonPhase };
}

function addMinutesOnce(cal, minutes) {
  let minuteOfDay = Math.trunc(cal.minuteOfDay) + Math.trunc(minutes);
  let next = { ...cal, minuteOfDay };
  while (minuteOfDay >= 24 * 60) {
    minuteOfDay -= 24 * 60;
    next = bumpDay({ ...next, minuteOfDay });
  }
  return { ...next, minuteOfDay };
}

/**
 * Avança o tempo do mundo segundo um atalho de campanha.
 * @param {object} calendar Estado atual.
 * @param {"round"|"minutes_10"|"short_rest"|"long_rest"|{ minutes: number }} delta Tipo de avanço.
 * @returns {{ calendar: object, label: string, minutesAdded: number }} Novo estado e rótulo legível.
 */
export function advanceTime(calendar, delta) {
  const base = createDefaultCalendar(calendar);
  if (delta === "round") {
    const label = `+1 rodada (${base.roundSeconds}s)`;
    const totalSec = base.secondInMinute + base.roundSeconds;
    const carryMin = Math.floor(totalSec / 60);
    const secondInMinute = totalSec % 60;
    const next = carryMin ? addMinutesOnce(base, carryMin) : { ...base };
    return {
      calendar: { ...next, secondInMinute, totalRounds: base.totalRounds + 1 },
      label,
      minutesAdded: base.roundSeconds / 60,
    };
  }
  const minutesMap = { minutes_10: 10, short_rest: 60, long_rest: 8 * 60 };
  const minutes = minutesMap[delta] ?? Math.trunc(Number(delta?.minutes) || 0);
  if (!minutes) return { calendar: base, label: "", minutesAdded: 0 };
  const labels = { minutes_10: "+10 min", short_rest: "Descanso curto (+1h)", long_rest: "Descanso longo (+8h)" };
  return { calendar: addMinutesOnce(base, minutes), label: labels[delta] || `+${minutes} min`, minutesAdded: minutes };
}

/**
 * Formata a data do mundo para frontmatter e crônica.
 * @param {object} [calendar] Estado do calendário.
 * @returns {string} Data legível.
 */
export function formatInWorldDate(calendar) {
  const cal = createDefaultCalendar(calendar);
  const { month } = monthAt(cal, cal.monthIndex);
  const h = Math.floor(cal.minuteOfDay / 60);
  const m = cal.minuteOfDay % 60;
  const s = cal.secondInMinute || 0;
  /**
   * Formata um número com dois dígitos, completando com zero à esquerda.
   *
   * @param {number} n Valor a formatar.
   * @returns {string} Texto de dois dígitos.
   */
  const pad = (n) => String(n).padStart(2, "0");
  const clock = s ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
  return `Ano ${cal.year}, ${cal.day} de ${month.name} — ${clock} (lua ${cal.moonPhase})`;
}