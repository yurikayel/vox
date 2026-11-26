/**
 * @file Ficha portátil `.voxchar` (docs/specs/voxchar-v0.md): exporta a ficha-base ativa e importa um arquivo como
 * ficha nova. Só a lista branca de campos vai e volta; identidade, dono, campanha, PV atual, condições e notas do
 * Mestre ficam de fora. Carregado sob demanda (`import()`), fora do precache.
 *
 * @module dungeon/voxchar
 */
import { createCharacterSheetDoc } from "../rpg-sheet-and-lore.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { checkVoxchar, VOXCHAR_FORMAT } from "./voxchar-check.js";
import { normalizeChoices } from "./system-derive.js";
import { validHitDie } from "./system-rest.js";
import { migrateLegacySheet } from "./system-migrate.js";
import { getSystemPack } from "./system-pack.js";
import { normalizeInventoryOrset } from "./vtt-inventory.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";
import { missingPoolsNotice, portablePools } from "./voxchar-pools.js";

const ENC = new TextEncoder();
const text = (v, max) => String(v ?? "").trim().slice(0, max);
const strings = (list, max) => (Array.isArray(list) ? list.filter((s) => typeof s === "string").slice(0, 100).map((s) => text(s, max)) : []);

/** Atributos da lista branca (sem condições, que são estado de jogo). */
function portableAttrs(attrs = {}, pack) {
  const choices = normalizeChoices(pack, { level: attrs.level, abilities: attrs.abilities });
  const maxSpeed = pack.formulas.speed?.maxFt ?? 200;
  return {
    name: text(attrs.name, 60) || "Aventureiro",
    ancestry: text(attrs.ancestry, 60),
    class_name: text(attrs.class_name, 60),
    level: choices.level,
    armor_class: Math.min(40, Math.max(1, Math.trunc(Number(attrs.armor_class)) || 10)),
    speed_ft: Math.min(maxSpeed, Math.max(0, Math.trunc(Number(attrs.speed_ft ?? 30)) || 0)),
    abilities: choices.abilities,
  };
}

/** Escolhas do pacote da lista branca; estado de jogo (mortes, condições, Exaustão, dados gastos) fica de fora. */
function portableChoices(raw = {}, pack) {
  const c = normalizeChoices(pack, raw);
  const die = validHitDie(raw.hitDie);
  const out = { level: c.level, abilities: c.abilities, proficientSkills: c.proficientSkills, expertSkills: c.expertSkills, proficientSaves: c.proficientSaves, speedFt: c.speedFt };
  return die === null ? out : { ...out, hitDie: die };
}

function portableMeta(meta = {}) {
  const base = ensureSheetMeta({
    schema_version: "1.0.0",
    sheet_meta: { clickable_actions: meta.clickable_actions, skill_refs: strings(meta.skill_refs, 60), proficiency_bonus: meta.proficiency_bonus, notes_public: text(meta.notes_public, 20000) },
  }).sheet_meta;
  return {
    clickable_actions: base.clickable_actions,
    skill_refs: base.skill_refs,
    proficiency_bonus: base.proficiency_bonus,
    notes_public: base.notes_public,
    level_milestones: strings(meta.level_milestones, 200),
  };
}

/**
 * Parte portátil de uma ficha: só a lista branca, em objetos novos.
 * @param {object} sheet Ficha (documento CRDT) com `system_choices`.
 * @param {object} pack Pacote de sistema da ficha.
 * @returns {object} Campo `sheet` do arquivo `.voxchar`.
 */
export function portableSheet(sheet, pack) {
  return {
    attributes_lww: portableAttrs(sheet.attributes_lww, pack),
    system_choices: portableChoices(sheet.system_choices, pack),
    inventory_orset: normalizeInventoryOrset(sheet.inventory_orset),
    sheet_meta: portableMeta(sheet.sheet_meta),
    pools_base: portablePools(sheet.pools_base, pack),
  };
}

/**
 * Monta o arquivo `.voxchar` da ficha ativa, pronto para download.
 * @param {object} sheet Ficha ativa.
 * @returns {{filename: string, bytes: Uint8Array, mime: string}|null} Artefato, ou `null` sem ficha ou sem pacote.
 */
export function exportVoxchar(sheet) {
  if (!sheet) return null;
  const base = migrateLegacySheet(ensureSheetMeta(sheet));
  const pack = getSystemPack(base.system?.id);
  if (!pack) return null;
  const doc = { kind: "voxchar", format: VOXCHAR_FORMAT, system: { id: pack.id, version: pack.version }, exportedAt: new Date().toISOString(), sheet: portableSheet(base, pack) };
  const safe = text(base.attributes_lww?.name, 40).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "ficha";
  return { filename: `${safe}.voxchar`, bytes: ENC.encode(JSON.stringify(doc, null, 2)), mime: "application/json;charset=utf-8" };
}

/**
 * Ficha nova vazia desta instalação: id novo, campanha e dono da sessão, tudo o mais nos padrões.
 * @param {object} state Estado da sessão.
 * @returns {object} Documento de ficha novo (`createCharacterSheetDoc`).
 */
export function freshSheet(state) {
  return createCharacterSheetDoc({
    character_id: `char_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    campaign_id: state.campaignId || undefined,
    owner_pubkey_p256: state.sheet?.owner_pubkey_p256,
  });
}

/**
 * Ficha nova a partir de um documento `.voxchar` já validado: id, campanha e dono vêm desta instalação; estado de jogo nos padrões.
 * @param {object} state Estado da sessão.
 * @param {object} doc Documento validado por `checkVoxchar`.
 * @param {object} pack Pacote de sistema do documento.
 * @returns {object} Ficha pronta para `SHEET_UPSERT`.
 */
export function buildImportedSheet(state, doc, pack) {
  const part = portableSheet(doc.sheet, pack);
  const fresh = freshSheet(state);
  return ensureSheetMeta({
    ...fresh,
    attributes_lww: { ...fresh.attributes_lww, ...part.attributes_lww },
    system: { id: pack.id, version: pack.version },
    system_choices: part.system_choices,
    inventory_orset: part.inventory_orset,
    sheet_meta: part.sheet_meta,
    pools_base: { ...fresh.pools_base, ...part.pools_base },
  });
}

/**
 * Importa um `.voxchar` como ficha nova (nunca sobrescreve uma existente). Arquivo inválido não grava nada.
 * @param {object} state Estado da sessão.
 * @param {{bytes: Uint8Array}} file Conteúdo do arquivo lido.
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<{ok: boolean, issues?: string[]}>} Resultado; em recusa, os motivos em português.
 */
export async function importVoxchar(state, file, opts = {}) {
  const checked = checkVoxchar(file?.bytes);
  if (!checked.ok) return checked;
  const sheet = buildImportedSheet(state, checked.doc, checked.pack);
  await dispatchCampaignOp(state, "SHEET_UPSERT", { sheet, setActive: true }, { store: opts.store || getDefaultVttStore() });
  const warn = missingPoolsNotice(checked.doc, checked.pack);
  state.campaignNotice = `Ficha "${sheet.attributes_lww.name}" importada do arquivo .voxchar.${warn ? ` ${warn}` : ""}`;
  return { ok: true };
}
