/**
 * @file Persistência das escolhas do pacote de sistema na ficha: o que o painel Editar grava (`system`,
 * `system_choices`, Deslocamento) e as marcas dos testes contra a morte. Tudo passa por `SHEET_UPSERT`;
 * derivado nenhum é gravado.
 *
 * @module dungeon/dungeon-persistence-sheet-system
 */
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { markDeathSave, normalizeChoices } from "./system-derive.js";
import { getSystemPack } from "./system-pack.js";
import { validHitDie } from "./system-rest.js";
import { liveTrainedSkills, migrateLegacySheet } from "./system-migrate.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";

/** Lista vinda do formulário só substitui a atual quando o painel a enviou (array); senão fica como estava. */
function listOr(patchList, current) {
  return Array.isArray(patchList) ? patchList : current;
}

/**
 * `system` e `system_choices` a gravar ao salvar a ficha: sistema escolhido (ou o atual), atributos editados,
 * perícias treinadas relidas das ações vivas, salvaguardas treinadas e especialização (só em perícia treinada).
 * Sistema desconhecido é ignorado.
 * @param {object} base Ficha migrada.
 * @param {object} patch Campos do painel Editar (`system`, `proficientSaves`, `expertSkills`, `hitDie`; Dado de Vida inválido é ignorado).
 * @param {object} abilities Atributos já mesclados.
 * @returns {{system: object, system_choices: object}} Campos a mesclar na ficha.
 */
export function systemFieldsForSave(base, patch, abilities) {
  const pack = getSystemPack(patch.system) || getSystemPack(base.system?.id);
  const prev = base.system_choices || {};
  const trained = pack ? liveTrainedSkills(pack, base) : prev.proficientSkills;
  const next = { ...prev, abilities, proficientSkills: trained };
  next.proficientSaves = listOr(patch.proficientSaves, prev.proficientSaves);
  next.expertSkills = listOr(patch.expertSkills, prev.expertSkills);
  const die = validHitDie(patch.hitDie);
  if (die !== null) next.hitDie = die;
  const choices = pack ? { ...next, ...pickNormalized(pack, next) } : next;
  return { system: pack ? { id: pack.id, version: pack.version } : base.system, system_choices: choices };
}

function pickNormalized(pack, choices) {
  const { proficientSaves, expertSkills } = normalizeChoices(pack, choices);
  return { proficientSaves, expertSkills };
}

/**
 * Deslocamento em pés a gravar em `attributes_lww.speed_ft`; sem valor válido mantém o atual.
 * @param {object} attrs Atributos vivos da ficha.
 * @param {unknown} speedFt Valor do formulário.
 * @returns {object} Atributos com `speed_ft` atualizado (limitado a 0..200).
 */
export function withSpeed(attrs, speedFt) {
  if (speedFt === undefined || speedFt === "" || !Number.isFinite(Number(speedFt))) return attrs;
  return { ...attrs, speed_ft: Math.max(0, Math.min(200, Math.trunc(Number(speedFt)))) };
}

/**
 * Registra uma marca de teste contra a morte (sucesso, falha) ou zera, em `system_choices.deathSaves`.
 * @param {object} state Estado da sessão.
 * @param {"success"|"failure"|"reset"} kind Marca.
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<object|undefined>} Campanha atualizada (nada se não há ficha ou pacote).
 */
export async function markSheetDeathSave(state, kind, opts = {}) {
  if (!state.sheet) return undefined;
  const base = migrateLegacySheet(ensureSheetMeta(state.sheet));
  const pack = getSystemPack(base.system?.id);
  if (!pack) return undefined;
  const deathSaves = markDeathSave(pack, base.system_choices?.deathSaves, kind);
  const updated = ensureSheetMeta({ ...base, system_choices: { ...base.system_choices, deathSaves } });
  return dispatchCampaignOp(state, "SHEET_UPSERT", { sheet: updated, setActive: true }, { store: opts.store || getDefaultVttStore() });
}
