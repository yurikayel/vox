/**
 * @file Validação do arquivo `.voxchar` (docs/specs/voxchar-v0.md §4). O arquivo é entrada não confiável: o limite de
 * bytes vale antes do `JSON.parse`, só campos da lista branca são copiados para objetos novos (nunca `__proto__`
 * nem `constructor`), número fora da faixa recusa com o campo e o motivo, e nada aqui toca em HTML.
 *
 * @module dungeon/voxchar-check
 * @see docs/specs/voxchar-v0.md
 */
import { getSystemPack } from "./system-pack.js";
import { poolsIssues } from "./voxchar-pools.js";

/** Tamanho máximo do arquivo em bytes (256 KiB). */
export const VOXCHAR_MAX_BYTES = 256 * 1024;
/** Versão do formato que este código lê e grava. */
export const VOXCHAR_FORMAT = 1;
/** Limites de quantidade e de tamanho do conteúdo. */
export const VOXCHAR_LIMITS = Object.freeze({ items: 200, actions: 50, strings: 100, textLen: 20000, maxDepth: 8, maxNodes: 5000, qty: 9999, weight: 9999 });

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Conta nós e profundidade do JSON lido; para ao passar do orçamento. */
function withinBudget(value, depth = 0, budget = { nodes: 0 }) {
  if (depth > VOXCHAR_LIMITS.maxDepth || ++budget.nodes > VOXCHAR_LIMITS.maxNodes) return false;
  if (value === null || typeof value !== "object") return true;
  return Object.values(value).every((v) => withinBudget(v, depth + 1, budget));
}

function numberIssue(label, value, min, max, { decimal = false } = {}) {
  if (value === undefined) return null;
  const okType = decimal ? Number.isFinite(value) : Number.isInteger(value);
  if (typeof value !== "number" || !okType || value < min || value > max) return `${label}: ${String(JSON.stringify(value)).slice(0, 40)} está fora do intervalo ${min}–${max}.`;
  return null;
}

function headerIssues(doc) {
  if (!isPlain(doc) || doc.kind !== "voxchar") return ["Não é um arquivo .voxchar (campo kind ausente ou diferente)."];
  if (!Number.isInteger(doc.format) || doc.format < 1) return ["Formato do arquivo ausente ou inválido."];
  if (doc.format > VOXCHAR_FORMAT) return [`Este arquivo é do formato ${doc.format}; esta versão do Vox lê até o ${VOXCHAR_FORMAT}. Atualize o Vox.`];
  const pack = getSystemPack(doc.system?.id);
  if (!pack) return [`O sistema "${String(doc.system?.id).slice(0, 40)}" não está instalado neste Vox.`];
  if (!Number.isInteger(doc.system.version) || doc.system.version > pack.version) return [`O arquivo usa o sistema ${pack.id} na versão ${String(doc.system.version).slice(0, 12)}; esta instalação tem a ${pack.version}.`];
  return [];
}

function attributeIssues(attrs, pack) {
  if (!isPlain(attrs)) return ["Ficha sem atributos."];
  const abilities = isPlain(attrs.abilities) ? attrs.abilities : {};
  const maxSpeed = pack.formulas.speed?.maxFt ?? 200;
  return [
    typeof attrs.name === "string" && attrs.name.trim() ? null : "Nome: a ficha precisa de um nome.",
    numberIssue("Nível", attrs.level, 1, 20),
    numberIssue("CA", attrs.armor_class, 1, 40),
    numberIssue("Deslocamento", attrs.speed_ft, 0, maxSpeed),
    ...pack.abilities.map((a) => numberIssue(a.label || a.id, abilities[a.id], 1, 30)),
  ].filter(Boolean);
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function itemIssues([key, it], i) {
  if (!isPlain(it)) return [`Item ${i + 1}: formato inválido.`];
  if (UNSAFE_KEYS.has(key) || UNSAFE_KEYS.has(it.id)) return [`Item ${i + 1}: identificador não permitido.`];
  return [
    numberIssue(`Item ${i + 1}, quantidade`, it.qty, 0, VOXCHAR_LIMITS.qty),
    numberIssue(`Item ${i + 1}, peso`, it.weightLb, 0, VOXCHAR_LIMITS.weight, { decimal: true }),
  ].filter(Boolean);
}

function inventoryIssues(inv) {
  if (inv === undefined) return [];
  if (!isPlain(inv)) return ["Inventário: formato inválido."];
  const items = Object.entries(inv);
  if (items.length > VOXCHAR_LIMITS.items) return [`Inventário: mais de ${VOXCHAR_LIMITS.items} itens.`];
  return items.flatMap(itemIssues);
}

function choicesIssues(choices) {
  if (choices === undefined || isPlain(choices)) return [];
  return ["Escolhas do sistema: formato inválido (esperado um objeto)."];
}

function metaIssues(meta) {
  if (meta === undefined) return [];
  if (!isPlain(meta)) return ["Notas e ações: formato inválido."];
  const lists = { clickable_actions: VOXCHAR_LIMITS.actions, skill_refs: VOXCHAR_LIMITS.strings, level_milestones: VOXCHAR_LIMITS.strings };
  const bad = Object.entries(lists).filter(([k, max]) => meta[k] !== undefined && (!Array.isArray(meta[k]) || meta[k].length > max));
  const longText = typeof meta.notes_public === "string" && meta.notes_public.length > VOXCHAR_LIMITS.textLen ? ["Notas: texto grande demais."] : [];
  return [...bad.map(([k, max]) => `${k}: precisa ser uma lista de até ${max} itens.`), ...longText];
}

function parseBytes(bytes) {
  try {
    return { doc: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { error: "O arquivo não é um JSON válido em UTF-8." };
  }
}

/**
 * Lê os bytes do arquivo e confere tudo antes de devolver o conteúdo. O limite de bytes vale antes do `JSON.parse`.
 * @param {Uint8Array} bytes Conteúdo do arquivo.
 * @returns {{ok: true, doc: object, pack: object}|{ok: false, issues: string[]}} Documento pronto para `portableSheet` ou os motivos da recusa.
 */
export function checkVoxchar(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return { ok: false, issues: ["Arquivo vazio."] };
  if (bytes.length > VOXCHAR_MAX_BYTES) return { ok: false, issues: [`Arquivo grande demais (${bytes.length} bytes; o limite é ${VOXCHAR_MAX_BYTES}).`] };
  const { doc, error } = parseBytes(bytes);
  if (error) return { ok: false, issues: [error] };
  if (!withinBudget(doc)) return { ok: false, issues: ["O arquivo é complexo demais (profundidade ou quantidade de campos acima do limite)."] };
  const head = headerIssues(doc);
  if (head.length) return { ok: false, issues: head };
  const pack = getSystemPack(doc.system.id);
  const sheet = isPlain(doc.sheet) ? doc.sheet : {};
  const issues = [...attributeIssues(sheet.attributes_lww, pack), ...choicesIssues(sheet.system_choices), ...inventoryIssues(sheet.inventory_orset), ...metaIssues(sheet.sheet_meta), ...poolsIssues(sheet.pools_base, pack)];
  return issues.length ? { ok: false, issues } : { ok: true, doc, pack };
}
