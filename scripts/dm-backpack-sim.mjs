#!/usr/bin/env node
/**
 * @file PM-79 — Simulador offline de cota, rate-limit e purga por recibo da mochila DM cega.
 * Modela o repasse cego entre aparelhos sem inspecionar remetente/destinatário em claro.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MS_PER_DAY = 86_400_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Limites canônicos da mochila de DMs cegas (PM-79, docs/specs/mochila-dm-v0.md). */
export const BACKPACK_LIMITS = Object.freeze({
  standardCap: 50,
  guardianCap: 200,
  maxBytes: 4096,
  ttlMs: 7 * MS_PER_DAY,
  maxCopies: 3,
  maxPerPeerPerDay: 20,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSafeId(raw) {
  if (typeof raw !== "string") return null;
  const clean = raw.trim();
  if (!clean || FORBIDDEN_KEYS.has(clean)) return null;
  return clean;
}

function assertValidState(state) {
  if (!isPlainObject(state) || !(state.envelopes instanceof Map) || !(state.purgedIds instanceof Set)) {
    throw new TypeError("Estado de mochila inválido.");
  }
  if (!(state.peerDailyCounts instanceof Map) || !isPlainObject(state.stats)) {
    throw new TypeError("Estado de mochila incompleto.");
  }
}

function validateNowMs(nowMs) {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("nowMs deve ser um número finito >= 0.");
  }
  return nowMs;
}

function parseTimestampField(raw) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function resolveEnvelopeBytes(envelope) {
  if (envelope.bytes !== undefined) {
    return typeof envelope.bytes === "number" && Number.isFinite(envelope.bytes) && envelope.bytes >= 0
      ? envelope.bytes
      : null;
  }
  if (typeof envelope.ct === "string") return Buffer.byteLength(envelope.ct, "utf8");
  if (typeof envelope.payload === "string") return Buffer.byteLength(envelope.payload, "utf8");
  return null;
}

function resolveEnvelopeCopies(raw) {
  if (raw === undefined) return 0;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

function resolveEnvelopeTs(envelope, nowMs) {
  const raw = envelope.ts !== undefined ? envelope.ts : envelope.createdAt;
  if (raw === undefined) return nowMs;
  return parseTimestampField(raw);
}

function pruneExpired(state, nowMs) {
  let removed = 0;
  for (const [id, entry] of state.envelopes) {
    if (nowMs - entry.ts > BACKPACK_LIMITS.ttlMs) {
      state.envelopes.delete(id);
      state.stats.expired += 1;
      removed += 1;
    }
  }
  return removed;
}

function rejectEnvelope(state, reason) {
  state.stats.rejected += 1;
  state.stats.rejectedByReason[reason] = (state.stats.rejectedByReason[reason] || 0) + 1;
  return { accepted: false, reason };
}

function parseBlindEnvelope(envelope, nowMs) {
  if (!isPlainObject(envelope)) return { error: "invalid_envelope" };
  const id = normalizeSafeId(envelope.id);
  if (!id) return { error: "invalid_envelope" };
  const carrierPeerId = normalizeSafeId(envelope.carrierPeerId);
  if (!carrierPeerId) return { error: "invalid_peer" };
  const bytes = resolveEnvelopeBytes(envelope);
  const copies = resolveEnvelopeCopies(envelope.copies);
  const ts = resolveEnvelopeTs(envelope, nowMs);
  if (bytes === null || copies === null || ts === null) return { error: "invalid_envelope" };
  return { id, carrierPeerId, bytes, copies, ts };
}

function checkAdmissionPolicy(state, parsed, nowMs, peerDayKey) {
  if (state.purgedIds.has(parsed.id)) return "already_purged";
  if (state.envelopes.has(parsed.id)) return "duplicate";
  if (parsed.bytes > BACKPACK_LIMITS.maxBytes) return "oversize";
  if (parsed.copies >= BACKPACK_LIMITS.maxCopies) return "max_copies";
  if (nowMs - parsed.ts > BACKPACK_LIMITS.ttlMs) return "expired";
  const peerCount = state.peerDailyCounts.get(peerDayKey) ?? 0;
  if (peerCount >= BACKPACK_LIMITS.maxPerPeerPerDay) return "peer_daily_limit";
  return null;
}

function evictOldestIfAtCap(state) {
  const cap = state.guardian ? BACKPACK_LIMITS.guardianCap : BACKPACK_LIMITS.standardCap;
  while (state.envelopes.size >= cap) {
    const oldestKey = state.envelopes.keys().next().value;
    state.envelopes.delete(oldestKey);
    state.stats.evicted += 1;
  }
}

/**
 * Inicializa o estado determinístico em memória de um aparelho carregador da mochila DM.
 * @param {{ guardian?: boolean }} [opts] Opções de configuração (`guardian` amplia cota para 200).
 * @returns {{ guardian: boolean, capacity: number, envelopes: Map, purgedIds: Set, peerDailyCounts: Map, stats: object }} Estado inicial da mochila.
 */
export function createBackpackState(opts = {}) {
  if (opts !== undefined && !isPlainObject(opts)) {
    throw new TypeError("Opções da mochila devem ser um objeto.");
  }
  const guardian = Boolean(opts?.guardian);
  return {
    guardian,
    capacity: guardian ? BACKPACK_LIMITS.guardianCap : BACKPACK_LIMITS.standardCap,
    envelopes: new Map(),
    purgedIds: new Set(),
    peerDailyCounts: new Map(),
    stats: {
      admitted: 0,
      rejected: 0,
      evicted: 0,
      expired: 0,
      purged: 0,
      rejectedByReason: {},
    },
  };
}

/**
 * Valida e tenta admitir um envelope cego na mochila sem ler remetente ou destinatário.
 * Poda envelopes expirados antes de checar cota e remove o mais antigo se estiver cheia.
 * @param {ReturnType<typeof createBackpackState>} state Estado atual da mochila.
 * @param {object} envelope Envelope cego (`id`, `carrierPeerId`, `bytes`, `copies`, `ts`).
 * @param {number} [nowMs=Date.now()] Timestamp atual em milissegundos.
 * @returns {{ accepted: boolean, reason?: string }} Resultado da admissão.
 */
export function admitEnvelope(state, envelope, nowMs = Date.now()) {
  assertValidState(state);
  const currentMs = validateNowMs(nowMs);
  pruneExpired(state, currentMs);

  const parsed = parseBlindEnvelope(envelope, currentMs);
  if (parsed.error) return rejectEnvelope(state, parsed.error);

  const dayBucket = Math.floor(currentMs / MS_PER_DAY);
  const peerDayKey = JSON.stringify([dayBucket, parsed.carrierPeerId]);
  const rejectionReason = checkAdmissionPolicy(state, parsed, currentMs, peerDayKey);
  if (rejectionReason) return rejectEnvelope(state, rejectionReason);

  evictOldestIfAtCap(state);
  state.envelopes.set(parsed.id, {
    id: parsed.id,
    carrierPeerId: parsed.carrierPeerId,
    bytes: parsed.bytes,
    copies: parsed.copies,
    ts: parsed.ts,
    admittedAt: currentMs,
  });
  state.peerDailyCounts.set(peerDayKey, (state.peerDailyCounts.get(peerDayKey) ?? 0) + 1);
  state.stats.admitted += 1;
  return { accepted: true };
}

/**
 * Registra recibo de entrega (`envelopeId`) e purga imediatamente qualquer cópia carregada.
 * Impede readmissão futura do mesmo `envelopeId`.
 * @param {ReturnType<typeof createBackpackState>} state Estado atual da mochila.
 * @param {{ envelopeId?: string, id?: string }} receipt Recibo referenciando `envelopeId`.
 * @returns {{ envelopeId: string, removed: boolean }} Resultado da purga.
 */
export function applyDeliveryReceipt(state, receipt) {
  assertValidState(state);
  if (!isPlainObject(receipt)) {
    throw new TypeError("Recibo deve ser um objeto com 'envelopeId'.");
  }
  const envelopeId = normalizeSafeId(receipt.envelopeId ?? receipt.id);
  if (!envelopeId) {
    throw new TypeError("receipt.envelopeId deve ser uma string não vazia válida.");
  }
  state.purgedIds.add(envelopeId);
  const removed = state.envelopes.delete(envelopeId);
  if (removed) state.stats.purged += 1;
  return { envelopeId, removed };
}

function parseOptionalNow(raw) {
  if (raw === undefined) return undefined;
  return validateNowMs(raw);
}

function resolveEventNow(event, defaultNow) {
  const raw = event.nowMs ?? event.at ?? defaultNow ?? 0;
  return validateNowMs(raw);
}

function replaySingleEvent(state, event, index, defaultNow) {
  if (!isPlainObject(event)) {
    throw new TypeError(`events[${index}] deve ser um objeto.`);
  }
  if (event.type === "admit") {
    const envelope = isPlainObject(event.envelope) ? event.envelope : event;
    admitEnvelope(state, envelope, resolveEventNow(event, defaultNow));
    return;
  }
  if (event.type === "receipt") {
    applyDeliveryReceipt(state, event);
    return;
  }
  if (event.type === "prune") {
    pruneExpired(state, resolveEventNow(event, defaultNow));
    return;
  }
  throw new TypeError(`Tipo de evento desconhecido em events[${index}]: ${String(event.type)}`);
}

function sumCarriedBytes(envelopes) {
  let total = 0;
  for (const entry of envelopes.values()) {
    total += entry.bytes;
  }
  return total;
}

/**
 * Reproduz uma lista cronológica de eventos (`admit`, `receipt`, `prune`) na mochila DM.
 * @param {Array<object>} events Lista ordenada de eventos de simulação.
 * @param {{ guardian?: boolean, nowMs?: number, now?: number }} [opts] Opções de simulação.
 * @returns {{ carriedCount: number, capacity: number, purgedCount: number, rejectedByReason: Record<string, number>, totalBytes: number }} Resumo determinístico final.
 */
export function simulateBackpackEvents(events, opts = {}) {
  if (!Array.isArray(events)) {
    throw new TypeError("events deve ser um array cronológico.");
  }
  if (opts !== undefined && !isPlainObject(opts)) {
    throw new TypeError("opts deve ser um objeto.");
  }
  const defaultNow = parseOptionalNow(opts?.nowMs ?? opts?.now);
  const state = createBackpackState({ guardian: Boolean(opts?.guardian) });
  events.forEach((event, index) => replaySingleEvent(state, event, index, defaultNow));
  if (defaultNow !== undefined) {
    pruneExpired(state, defaultNow);
  }
  return {
    carriedCount: state.envelopes.size,
    capacity: state.capacity,
    purgedCount: state.stats.purged,
    rejectedByReason: { ...state.stats.rejectedByReason },
    totalBytes: sumCarriedBytes(state.envelopes),
  };
}

function readNextArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Falta valor para ${flag}.`);
  }
  return value;
}

function parseNowFlag(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Valor inválido para --now: "${raw}".`);
  }
  return num;
}

