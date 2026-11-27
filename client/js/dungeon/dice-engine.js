/**
 * @file Motor de rolagem de dados para a Mesa Soberana (E1): parser tokenizado sem `eval`,
 * modificadores `kh/kl/dh/dl/!`, referências `@atributo` da ficha e sorteio sem viés via WebCrypto.
 * @module dungeon/dice-engine
 */
import { sampleUnbiasedDieFromDigest } from "../rpg-crypto-table.js";
import { abilityModifier as packModifier, proficiencyBonus } from "./system-derive.js";
import { getSystemPack } from "./system-pack.js";

/** Máximo de explosões extras permitidas por termo para evitar laço infinito em `1d1!` ou afins. */
export const MAX_EXPLOSIONS = 20;
/** Máximo de dados por termo `NdX`. */
export const MAX_DICE_PER_TERM = 100;
/** Máximo de faces aceito em um dado. */
export const MAX_DIE_SIDES = 1000;
/** Tamanho máximo de texto aceito numa expressão de rolagem. */
export const MAX_FORMULA_LENGTH = 160;
/** Quantidade máxima de termos somados/subtraídos numa única fórmula. */
export const MAX_TERMS = 20;

/** Mapa de aliases PT-BR / EN de atributos para as chaves de `attributes_lww.abilities`. */
export const ABILITY_ALIASES = Object.freeze({
  for: "str",
  forca: "str",
  str: "str",
  des: "dex",
  destreza: "dex",
  dex: "dex",
  con: "con",
  constituicao: "con",
  int: "int",
  inteligencia: "int",
  sab: "wis",
  sabedoria: "wis",
  wis: "wis",
  car: "cha",
  carisma: "cha",
  cha: "cha",
});

const DICE_TERM_RE = /^(\d{1,3})?d(\d{1,4})(?:(kh|kl|dh|dl)(\d{1,3}))?(!)?$/i;
const REF_TERM_RE = /^@([a-z_][a-z0-9_]*)$/i;
const INT_TERM_RE = /^\d{1,6}$/;
const PREFIX_RE = /^\/(gmroll|gm|blindroll|blind|roll|r)\b\s*/i;

/**
 * Calcula o modificador padrão d20 de um valor de atributo (`floor((score - 10) / 2)`).
 * @param {number} score Valor bruto do atributo (ex.: 16 -> +3).
 * @returns {number} Modificador inteiro.
 */
export function abilityModifier(score) {
  const num = Number(score);
  return Number.isFinite(num) ? Math.floor((num - 10) / 2) : 0;
}

/** Bônus de proficiência: o guardado na ficha, ou o do pacote pelo nível. */
function sheetProficiency(sheet, pack, level) {
  const stored = Number(sheet?.sheet_meta?.proficiency_bonus);
  return Number.isFinite(stored) ? Math.trunc(stored) : proficiencyBonus(pack, level);
}

/**
 * Extrai variáveis numéricas utilizáveis em fórmulas (`@for`, `@des`, `@prof`, `@nivel`, etc.) de uma ficha CRDT.
 * O modificador e o bônus de proficiência seguem o pacote do sistema da ficha (T20: valor − 10 e sem proficiência;
 * GURPS: sem proficiência); ficha sem `system` ou com pacote desconhecido usa a regra da 5e, como a migração.
 * @param {object|null} [sheet] Documento `VoxCRDTCharacterSheet`.
 * @returns {Record<string, number>} Mapa de chaves em minúsculas para valores inteiros.
 */
export function resolveSheetVars(sheet = null) {
  const attrs = sheet?.attributes_lww || {};
  const ab = attrs.abilities || {};
  const level = Math.max(1, Math.trunc(Number(attrs.level) || 1));
  const pack = getSystemPack(sheet?.system?.id) || getSystemPack("5e");
  const prof = sheetProficiency(sheet, pack, level);
  const out = { level, nivel: level, prof, ca: Math.trunc(Number(attrs.armor_class) || 10), ac: Math.trunc(Number(attrs.armor_class) || 10) };
  for (const [alias, key] of Object.entries(ABILITY_ALIASES)) {
    out[alias] = packModifier(pack, ab[key] ?? 10);
  }
  return out;
}

