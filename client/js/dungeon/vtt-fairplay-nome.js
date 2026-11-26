/**
 * @file Identificação de quem pede para entrar no Fairplay. O nome vem da rede e não é confiável: é limpo (sem
 * invisíveis, sem marcas de direção, sem empilhar acentos, tamanho limitado) e mostrado sempre junto do identificador
 * do par (10 hex do fim do `routeId`, em dois grupos). **A confiança está no identificador, não no nome**: homóglifos
 * (letras parecidas de outros alfabetos) continuam aceitos, e dois pares com o mesmo nome ou o mesmo identificador
 * exibido são sinalizados por {@link duplicatePeerIds}.
 * @module dungeon/vtt-fairplay-nome
 */

const MAX_NAME = 32;
const MAX_MARKS = 2;
const FINGERPRINT_LEN = 10;
const BRAILLE_BLANK = String.fromCodePoint(0x2800);
// Controles e separadores de linha/parágrafo viram espaço; formatadores, ignoráveis por padrão (U+061C, U+00AD,
// U+3164, U+FFA0, U+034F, U+17B4/5, U+180E, seletores de variação, tags U+E0000–E007F) e o braille vazio somem.
const TO_SPACE = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
const INVISIBLE = new RegExp(String.raw`[\p{Cf}\p{Default_Ignorable_Code_Point}${BRAILLE_BLANK}]`, "gu");
const MARK = /^\p{M}$/u;

/** Mantém no máximo `MAX_MARKS` marcas combinantes seguidas por base (impede empilhar acentos). */
function limitMarks(text) {
  let run = 0;
  let out = "";
  for (const ch of text) {
    run = MARK.test(ch) ? run + 1 : 0;
    if (run <= MAX_MARKS) out += ch;
  }
  return out;
}

/**
 * Limpa um nome de exibição anunciado por outro par.
 * @param {unknown} raw Valor recebido (qualquer tipo).
 * @returns {string} Nome em NFC, de até 32 caracteres, ou vazio quando não sobra nada.
 */
export function sanitizeDisplayName(raw) {
  if (typeof raw !== "string") return "";
  const visible = raw.normalize("NFC").replace(TO_SPACE, " ").replace(INVISIBLE, "");
  const clean = limitMarks(visible).normalize("NFC").replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, MAX_NAME).join("").trim();
}

/**
 * Identificador legível do par: 10 hex do fim do `routeId`, em dois grupos de 5.
 * @param {string} id `routeId` do par (`vx_<hex>`).
 * @returns {string} Por exemplo `1a2b3 c4d5e`.
 */
export function peerFingerprint(id) {
  const tail = String(id || "").replace(/^vx_/, "").slice(-FINGERPRINT_LEN);
  return `${tail.slice(0, 5)} ${tail.slice(5)}`.trim();
}

/**
 * Rótulo para quando não há nome: o identificador do par com o prefixo do `routeId`.
 * @param {string} id `routeId` do par.
 * @returns {string} Rótulo sem nome.
 */
export function shortRouteId(id) {
  return `vx_… ${peerFingerprint(id)}`;
}

/**
 * Rótulo para a lista de admissão: nome limpo mais o identificador do par; sem nome, só o identificador.
 * O texto sai em claro: quem renderiza precisa escapar.
 * @param {string} id `routeId` do par.
 * @param {unknown} name Nome anunciado, não confiável.
 * @returns {string} Rótulo de exibição.
 */
export function fairplayPeerLabel(id, name) {
  const clean = sanitizeDisplayName(name);
  if (!clean) return shortRouteId(id);
  return `${clean} [${peerFingerprint(id)}]`;
}

/** Registra o par sob uma chave e marca como repetidos todos os que dividem essa chave. */
function track(seen, dup, key, id) {
  const first = seen.get(key);
  if (first === undefined) return seen.set(key, id);
  dup.add(first);
  return dup.add(id);
}

/**
 * Pares cujo nome limpo (sem diferenciar maiúsculas) ou identificador exibido repete o de outro par da lista.
 * @param {Iterable<string>} ids `routeId` de pendentes e admitidos.
 * @param {Record<string, unknown>} [names] Nome anunciado por `routeId`.
 * @returns {Set<string>} `routeId` que merecem aviso.
 */
export function duplicatePeerIds(ids, names = {}) {
  const seen = new Map();
  const dup = new Set();
  for (const id of new Set(ids)) {
    const name = sanitizeDisplayName(names?.[id]).toLowerCase();
    if (name) track(seen, dup, `n:${name}`, id);
    track(seen, dup, `f:${peerFingerprint(id)}`, id);
  }
  return dup;
}