function parseCliArgs(argv) {
  const opts = { input: "", guardian: false, now: undefined, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--guardian" || arg === "-g") opts.guardian = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--input" || arg === "-i") opts.input = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--input=")) opts.input = arg.slice(8);
    else if (arg === "--now") opts.now = parseNowFlag(readNextArg(argv, i++, arg));
    else if (arg.startsWith("--now=")) opts.now = parseNowFlag(arg.slice(6));
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return opts;
}

function readJsonFile(filePath) {
  let rawText;
  try {
    rawText = fs.readFileSync(path.resolve(filePath), "utf8");
  } catch (err) {
    throw new Error(`Não foi possível ler "${filePath}": ${err.message}`);
  }
  try {
    return JSON.parse(rawText.replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`JSON inválido em "${filePath}": ${err.message}`);
  }
}

function extractInputPayload(rawData, cliOpts) {
  if (Array.isArray(rawData)) {
    return { events: rawData, guardian: cliOpts.guardian, now: cliOpts.now };
  }
  if (isPlainObject(rawData) && Array.isArray(rawData.events)) {
    return {
      events: rawData.events,
      guardian: cliOpts.guardian || Boolean(rawData.guardian),
      now: cliOpts.now !== undefined ? cliOpts.now : rawData.now,
    };
  }
  throw new TypeError("Arquivo de entrada deve conter um array de eventos ou objeto `{ events: [...] }`.");
}

