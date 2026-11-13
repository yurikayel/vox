/**
 * Pronomes, gênero e orientação sexual opcionais por conta (local-first).
 * Tudo opcional e em texto livre para suportar qualquer pronome (incl. Jacaré).
 */

const META_KEY = "vox-profile-identity-meta-v1";
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Tamanho máximo (em caracteres) para pronomes no perfil. */
export const PRONOUN_MAX = 40;
/** Tamanho máximo (em caracteres) para gênero e orientação sexual opcionais. */
export const IDENTITY_FIELD_MAX = 48;

/** Lista de atalhos rápidos para pronomes (inclui `Jacaré 🐊` como humor), sem impedir texto livre. */
export const PRONOUN_PRESETS = Object.freeze([
  { value: "ele/dele", label: "ele/dele" },
  { value: "ela/dela", label: "ela/dela" },
  { value: "elu/delu", label: "elu/delu" },
  { value: "ile/dile", label: "ile/dile" },
  { value: "ele/ela", label: "ele/ela" },
  { value: "they/them", label: "they/them" },
  { value: "qualquer", label: "qualquer" },
  { value: "Jacaré 🐊", label: "Jacaré 🐊", fun: true },
]);

/** Sugestões opcionais para o campo livre de gênero (`<datalist>`). */
export const GENDER_SUGGESTIONS = Object.freeze([
  "Mulher cis",
  "Homem cis",
  "Mulher trans",
  "Homem trans",
  "Travesti",
  "Não-binário",
  "Gênero fluido",
  "Agênero",
  "Prefiro não dizer",
]);

/** Sugestões opcionais para o campo livre de orientação sexual (`<datalist>`). */
export const ORIENTATION_SUGGESTIONS = Object.freeze([
  "Heterossexual",
  "Gay",
  "Lésbica",
  "Bissexual",
  "Pansexual",
  "Assexual",
  "Arromântico",
  "Demissexual",
  "Queer",
  "Prefiro não dizer",
]);

function isSafeRouteKey(routeId) {
  const id = String(routeId || "").trim();
  return Boolean(id) && !FORBIDDEN_KEYS.has(id);
}

function cleanField(val, maxLen) {
  return String(val || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function readMetaStore() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMetaStore(map) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const keys = Object.keys(map);
    if (!keys.length) window.localStorage.removeItem(META_KEY);
    else window.localStorage.setItem(META_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * Normaliza pronomes, gênero e orientação sexual aceitando qualquer texto livre.
 * @param {{ pronouns?: string, gender?: string, orientation?: string }} [raw] Campos informados.
 * @returns {{ pronouns: string, gender: string, orientation: string }} Objeto limpo.
 */
export function normalizeIdentityMeta(raw = {}) {
  return {
    pronouns: cleanField(raw?.pronouns, PRONOUN_MAX),
    gender: cleanField(raw?.gender, IDENTITY_FIELD_MAX),
    orientation: cleanField(raw?.orientation, IDENTITY_FIELD_MAX),
  };
}

/**
 * Verifica se há ao menos um campo preenchido.
 * @param {{ pronouns?: string, gender?: string, orientation?: string }} [meta] Campos.
 * @returns {boolean} True quando há algo salvo.
 */
export function hasAnyIdentityMeta(meta) {
  return Boolean(meta?.pronouns || meta?.gender || meta?.orientation);
}

/**
 * Seleciona e normaliza `pronouns`, `gender` e `orientation` entre fonte primária e fallback.
 * @param {object} [primary] Fonte prioritária.
 * @param {object} [fallback] Fonte de fallback.
 * @returns {{ pronouns: string, gender: string, orientation: string }} Campos normalizados.
 */
export function pickIdentityMeta(primary, fallback) {
  const srcA = primary || {};
  const srcB = fallback || {};
  return {
    pronouns: cleanField(srcA.pronouns || srcB.pronouns, PRONOUN_MAX),
    gender: cleanField(srcA.gender || srcB.gender, IDENTITY_FIELD_MAX),
    orientation: cleanField(srcA.orientation || srcB.orientation, IDENTITY_FIELD_MAX),
  };
}

/**
 * Detecta variação lúdica de pronome "Jacaré" (case-insensitive).
 * @param {string} [pronouns] Texto dos pronomes.
 * @returns {boolean} True quando corresponde a Jacaré.
 */
export function isJokePronoun(pronouns) {
  return /\bjacar[eé]\b/i.test(String(pronouns || ""));
}

/**
 * Lê pronomes, gênero e orientação opcionais salvos localmente para um `routeId`.
 * @param {string} routeId Identificador local da conta.
 * @returns {{ pronouns: string, gender: string, orientation: string }} Campos normalizados.
 */
export function getLocalIdentityMeta(routeId) {
  if (!isSafeRouteKey(routeId)) return normalizeIdentityMeta();
  const entry = readMetaStore()[String(routeId).trim()];
  return normalizeIdentityMeta(entry);
}

/**
 * Grava ou limpa os campos opcionais de identidade de um `routeId`.
 * @param {string} routeId Identificador local da conta.
 * @param {{ pronouns?: string, gender?: string, orientation?: string }} meta Valores novos.
 * @returns {{ pronouns: string, gender: string, orientation: string }} Valor salvo.
 */
export function setLocalIdentityMeta(routeId, meta) {
  const clean = normalizeIdentityMeta(meta);
  if (!isSafeRouteKey(routeId)) return clean;
  const id = String(routeId).trim();
  const store = readMetaStore();
  if (!hasAnyIdentityMeta(clean)) delete store[id];
  else store[id] = clean;
  writeMetaStore(store);
  return clean;
}

/**
 * Remove os campos opcionais salvos para um `routeId`.
 * @param {string} routeId Identificador local da conta.
 */
export function clearLocalIdentityMeta(routeId) {
  setLocalIdentityMeta(routeId, {});
}
