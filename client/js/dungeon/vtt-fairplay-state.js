/**
 * @file Estado Fairplay da campanha (ADR-040): constantes de teto, normalização do bloco `fairplay` salvo ou
 * recebido, e o selo que evita recopiar um bloco já normalizado a cada op. Folha: não depende das fases.
 * @module dungeon/vtt-fairplay-state
 */
import { isSafeKey } from "../shared/safe-key.js";

/** Máximo de pares com chave ou admissão na campanha. */
export const MAX_KEYS = 64;
/** Rolagens mais recentes cujas ops assinadas o log guarda para refazer o estado (as mais antigas saem primeiro). */
export const MAX_LOGGED_ROLLS = 50;
/** Ops de chave guardadas por par. */
export const MAX_KEY_OPS_PER_ACTOR = 64;
/** Eventos de admissão e revogação guardados por par (o mais antigo sai primeiro). */
export const MAX_ADMIT_EVENTS_PER_ACTOR = 16;
const NORMALIZED = new WeakSet();

/**
 * Marca um bloco `fairplay` já normalizado, para não recopiá-lo a cada op (o bloco é imutável depois de selado).
 * @param {object} fp Bloco normalizado.
 * @returns {object} O mesmo bloco, selado.
 */
export function seal(fp) {
  NORMALIZED.add(fp);
  return fp;
}

/**
 * Filtra um mapa de entrada não confiável: só chaves seguras com valor objeto.
 * @param {unknown} map Mapa cru.
 * @returns {object} Mapa filtrado.
 */
export function pickMap(map) {
  return Object.fromEntries(Object.entries(map && typeof map === "object" ? map : {}).filter(([k, v]) => isSafeKey(k) && v && typeof v === "object"));
}

function normalizeKeyOps(map) {
  return Object.fromEntries(Object.entries(pickMap(map)).filter(([, list]) => Array.isArray(list)).map(([actor, list]) => [actor, list.slice(-MAX_KEY_OPS_PER_ACTOR)]));
}

function normalizeAdmitOps(map) {
  const asList = (v) => (Array.isArray(v) ? v : [v]).filter((o) => o && typeof o === "object");
  return Object.fromEntries(Object.entries(pickMap(map)).map(([actor, v]) => [actor, asList(v).slice(-MAX_ADMIT_EVENTS_PER_ACTOR)]));
}

function normalizeRollOps(map) {
  const entries = Object.entries(pickMap(map)).filter(([, e]) => Array.isArray(e.ops) && Number.isFinite(Number(e.seq)));
  const newest = entries.sort((x, y) => Number(x[1].seq) - Number(y[1].seq)).slice(-MAX_LOGGED_ROLLS);
  return Object.fromEntries(newest.map(([id, e]) => [id, { seq: Number(e.seq), ops: e.ops }]));
}

function normalizeLoggedOps(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const rolls = normalizeRollOps(src.rolls);
  const top = Math.max(0, Number(src.seq) || 0, ...Object.values(rolls).map((e) => e.seq));
  return { seq: top, admit: normalizeAdmitOps(src.admit), keys: normalizeKeyOps(src.keys), rolls };
}

/**
 * Normaliza o bloco `fairplay` de um `CampaignDoc`: chaves da sessão, admitidos, rolagens e as ops assinadas guardadas.
 * @param {unknown} raw Bloco salvo ou ausente.
 * @returns {{keys: object, rolls: object, admitted: object, revoked: object, ops: {seq: number, admit: object, keys: object, rolls: object}}} Bloco seguro para o estado.
 */
export function normalizeFairplayState(raw) {
  if (raw && NORMALIZED.has(raw)) return raw;
  const src = raw && typeof raw === "object" ? raw : {};
  return seal({ keys: pickMap(src.keys), rolls: pickMap(src.rolls), admitted: pickMap(src.admitted), revoked: pickMap(src.revoked), ops: normalizeLoggedOps(src.ops) });
}

/**
 * Bloco `fairplay` normalizado de um estado de campanha.
 * @param {object} state Estado da campanha.
 * @returns {object} Bloco selado.
 */
export function fairplayOf(state) {
  return normalizeFairplayState(state.fairplay);
}