function extractCommandMeta(rawInput) {
  const trimmed = String(rawInput || "").trim();
  let visibility = "public";
  let body = trimmed;
  const match = trimmed.match(PREFIX_RE);
  if (match) {
    const cmd = match[1].toLowerCase();
    if (cmd === "gmroll" || cmd === "gm") visibility = "gm";
    else if (cmd === "blindroll" || cmd === "blind") visibility = "blind";
    body = trimmed.slice(match[0].length).trim();
  }
  const hashIdx = body.indexOf("#");
  const formula = (hashIdx >= 0 ? body.slice(0, hashIdx) : body).trim();
  const label = hashIdx >= 0 ? body.slice(hashIdx + 1).trim().slice(0, 80) : "";
  return { visibility, formula, label };
}

function parseSingleTerm(rawToken, sign) {
  if (INT_TERM_RE.test(rawToken)) return { kind: "const", sign, value: Number.parseInt(rawToken, 10) };
  const refMatch = rawToken.match(REF_TERM_RE);
  if (refMatch) return { kind: "ref", sign, ref: refMatch[1].toLowerCase() };
  const dm = rawToken.match(DICE_TERM_RE);
  if (!dm) throw new Error(`Termo de dado inválido: "${rawToken}".`);
  const count = dm[1] ? Number.parseInt(dm[1], 10) : 1;
  const sides = Number.parseInt(dm[2], 10);
  if (count < 1 || count > MAX_DICE_PER_TERM) throw new Error(`Quantidade de dados fora da faixa (1..${MAX_DICE_PER_TERM}).`);
  if (sides < 2 || sides > MAX_DIE_SIDES) throw new Error(`Faces do dado fora da faixa (2..${MAX_DIE_SIDES}).`);
  const keepMode = dm[3] ? dm[3].toLowerCase() : null;
  const keepCount = dm[4] ? Number.parseInt(dm[4], 10) : null;
  if (keepMode && (keepCount < 1 || keepCount > count)) throw new Error(`Filtro ${keepMode}${keepCount} excede ${count} dado(s).`);
  return { kind: "dice", sign, count, sides, keepMode, keepCount, explode: Boolean(dm[5]) };
}

function splitSignedTokens(formula) {
  const compact = String(formula || "").replace(/\s+/g, "");
  if (!compact) throw new Error("Informe uma fórmula de dados (ex.: 1d20+5).");
  const parts = [];
  let sign = 1;
  let start = 0;
  for (let i = 0; i <= compact.length; i += 1) {
    const ch = compact[i];
    const atBoundary = i === compact.length || ch === "+" || ch === "-";
    if (!atBoundary) continue;
    if (i === 0 && (ch === "+" || ch === "-")) {
      sign = ch === "-" ? -1 : 1;
      start = 1;
      continue;
    }
    const slice = compact.slice(start, i);
    if (!slice) throw new Error("Operador duplicado ou fórmula incompleta.");
    parts.push({ sign, token: slice });
    sign = ch === "-" ? -1 : 1;
    start = i + 1;
  }
  return parts;
}

/**
 * Faz parsing estrito de uma expressão de rolagem (`/roll`, `/gmroll`, `/blindroll`, `2d20kh1+@des`).
 * @param {string} rawInput Comando ou fórmula digitada.
 * @returns {{ visibility: "public"|"gm"|"blind", formula: string, label: string, terms: Array<object> }} AST da rolagem.
 */