function formatTextSummary(summary) {
  const reasons = Object.entries(summary.rejectedByReason);
  const rejectedText = reasons.length ? reasons.map(([k, v]) => `${k}=${v}`).join(", ") : "nenhuma";
  return [
    "Simulador Mochila DM Cega (PM-79)",
    `Carregados: ${summary.carriedCount}/${summary.capacity}`,
    `Bytes totais: ${summary.totalBytes}`,
    `Purgados por recibo: ${summary.purgedCount}`,
    `Rejeitados: ${rejectedText}`,
    "",
  ].join("\n");
}

/**
 * Executa a interface CLI do simulador PM-79 de mochila DM cega.
 * @param {string[]} [argv] Argumentos da linha de comando (sem `node` e caminho do script).
 * @returns {{ summary: ReturnType<typeof simulateBackpackEvents>|null, output: string, json: boolean }} Resultado da execução.
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    const usage = "Uso: node scripts/dm-backpack-sim.mjs --input <events.json> [--guardian] [--now <ms>] [--json]\n";
    process.stdout.write(usage);
    return { summary: null, output: usage, json: opts.json };
  }
  if (!opts.input) {
    throw new Error("Parâmetro obrigatório ausente: --input <events.json>.");
  }
  const payload = extractInputPayload(readJsonFile(opts.input), opts);
  const summary = simulateBackpackEvents(payload.events, { guardian: payload.guardian, now: payload.now });
  const output = opts.json ? `${JSON.stringify(summary, null, 2)}\n` : formatTextSummary(summary);
  process.stdout.write(output);
  return { summary, output, json: opts.json };
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
