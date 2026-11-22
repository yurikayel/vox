#!/usr/bin/env node
/**
 * @file PM-23 — Validador e exportador offline de atas assinadas de assembleia do Vox.
 * Alinhado a `docs/specs/modo-assembleia-v0.md`: valida pauta, lista de presença assinada,
 * votos com prazo e `blockReason`, deduplica participantes/votos de forma determinística,
 * apura `decisionStatus`, calcula `minutesHash` (SHA-256) e exporta ata em Markdown ou JSON.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Versão canônica do esquema da ata exportada (PM-23). */
export const SCHEMA_VERSION = "1.0.0";

const VALID_CHOICES = new Set(["yes", "no", "abstain", "block"]);
const VALID_FORMATS = new Set(["md", "json"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_BLOCK_REASON_LEN = 280;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireText(raw, fieldName) {
  if (typeof raw !== "string" || !raw.trim()) throw new TypeError(`${fieldName} deve ser string não vazia.`);
  return raw.trim();
}

function requireKey(raw, fieldName) {
  const clean = requireText(raw, fieldName);
  if (FORBIDDEN_KEYS.has(clean)) throw new RangeError(`${fieldName} contém chave reservada proibida: ${clean}.`);
  return clean;
}

function parseTimestampMs(raw, fieldName) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) throw new RangeError(`${fieldName} deve ser timestamp numérico finito >= 0.`);
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  throw new TypeError(`${fieldName} deve ser timestamp em ms ou string ISO válida.`);
}

function sha256Hex(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!isPlainObject(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    if (!FORBIDDEN_KEYS.has(key)) sorted[key] = canonicalizeValue(value[key]);
  }
  return sorted;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalizeValue(value));
}

function validateAgendaItem(raw, index, seenIds) {
  if (!isPlainObject(raw)) throw new TypeError(`agenda[${index}] deve ser um objeto.`);
  const id = requireKey(raw.id, `agenda[${index}].id`);
  if (seenIds.has(id)) throw new RangeError(`agenda[${index}].id duplicado: ${id}.`);
  seenIds.add(id);
  const title = requireText(raw.title, `agenda[${index}].title`);
  const proposalId = raw.proposalId === undefined ? id : requireText(raw.proposalId, `agenda[${index}].proposalId`);
  return { id, title, proposalId };
}

function validateAttendanceEntry(raw, index) {
  if (!isPlainObject(raw)) throw new TypeError(`attendance[${index}] deve ser um objeto.`);
  const pubkey = requireKey(raw.pubkey, `attendance[${index}].pubkey`);
  if (raw.displayName !== undefined && typeof raw.displayName !== "string") {
    throw new TypeError(`attendance[${index}].displayName deve ser string quando informado.`);
  }
  const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
  return { pubkey, displayName, signedAt: parseTimestampMs(raw.signedAt, `attendance[${index}].signedAt`), sig: requireText(raw.sig, `attendance[${index}].sig`) };
}