export function parseDiceCommand(rawInput) {
  if (String(rawInput || "").length > MAX_FORMULA_LENGTH) {
    throw new Error(`Fórmula excede o limite de ${MAX_FORMULA_LENGTH} caracteres.`);
  }
  const { visibility, formula, label } = extractCommandMeta(rawInput);
  const tokens = splitSignedTokens(formula);
  if (tokens.length > MAX_TERMS) {
    throw new Error(`Fórmula excede o limite de ${MAX_TERMS} termos.`);
  }
  const terms = tokens.map(({ sign, token }) => parseSingleTerm(token, sign));
  return { visibility, formula, label, terms };
}

/**
 * Ajusta o primeiro `1d20` da fórmula para vantagem (`2d20kh1`) ou desvantagem (`2d20kl1`).
 * @param {string} formula Expressão original.
 * @param {"normal"|"advantage"|"disadvantage"} [mode="normal"] Modo de rolagem.
 * @returns {string} Fórmula ajustada.
 */
export function applyRollMode(formula, mode = "normal") {
  const text = String(formula || "").trim();
  if (mode !== "advantage" && mode !== "disadvantage") return text;
  const replacement = mode === "advantage" ? "2d20kh1" : "2d20kl1";
  return text.replace(/\b1?d20\b/i, replacement);
}

function defaultRandomBytes() {
  return crypto.getRandomValues(new Uint8Array(32));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function drawUnbiasedDie(sides, randomBytesFn) {
  const hex = bytesToHex(randomBytesFn());
  return { value: sampleUnbiasedDieFromDigest(hex, sides), digestHex: hex };
}

function markKeptRolls(entries, keepMode, keepCount) {
  if (!keepMode || !keepCount) return entries;
  const indexed = entries.map((e, i) => ({ i, value: e.value }));
  const asc = [...indexed].sort((a, b) => a.value - b.value || a.i - b.i);
  let keptIndices;
  if (keepMode === "kh") keptIndices = new Set(asc.slice(-keepCount).map((x) => x.i));
  else if (keepMode === "kl") keptIndices = new Set(asc.slice(0, keepCount).map((x) => x.i));
  else if (keepMode === "dh") keptIndices = new Set(asc.slice(0, entries.length - keepCount).map((x) => x.i));
  else keptIndices = new Set(asc.slice(keepCount).map((x) => x.i));
  return entries.map((e, i) => ({ ...e, kept: keptIndices.has(i) }));
}

function evaluateDiceTerm(term, randomBytesFn, forcedValue) {
  const raw = [];
  let explosions = 0;
  let lastDigest = "";
  for (let i = 0; i < term.count; i += 1) {
    let draw = forcedValue ? { value: forcedValue, digestHex: "" } : drawUnbiasedDie(term.sides, randomBytesFn);
    lastDigest = draw.digestHex;
    raw.push({ sides: term.sides, value: draw.value, kept: true, exploded: false });
    while (term.explode && draw.value === term.sides && explosions < MAX_EXPLOSIONS) {
      explosions += 1;
      draw = drawUnbiasedDie(term.sides, randomBytesFn);
      lastDigest = draw.digestHex;
      raw.push({ sides: term.sides, value: draw.value, kept: true, exploded: true });
    }
  }
  const dice = markKeptRolls(raw, term.keepMode, term.keepCount);
  const subtotal = dice.filter((d) => d.kept).reduce((sum, d) => sum + d.value, 0);
  return { dice, delta: term.sign * subtotal, lastDigest, explosions };
}

function evaluateTerm(term, vars, randomBytesFn, forcedValue) {
  if (term.kind === "const") return { dice: [], delta: term.sign * term.value, text: `${term.value}`, lastDigest: "" };
  if (term.kind === "ref") {
    const val = Number.isFinite(Number(vars[term.ref])) ? Math.trunc(Number(vars[term.ref])) : 0;
    return { dice: [], delta: term.sign * val, text: `${val}`, lastDigest: "" };
  }
  const rolled = evaluateDiceTerm(term, randomBytesFn, forcedValue);
  const mod = term.keepMode ? `${term.keepMode}${term.keepCount}` : "";
  return { dice: rolled.dice, delta: rolled.delta, text: `${term.count}d${term.sides}${mod}${term.explode ? "!" : ""}`, lastDigest: rolled.lastDigest };
}

function evaluateAllTerms(terms, vars, rng, forcedValue) {
  const rolls = [];
  const pieces = [];
  let total = 0;
  let digestHex = "";
  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
    const res = evaluateTerm(term, vars, rng, term.kind === "dice" ? forcedValue : undefined);
    total += res.delta;
    rolls.push(...res.dice);
    if (res.lastDigest) digestHex = res.lastDigest;
    const prefix = i === 0 ? (term.sign < 0 ? "-" : "") : term.sign < 0 ? " - " : " + ";
    pieces.push(`${prefix}${res.text}`);
  }
  return { rolls, resolvedFormula: pieces.join(""), total, digestHex };
}

