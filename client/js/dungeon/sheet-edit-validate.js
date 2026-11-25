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

function armorClassIssue(raw) {
  if (String(raw ?? "").trim() === "") return { field: "armorClass", message: "CA: o campo está em branco; informe um número inteiro entre 1 e 40." };
  return rangeIssue("armorClass", "CA", Number(raw), EDIT_LIMITS.armorClass);
}

function abilityIssues(patch) {
  return Object.entries(ABILITY_NAMES)
    .filter(([key]) => patch[key] !== undefined)
    .map(([key, label]) => rangeIssue(key, label, Number(patch[key]), EDIT_LIMITS.ability));
}

function speedIssue(raw, pack) {
  const max = pack.formulas.speed?.maxFt ?? 200;
  if (String(raw).trim() === "") return { field: "speedFt", message: `Deslocamento: o campo está em branco; informe os pés (0 a ${max}).` };
  return rangeIssue("speedFt", "Deslocamento", Number(raw), { min: 0, max });
}

function listIssues(patch, { pack, trainedSkills = [] }) {
  const abilityIds = pack.abilities.map((a) => a.id);
  const skillLabel = (id) => pack.skills.find((s) => s.id === id)?.label || id;
  const badSaves = (patch.proficientSaves || []).filter((id) => !abilityIds.includes(id));
  const untrained = (patch.expertSkills || []).filter((id) => !trainedSkills.includes(id));
  return [
    ...badSaves.map((id) => ({ field: "saveProf", message: `Salvaguarda: "${id}" não existe neste sistema.` })),
    ...untrained.map((id) => ({ field: "expertSkill", message: `Especialização em ${skillLabel(id)}: só vale em perícia treinada; treine a perícia primeiro.` })),
  ];
}

/** Campos que só existem com o pacote de sistema da ficha (Deslocamento, salvaguardas, especialização). */
function systemIssues(patch, ctx) {
  if (!ctx.pack) return [];
  const speed = patch.speedFt === undefined ? [] : [speedIssue(patch.speedFt, ctx.pack)];
  return [...speed, ...listIssues(patch, ctx)];
}

/**
 * Confere os campos do painel Editar e explica cada problema em português.
 * @param {object} patch Campos do formulário (`name`, `armor_class`, `system`, `str`…`cha`, `speedFt`, `proficientSaves`, `expertSkills`).
 * @param {{pack?: object, trainedSkills?: string[]}} [ctx] Pacote da ficha e perícias treinadas, para validar Deslocamento, salvaguardas e especialização.
 * @returns {{ok: boolean, issues: Array<{field: string, message: string}>}} `ok` só sem avisos.
 */
export function validateSheetEdit(patch = {}, ctx = {}) {
  const issues = [];
  if (!String(patch.name ?? "").trim()) issues.push({ field: "sheetName", message: "Nome: a ficha precisa de um nome." });
  issues.push(armorClassIssue(patch.armor_class));
  issues.push(...abilityIssues(patch));
  if (patch.system && !getSystemPack(patch.system)) issues.push({ field: "sheetSystem", message: `Sistema: "${patch.system}" não está instalado; escolha um da lista.` });
  issues.push(...systemIssues(patch, ctx));
  const found = issues.filter(Boolean);
  return { ok: found.length === 0, issues: found };
}