function deduplicateByLatest(items, keyFn) {
  const byKey = new Map();
  let duplicatesRemoved = 0;
  for (const item of items) {
    const key = keyFn(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    duplicatesRemoved += 1;
    if (item.signedAt >= existing.signedAt) byKey.set(key, item);
  }
  return { items: [...byKey.values()], duplicatesRemoved };
}

function validateBlockReason(rawReason, choice, index) {
  if (choice !== "block") return "";
  if (typeof rawReason !== "string" || !rawReason.trim()) {
    throw new RangeError(`votes[${index}].blockReason é obrigatório quando choice === 'block'.`);
  }
  const trimmed = rawReason.trim();
  if (trimmed.length > MAX_BLOCK_REASON_LEN) throw new RangeError(`votes[${index}].blockReason excede ${MAX_BLOCK_REASON_LEN} caracteres.`);
  return trimmed;
}

function validateVote(raw, index, agendaIds) {
  if (!isPlainObject(raw)) throw new TypeError(`votes[${index}] deve ser um objeto.`);
  const agendaId = requireKey(raw.agendaId, `votes[${index}].agendaId`);
  if (!agendaIds.has(agendaId)) throw new RangeError(`votes[${index}].agendaId desconhecido: ${agendaId}.`);
  const voterPubkey = requireKey(raw.voterPubkey, `votes[${index}].voterPubkey`);
  if (typeof raw.choice !== "string" || !VALID_CHOICES.has(raw.choice)) {
    throw new RangeError(`votes[${index}].choice inválido: ${String(raw.choice)}.`);
  }
  return {
    agendaId,
    voterPubkey,
    choice: raw.choice,
    blockReason: validateBlockReason(raw.blockReason, raw.choice, index),
    signedAt: parseTimestampMs(raw.signedAt, `votes[${index}].signedAt`),
    sig: requireText(raw.sig, `votes[${index}].sig`),
  };
}

function validateAssemblyHeader(bundle) {
  const convenedAt = parseTimestampMs(bundle.convenedAt, "convenedAt");
  const closedAt = parseTimestampMs(bundle.closedAt, "closedAt");
  if (closedAt < convenedAt) throw new RangeError("closedAt não pode ser anterior a convenedAt.");
  if (!Number.isInteger(bundle.quorumMin) || bundle.quorumMin < 0) throw new RangeError("quorumMin deve ser inteiro >= 0.");
  return {
    assemblyId: requireText(bundle.assemblyId, "assemblyId"),
    communityId: requireText(bundle.communityId, "communityId"),
    title: requireText(bundle.title, "title"),
    convenedAt,
    closedAt,
    quorumMin: bundle.quorumMin,
  };
}

/**
 * Valida o bundle da assembleia, verifica presença estrutural de `sig` e `blockReason`,
 * e deduplica presença por `pubkey` e votos por `(agendaId, voterPubkey)` mantendo o registro
 * com maior `signedAt` (em empate, prevalece o último na entrada).
 * @param {object} bundle Bundle JSON da assembleia no formato do Modo Assembleia v0.
 * @returns {{ assemblyId: string, communityId: string, title: string, convenedAt: number, closedAt: number, quorumMin: number, agenda: Array<{id: string, title: string, proposalId: string}>, attendance: Array<{pubkey: string, displayName: string, signedAt: number, sig: string}>, votes: Array<{agendaId: string, voterPubkey: string, choice: string, blockReason: string, signedAt: number, sig: string}>, duplicateAttendanceRemoved: number, duplicateVotesRemoved: number }} Bundle validado e deduplicado.
 */
export function validateAssemblyBundle(bundle) {
  if (!isPlainObject(bundle)) throw new TypeError("Bundle de assembleia deve ser um objeto JSON.");
  const header = validateAssemblyHeader(bundle);
  if (!Array.isArray(bundle.agenda) || bundle.agenda.length === 0) throw new TypeError("Campo obrigatório 'agenda' deve ser um array não vazio.");
  if (!Array.isArray(bundle.attendance)) throw new TypeError("Campo obrigatório 'attendance' deve ser um array.");
  if (!Array.isArray(bundle.votes)) throw new TypeError("Campo obrigatório 'votes' deve ser um array.");
  const agendaIds = new Set();
  const agenda = bundle.agenda.map((item, idx) => validateAgendaItem(item, idx, agendaIds));
  const dedupAtt = deduplicateByLatest(bundle.attendance.map(validateAttendanceEntry), (entry) => entry.pubkey);
  const dedupVotes = deduplicateByLatest(bundle.votes.map((vote, idx) => validateVote(vote, idx, agendaIds)), (v) => `${v.agendaId}\u0000${v.voterPubkey}`);
  return {
    ...header,
    agenda,
    attendance: dedupAtt.items.sort((a, b) => a.pubkey.localeCompare(b.pubkey)),
    votes: dedupVotes.items.sort((a, b) => a.agendaId.localeCompare(b.agendaId) || a.voterPubkey.localeCompare(b.voterPubkey)),
    duplicateAttendanceRemoved: dedupAtt.duplicatesRemoved,
    duplicateVotesRemoved: dedupVotes.duplicatesRemoved,
  };
}

function resolveAgendaStatus(quorumMet, counts) {
  if (!quorumMet) return "no_quorum";
  if (counts.block > 0) return "blocked";
  if (counts.yes > counts.no) return "approved";
  return "rejected";
}

function resolveOverallStatus(quorumMet, agendaTallies) {
  if (!quorumMet) return "no_quorum";
  if (agendaTallies.some((item) => item.decisionStatus === "blocked")) return "blocked";
  if (agendaTallies.every((item) => item.decisionStatus === "approved")) return "approved";
  return "rejected";
}

function tallyAgendaItem(item, itemVotes, quorumMet) {
  const counts = { yes: 0, no: 0, abstain: 0, block: 0, total: 0 };
  const blockReasons = [];
  for (const vote of itemVotes) {
    counts[vote.choice] += 1;
    counts.total += 1;
    if (vote.choice === "block") {
      blockReasons.push({ voterPubkey: vote.voterPubkey, reason: vote.blockReason, signedAt: vote.signedAt });
    }
  }
  blockReasons.sort((a, b) => a.signedAt - b.signedAt || a.voterPubkey.localeCompare(b.voterPubkey));
  return {
    id: item.id,
    title: item.title,
    proposalId: item.proposalId,
    counts,
    blockReasons,
    decisionStatus: resolveAgendaStatus(quorumMet, counts),
  };
}

function buildAttendanceRecords(attendance) {
  return attendance.map((entry) => ({
    pubkey: entry.pubkey, displayName: entry.displayName || null, signedAt: entry.signedAt, sigHash: sha256Hex(entry.sig),
  }));
}

function collectAllBlockReasons(agendaTallies) {
  return agendaTallies.flatMap((item) => item.blockReasons.map((br) => ({ agendaId: item.id, ...br })));
}

function buildVoteSigHashes(votes) {
  return votes.map((v) => ({ agendaId: v.agendaId, voterPubkey: v.voterPubkey, signedAt: v.signedAt, sigHash: sha256Hex(v.sig) }));
}

function buildMinutesCore(clean, agendaTallies) {
  const attendanceCount = clean.attendance.length;
  const quorumMet = attendanceCount >= clean.quorumMin;
  return {
    schemaVersion: SCHEMA_VERSION,
    assemblyId: clean.assemblyId,
    communityId: clean.communityId,
    title: clean.title,
    convenedAt: clean.convenedAt,
    closedAt: clean.closedAt,
    quorumMin: clean.quorumMin,
    attendanceCount,
    quorumMet,
    decisionStatus: resolveOverallStatus(quorumMet, agendaTallies),
    agenda: agendaTallies,
    blockReasons: collectAllBlockReasons(agendaTallies),
    attendance: buildAttendanceRecords(clean.attendance),
    voteSigHashes: buildVoteSigHashes(clean.votes),
    duplicateAttendanceRemoved: clean.duplicateAttendanceRemoved,
    duplicateVotesRemoved: clean.duplicateVotesRemoved,
    signatureVerification: { scope: "structural_presence_only", cryptographicVerified: false, attendanceSigCount: attendanceCount, voteSigCount: clean.votes.length },
  };
}

/**
 * Apura quórum, contagem por pauta, motivos de bloqueio, `decisionStatus` determinístico
 * (`approved` / `blocked` / `rejected` / `no_quorum`) e `minutesHash` SHA-256 canônico.
 * @param {object} bundle Bundle bruto ou validado de assembleia do Vox.
 * @returns {{ schemaVersion: string, assemblyId: string, communityId: string, title: string, convenedAt: number, closedAt: number, quorumMin: number, attendanceCount: number, quorumMet: boolean, decisionStatus: string, agenda: Array<object>, blockReasons: Array<object>, attendance: Array<object>, duplicateAttendanceRemoved: number, duplicateVotesRemoved: number, signatureVerification: object, minutesHash: string }} Resultado apurado da assembleia.
 */
export function tallyAssembly(bundle) {
  const clean = validateAssemblyBundle(bundle);
  const quorumMet = clean.attendance.length >= clean.quorumMin;
  const votesByAgenda = new Map(clean.agenda.map((item) => [item.id, []]));
  for (const vote of clean.votes) votesByAgenda.get(vote.agendaId).push(vote);
  const agendaTallies = clean.agenda.map((item) => tallyAgendaItem(item, votesByAgenda.get(item.id), quorumMet));
  const core = buildMinutesCore(clean, agendaTallies);
  return { ...core, minutesHash: sha256Hex(canonicalJson(core)) };
}

function formatUtc(ms) {
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function renderAttendanceSection(attendance) {
  if (attendance.length === 0) return "_Nenhuma assinatura de presença registrada._";
  const rows = attendance.map((entry) => {
    const label = entry.displayName ? `${entry.displayName} (\`${entry.pubkey}\`)` : `\`${entry.pubkey}\``;
    return `| ${label} | ${formatUtc(entry.signedAt)} | \`${entry.sigHash.slice(0, 16)}…\` |`;
  });
  return ["| Participante | Assinado em | Hash SHA-256 da assinatura |", "|---|---|---|", ...rows].join("\n");
}

function renderAgendaItemSection(item, index) {
  const c = item.counts;
  const lines = [
    `### ${index + 1}. ${item.title} (\`${item.id}\`)`,
    "",
    `- **Proposta:** \`${item.proposalId}\` · **Status da decisão (\`decisionStatus\`):** \`${item.decisionStatus}\``,
    `- **Votos:** Sim: **${c.yes}** · Não: **${c.no}** · Abstenção: **${c.abstain}** · Bloqueio: **${c.block}** (Total: ${c.total})`,
  ];
  if (item.blockReasons.length > 0) {
    lines.push("- **Motivos de bloqueio (`blockReason`):**");
    for (const br of item.blockReasons) {
      lines.push(`  - \`${br.voterPubkey}\` (${formatUtc(br.signedAt)}): ${br.reason}`);
    }
  }
  return lines.join("\n");
}

function renderMinutesHeader(tally) {
  return [
    `# Ata de Assembleia — ${tally.title}`,
    "",
    `- **Assembleia (\`assemblyId\`):** \`${tally.assemblyId}\` · **Comunidade:** \`${tally.communityId}\``,
    `- **Convocação:** ${formatUtc(tally.convenedAt)} · **Encerramento:** ${formatUtc(tally.closedAt)}`,
    `- **Presença / Quórum:** ${tally.attendanceCount} / ${tally.quorumMin} (**${tally.quorumMet ? "Quórum atingido" : "Sem quórum"}**)`,
    `- **Resultado geral (\`decisionStatus\`):** \`${tally.decisionStatus}\``,
    `- **Hash canônico da ata (\`minutesHash\` SHA-256):** \`${tally.minutesHash}\``,
  ].join("\n");
}

function renderVerificationScope() {
  return [
    "## Escopo de verificação de assinaturas",
    "",
    "- **Verificação estrutural offline (`structural_presence_only`):** este validador verifica presença obrigatória de `sig`, `pubkey`/`voterPubkey`, `blockReason` em bloqueios e deduplica pelo último `signedAt`.",
    "- **Verificação criptográfica completa:** assinaturas Ed25519 contra chaves da comunidade devem ser conferidas pelo cliente/verificador (`verifyPayload`).",
  ].join("\n");
}

/**
 * Renderiza a ata de assembleia apurada em Markdown auditável para exportação e arquivamento offline.
 * @param {ReturnType<typeof tallyAssembly>} tally Resultado retornado por `tallyAssembly`.
 * @returns {string} Ata em Markdown com quórum, lista de presença, deliberações e `minutesHash`.
 */
export function renderAssemblyMinutesMarkdown(tally) {
  if (!isPlainObject(tally) || !Array.isArray(tally.agenda) || !Array.isArray(tally.attendance)) {
    throw new TypeError("Resultado de apuração inválido para renderização Markdown.");
  }
  const sigInfo = tally.signatureVerification || {};
  return [
    renderMinutesHeader(tally), "",
    renderVerificationScope(), "",
    "## Lista de presença assinada", "", renderAttendanceSection(tally.attendance), "",
    "## Pauta e deliberações", "", tally.agenda.map(renderAgendaItemSection).join("\n\n"), "",
    "## Registro de auditoria", "",
    `- **Duplicatas removidas:** ${tally.duplicateAttendanceRemoved} presença(s), ${tally.duplicateVotesRemoved} voto(s).`,
    `- **Assinaturas indexadas:** ${sigInfo.attendanceSigCount ?? tally.attendance.length} presença(s), ${sigInfo.voteSigCount ?? 0} voto(s).`,
    "",
  ].join("\n");
}

function readNextArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`Falta valor para ${flag}.`);
  return value;
}

