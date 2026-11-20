/**
 * @file Evolução de nível guiada (E4): marcos imutáveis e ajuste de PV/slots.
 * @module dungeon/vtt-levelup
 */
import { appendPoolDeltaOp } from "../rpg-sheet-and-lore.js";
import { ensureSheetMeta } from "./vtt-schema.js";

const PRESET_TABLE = Object.freeze({
  libre: { hpGain: 5, slots: {}, profStep: 0 },
  d20_fantasy: { hpGain: 8, slots: { l1: 1 }, profStep: 1 },
  investigacao: { hpGain: 3, slots: {}, profStep: 0 },
});

function abilityMod(score) {
  return Math.floor((Math.trunc(Number(score) || 10) - 10) / 2);
}

/**
 * Bônus de proficiência por nível (d20 simplificado).
 * @param {number} level Nível.
 * @returns {number}
 */
export function proficiencyForLevel(level) {
  return 2 + Math.floor(Math.max(1, level) / 4);
}

/**
 * Monta plano de subida de nível sem aplicar.
 * @param {object} sheet Ficha CRDT.
 * @param {number} targetLevel Nível alvo.
 * @param {string} [preset="libre"] Preset de campanha.
 * @returns {{ ok: boolean, error?: string, plan?: object }}
 */
export function buildLevelUpPlan(sheet, targetLevel, preset = "libre") {
  const normalized = ensureSheetMeta(sheet);
  const current = Math.max(1, Math.trunc(Number(normalized.attributes_lww?.level) || 1));
  const target = Math.trunc(Number(targetLevel));
  if (target <= current) return { ok: false, error: "O nível alvo deve ser maior que o atual." };
  if (target - current > 1) return { ok: false, error: "Suba um nível por vez no assistente." };
  const table = PRESET_TABLE[preset] || PRESET_TABLE.libre;
  const conMod = abilityMod(normalized.attributes_lww?.abilities?.con);
  const hpGain = table.hpGain + (preset === "d20_fantasy" ? conMod : 0);
  return {
    ok: true,
    plan: {
      fromLevel: current,
      toLevel: target,
      hpGain: Math.max(1, hpGain),
      slotsDelta: { ...table.slots },
      proficiencyBonus: proficiencyForLevel(target),
      preset,
      milestoneId: `lvl-${target}-${crypto.randomUUID().slice(0, 8)}`,
    },
  };
}

function pushMilestone(meta, plan, opMeta) {
  const milestones = Array.isArray(meta.level_milestones) ? [...meta.level_milestones] : [];
  if (!milestones.some((m) => m.level === plan.toLevel)) {
    milestones.push({ id: plan.milestoneId, level: plan.toLevel, ts: Number(opMeta.ts) || Date.now(), preset: plan.preset });
  }
  return milestones;
}

function withHpGain(sheet, plan, opMeta) {
  const next = {
    ...sheet,
    ...appendPoolDeltaOp(sheet, {
      op_id: opMeta.op_id_hp || `hp-${plan.milestoneId}`,
      lamport_clock: opMeta.lamport_clock || 1,
      actor_pubkey: opMeta.actor_pubkey || "",
      target_pool: "hp_current",
      delta: plan.hpGain,
      reason: `Nível ${plan.toLevel}`,
    }),
  };
  const hpMax = Math.max(1, Number(next.pools_base?.hp_max) || 20) + plan.hpGain;
  return { ...next, pools_base: { ...next.pools_base, hp_max: hpMax } };
}

function withSlotGain(sheet, plan) {
  const slots = sheet.pools_base?.spell_slots_max || {};
  const nextSlots = { ...slots };
  for (const [k, v] of Object.entries(plan.slotsDelta || {})) {
    nextSlots[k] = Math.max(0, (Number(nextSlots[k]) || 0) + Math.trunc(Number(v) || 0));
  }
  return { ...sheet, pools_base: { ...sheet.pools_base, spell_slots_max: nextSlots } };
}

/**
 * Aplica o plano na ficha (marco + ledger + nível).
 * @param {object} sheet Ficha.
 * @param {object} plan Plano de `buildLevelUpPlan`.
 * @param {object} [opMeta] Metadados de operação.
 * @returns {object} Nova ficha.
 */
export function applyLevelUp(sheet, plan, opMeta = {}) {
  if (!plan?.toLevel) return sheet;
  const base = ensureSheetMeta(sheet);
  const milestones = pushMilestone(base.sheet_meta, plan, opMeta);
  let next = {
    ...base,
    attributes_lww: { ...base.attributes_lww, level: plan.toLevel },
    sheet_meta: { ...base.sheet_meta, proficiency_bonus: plan.proficiencyBonus, level_milestones: milestones },
  };
  if (plan.hpGain) next = withHpGain(next, plan, opMeta);
  return withSlotGain(next, plan);
}