function buildRollOutcome(parsed, evaluated) {
  const keptD20 = evaluated.rolls.filter((r) => r.kept && r.sides === 20);
  return {
    ok: true,
    formula: parsed.formula,
    resolvedFormula: evaluated.resolvedFormula,
    visibility: parsed.visibility,
    label: parsed.label,
    rolls: evaluated.rolls,
    total: evaluated.total,
    crits: keptD20.filter((r) => r.value === 20).length,
    fumbles: keptD20.filter((r) => r.value === 1).length,
    digestHex: evaluated.digestHex,
  };
}

/**
 * Diz se a fórmula é de um dado só, público e sem explosão ou escolha (o único caso em que a mesa pode decidir o dado).
 * @param {string} rawInput Comando/fórmula.
 * @param {string} [mode="normal"] Modo de rolagem (vantagem e desvantagem trocam o dado e ficam de fora).
 * @returns {number} Faces do dado, ou `0` quando a fórmula não serve para o Fairplay.
 */
export function singleDieSides(rawInput, mode = "normal") {
  if (mode && mode !== "normal") return 0;
  try {
    const parsed = parseDiceCommand(rawInput);
    const dice = parsed.terms.filter((t) => t.kind === "dice");
    const one = dice.length === 1 && dice[0].count === 1 && !dice[0].explode && !dice[0].keepMode && dice[0].sign > 0;
    return parsed.visibility === "public" && one ? dice[0].sides : 0;
  } catch {
    return 0;
  }
}

/**
 * Avalia e sorteia uma fórmula de dados completa usando WebCrypto sem viés.
 * @param {string} rawInput Comando/fórmula (ex.: `/gmroll 2d20kh1+@des # Furtividade`).
 * @param {object} [opts={}] Opções (`sheet`, `vars`, `mode`, `randomBytesFn`, `fairplayValue` valor do dado decidido pela mesa, só para fórmula de um dado).
 * @returns {object} Resultado `{ ok, formula, resolvedFormula, visibility, label, rolls, total, crits, fumbles, digestHex, error? }`.
 */
export function rollDiceFormula(rawInput, opts = {}) {
  try {
    const base = parseDiceCommand(rawInput);
    const adjusted = opts.mode && opts.mode !== "normal" ? applyRollMode(base.formula, opts.mode) : base.formula;
    const parsed = adjusted === base.formula ? base : { ...parseDiceCommand(adjusted), visibility: base.visibility, label: base.label };
    const vars = { ...resolveSheetVars(opts.sheet), ...(opts.vars || {}) };
    const rng = typeof opts.randomBytesFn === "function" ? opts.randomBytesFn : defaultRandomBytes;
    return buildRollOutcome(parsed, evaluateAllTerms(parsed.terms, vars, rng, Number(opts.fairplayValue) || 0));
  } catch (err) {
    return { ok: false, error: err?.message || "Fórmula de dados inválida." };
  }
}
