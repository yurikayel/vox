/**
 * @file Validação explicativa do painel Editar da ficha: em vez de ajustar valores em silêncio, diz o que está
 * fora do limite e por quê. Puro; quem chama decide se grava (`ok`) ou mostra os avisos.
 *
 * @module dungeon/sheet-edit-validate
 */
import { getSystemPack } from "./system-pack.js";

/** Limites do painel Editar (iguais aos aplicados ao gravar). */
export const EDIT_LIMITS = Object.freeze({ armorClass: Object.freeze({ min: 1, max: 40 }), ability: Object.freeze({ min: 1, max: 30 }) });

const ABILITY_NAMES = { str: "Força", dex: "Destreza", con: "Constituição", int: "Inteligência", wis: "Sabedoria", cha: "Carisma" };

function rangeIssue(field, label, value, { min, max }) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return { field, message: `${label}: use um número inteiro entre ${min} e ${max}.` };
  if (value < min || value > max) return { field, message: `${label}: ${value} está fora do intervalo ${min}–${max}; o sistema aceita só valores nesse intervalo.` };
  return null;
}

function abilityIssues(patch) {
  return Object.entries(ABILITY_NAMES)
    .filter(([key]) => patch[key] !== undefined)
    .map(([key, label]) => rangeIssue(key, label, Number(patch[key]), EDIT_LIMITS.ability));
}

/**
 * Confere os campos do painel Editar e explica cada problema em português.
 * @param {object} patch Campos do formulário (`name`, `armor_class`, `system`, `str`…`cha`).
 * @returns {{ok: boolean, issues: Array<{field: string, message: string}>}} `ok` só sem avisos.
 */
export function validateSheetEdit(patch = {}) {
  const issues = [];
  if (!String(patch.name ?? "").trim()) issues.push({ field: "sheetName", message: "Nome: a ficha precisa de um nome." });
  issues.push(rangeIssue("armorClass", "CA", Number(patch.armor_class), EDIT_LIMITS.armorClass));
  issues.push(...abilityIssues(patch));
  if (patch.system && !getSystemPack(patch.system)) issues.push({ field: "sheetSystem", message: `Sistema: "${patch.system}" não está instalado; escolha um da lista.` });
  const found = issues.filter(Boolean);
  return { ok: found.length === 0, issues: found };
}
