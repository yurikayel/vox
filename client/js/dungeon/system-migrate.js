/**
 * @file Migração da ficha legada (a Lyra e qualquer ficha criada antes dos pacotes de sistema) para o pacote
 * `dnd5e-2024`. Só acrescenta: `system` (qual pacote) e `system_choices` (as escolhas do jogador, extraídas dos
 * campos antigos). Os campos legados ficam como estão para as telas atuais; derivado nenhum é gravado.
 *
 * Perícia treinada vem de duas fontes legadas, ambas casadas com o pacote pelo nome (sem acento nem caixa):
 * `sheet_meta.skill_refs` e as ações de tag `pericia` cuja rolagem soma `@prof` (a Lyra guarda assim). Ação de
 * perícia sem `@prof` não é treinada. O que não casa
 * fica em `system_choices.unmappedSkillRefs`, para o jogador decidir, em vez de ser descartado ou adivinhado.
 * Salvaguardas treinadas não existem na ficha legada e não são inventadas: começam vazias.
 *
 * @module dungeon/system-migrate
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4: "a ficha atual (Lyra) migra para o pacote dnd5e-2024")
 */
import { getSystemPack } from "./system-pack.js";
import { normalizeChoices } from "./system-derive.js";

/** Pacote para o qual as fichas legadas migram. @type {string} */
export const LEGACY_SYSTEM_ID = "dnd5e-2024";

function plain(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function mapSkillRefs(pack, refs) {
  const byName = new Map(pack.skills.map((s) => [plain(s.label), s.id]));
  const mapped = [];
  const unmapped = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const id = byName.get(plain(ref));
    if (id) mapped.push(id);
    else if (String(ref).trim()) unmapped.push(String(ref).trim());
  }
  return { mapped: [...new Set(mapped)], unmapped };
}

/** Ações de perícia que somam `@prof`: a fonte viva das perícias treinadas enquanto a ficha é legada. */
function trainedActionLabels(meta) {
  const actions = Array.isArray(meta?.clickable_actions) ? meta.clickable_actions : [];
  return actions.filter((a) => a?.tag === "pericia" && /@prof(?![a-z])/.test(String(a.roll || ""))).map((a) => a.label);
}

/**
 * Perícias treinadas hoje, lidas das fontes vivas da ficha (`skill_refs` e ações de perícia com `@prof`).
 * É a única fonte das perícias treinadas: remover ou acrescentar a ação muda o resultado na hora.
 * @param {object} pack Pacote de sistema.
 * @param {object} sheet Ficha (legada ou migrada).
 * @returns {string[]} Ids de perícia do pacote.
 */
export function liveTrainedSkills(pack, sheet) {
  return mapSkillRefs(pack, [...(sheet?.sheet_meta?.skill_refs || []), ...trainedActionLabels(sheet?.sheet_meta)]).mapped;
}

/**
 * Diz se a ficha já declara um pacote de sistema.
 * @param {object} sheet Ficha (legada ou migrada).
 * @returns {boolean} `true` se `sheet.system.id` existe.
 */
export function hasSystemPack(sheet) {
  return Boolean(sheet && typeof sheet === "object" && sheet.system && typeof sheet.system.id === "string" && sheet.system.id);
}

/**
 * Migra uma ficha legada para o pacote `dnd5e-2024`, sem tocar nos campos antigos. Ficha que já tem pacote volta igual
 * (idempotente); a entrada nunca é alterada.
 * @param {object} sheet Ficha no formato legado (`attributes_lww`, `sheet_meta`).
 * @returns {object} Ficha com `system` e `system_choices`.
 * @throws {Error} Se o pacote de destino não estiver registrado.
 */
export function migrateLegacySheet(sheet) {
  if (!sheet || typeof sheet !== "object" || hasSystemPack(sheet)) return sheet;
  const pack = getSystemPack(LEGACY_SYSTEM_ID);
  if (!pack) throw new Error(`pacote ${LEGACY_SYSTEM_ID} não registrado`);
  const attrs = sheet.attributes_lww || {};
  const { mapped, unmapped } = mapSkillRefs(pack, [...(sheet.sheet_meta?.skill_refs || []), ...trainedActionLabels(sheet.sheet_meta)]);
  const choices = normalizeChoices(pack, { level: attrs.level, abilities: attrs.abilities, proficientSkills: mapped, speedFt: attrs.speed_ft });
  return {
    ...sheet,
    system: { id: pack.id, version: pack.version },
    system_choices: { ...choices, unmappedSkillRefs: unmapped },
  };
}
