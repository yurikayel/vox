/**
 * @file Nome de exibição de quem pede para entrar no Fairplay: o valor vem da rede e não é confiável. Aqui ele é
 * limpo (sem controle, sem marcas de direção, tamanho limitado) e mostrado sempre junto de um sufixo do `routeId`,
 * para que ninguém se passe por outro só repetindo o nome.
 * @module dungeon/vtt-fairplay-nome
 */

const MAX_NAME = 32;
const SUFFIX_LEN = 4;
// Controles C0/C1, separadores de linha e parágrafo, marcas e isolantes de direção, largura zero e BOM.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * Limpa um nome de exibição anunciado por outro par.
 * @param {unknown} raw Valor recebido (qualquer tipo).
 * @returns {string} Nome limpo, de até 32 caracteres, ou vazio quando não sobra nada.
 */
export function sanitizeDisplayName(raw) {
  if (typeof raw !== "string") return "";
  const clean = raw.replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, MAX_NAME).join("").trim();
}

/**
 * `routeId` encurtado para quando não há nome.
 * @param {string} id `routeId` do par.
 * @returns {string} Começo e fim do id, ou o id inteiro se for curto.
 */
export function shortRouteId(id) {
  const s = String(id || "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-SUFFIX_LEN)}` : s;
}

/**
 * Rótulo para a lista de admissão: nome limpo mais o fim do `routeId`; sem nome, o `routeId` curto.
 * O texto sai em claro: quem renderiza precisa escapar.
 * @param {string} id `routeId` do par.
 * @param {unknown} name Nome anunciado, não confiável.
 * @returns {string} Rótulo de exibição.
 */
export function fairplayPeerLabel(id, name) {
  const clean = sanitizeDisplayName(name);
  if (!clean) return shortRouteId(id);
  return `${clean} (…${String(id || "").slice(-SUFFIX_LEN)})`;
}
