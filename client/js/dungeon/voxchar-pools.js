/**
 * @file Máximos de PV e reservas no `.voxchar` (docs/specs/voxchar-v0.md §10, SUB-18). Só `hp_max` e `<id>_max` dos
 * recursos que o pacote declara viajam; atual, `delta_ledger`, ouro e espaços de magia ficam de fora. O arquivo é
 * entrada não confiável: lista branca de chaves, inteiros de 0 a `RESERVE_CAP`, chave de outro pacote é descartada.
 *
 * @module dungeon/voxchar-pools
 * @see docs/specs/voxchar-v0.md
 */
import { RESERVE_CAP, reserveIds } from "./sheet-reserves.js";

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Chaves de `pools_base` que o pacote permite no arquivo, com o rótulo para as mensagens.
 * @param {object} pack Pacote de sistema.
 * @returns {{key: string, label: string}[]} `hp_max` (se o pacote tem PV) e um `<id>_max` por reserva.
 */
export function poolKeys(pack) {
  const resources = pack?.resources || [];
  const hp = resources.some((r) => r.id === "hp") ? [{ key: "hp_max", label: "PV máximo" }] : [];
  const reserves = reserveIds(pack).map((id) => ({ key: `${id}_max`, label: `${resources.find((r) => r.id === id)?.label || id} máximo` }));
  return [...hp, ...reserves];
}

/**
 * Problemas dos máximos do arquivo: formato do campo e cada valor presente (inteiro de 0 a `RESERVE_CAP`).
 * Chave que o pacote não declara não é problema (é descartada depois).
 * @param {unknown} pools Campo `sheet.pools_base` do arquivo (opcional).
 * @param {object} pack Pacote de sistema.
 * @returns {string[]} Motivos da recusa, com o campo.
 */
export function poolsIssues(pools, pack) {
  if (pools === undefined) return [];
  if (!isPlain(pools)) return ["Máximos de PV e reservas: formato inválido (esperado um objeto)."];
  return poolKeys(pack).flatMap(({ key, label }) => {
    const value = Object.hasOwn(pools, key) ? pools[key] : undefined;
    if (value === undefined) return [];
    const ok = typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= RESERVE_CAP;
    return ok ? [] : [`${label}: ${String(JSON.stringify(value)).slice(0, 40)} está fora do intervalo 0–${RESERVE_CAP}.`];
  });
}

/**
 * Parte portátil dos máximos: só as chaves do pacote, inteiros de 1 a `RESERVE_CAP` (0 ou ausente não é gravado).
 * @param {object|null|undefined} pools `pools_base` da ficha ou do arquivo.
 * @param {object} pack Pacote de sistema.
 * @returns {Object<string, number>} Objeto novo, possivelmente vazio.
 */
export function portablePools(pools, pack) {
  const out = {};
  for (const { key } of poolKeys(pack)) {
    const n = Math.trunc(Number(isPlain(pools) && Object.hasOwn(pools, key) ? pools[key] : 0));
    if (Number.isFinite(n) && n > 0) out[key] = Math.min(n, RESERVE_CAP);
  }
  return out;
}

/**
 * Aviso de importação (D3): sistema com reservas e arquivo sem máximos de reserva.
 * @param {object} doc Documento validado.
 * @param {object} pack Pacote de sistema.
 * @returns {string} Texto curto, ou vazio quando não há o que avisar.
 */
export function missingPoolsNotice(doc, pack) {
  const reserves = reserveIds(pack);
  if (reserves.length === 0) return "";
  if (reserves.some((id) => portablePools(doc?.sheet?.pools_base, pack)[`${id}_max`])) return "";
  return "O arquivo não traz os máximos de PV e reservas deste sistema; defina-os na ficha.";
}