function parseFormat(raw) {
  const fmt = String(raw || "").trim().toLowerCase();
  if (!VALID_FORMATS.has(fmt)) throw new Error(`Formato inválido '${raw}'. Use 'md' ou 'json'.`);
  return fmt;
}

function parseCliArgs(argv) {
  const opts = { input: "", format: "md", out: "", help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--input" || arg === "-i") opts.input = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--input=")) opts.input = arg.slice(8);
    else if (arg === "--format" || arg === "-f") opts.format = parseFormat(readNextArg(argv, i++, arg));
    else if (arg.startsWith("--format=")) opts.format = parseFormat(arg.slice(9));
    else if (arg === "--out" || arg === "--output" || arg === "-o") opts.out = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--out=")) opts.out = arg.slice(6);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return opts;
}

function readJsonFile(filePath) {
  let rawText;
  try { rawText = fs.readFileSync(path.resolve(filePath), "utf8"); } catch (err) {
    throw new Error(`Não foi possível ler "${filePath}": ${err.message}`);
  }
  try { return JSON.parse(rawText.replace(/^\uFEFF/, "")); } catch (err) {
    throw new Error(`JSON inválido em "${filePath}": ${err.message}`);
  }
}

/**
 * Executa o fluxo CLI de validação, apuração e exportação de ata de assembleia em Markdown ou JSON.
 * @param {string[]} [argv] Argumentos de linha de comando (sem `node` e caminho do script).
 * @returns {{ tally: ReturnType<typeof tallyAssembly>|null, output: string, format: string, outputPath: string|null }} Resultado da execução.
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    console.log("Uso: node scripts/assembly-minutes.mjs --input <assembly.json> [--format md|json] [--out <file>]");
    return { tally: null, output: "", format: opts.format, outputPath: null };
  }
  if (!opts.input) {
    throw new Error("Parâmetro obrigatório ausente: --input <assembly.json>.");
  }
  const bundle = readJsonFile(opts.input);
  const tally = tallyAssembly(bundle);
  const output = opts.format === "json" ? `${JSON.stringify(tally, null, 2)}\n` : renderAssemblyMinutesMarkdown(tally);
  const outputPath = opts.out ? path.resolve(opts.out) : null;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  return { tally, output, format: opts.format, outputPath };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isMainModule()) {
  try {
    runCli();
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
