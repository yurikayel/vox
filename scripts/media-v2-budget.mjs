#!/usr/bin/env node
/**
 * @file PM-70 / PM-71 / PM-77 — Validador de orçamento de Mídia v2 em duas camadas
 * (Half 360p / Full 720p), planejamento de pedaços de transporte (< 100 KB) e carrossel homogêneo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_KINDS = new Set(["photo", "audio", "video"]);
const MIME_BY_KIND = Object.freeze({
  photo: new Set(["image/avif", "image/webp"]),
  audio: new Set(["audio/opus", "audio/mp4"]),
  video: new Set(["video/mp4"]),
});
const ALLOWED_MIMES = Object.freeze(["image/avif", "image/webp", "audio/opus", "audio/mp4", "video/mp4"]);
const SLOW_3G_KBPS = 750;
const SLOW_3G_BITS_PER_SEC = SLOW_3G_KBPS * 1000;

/** Limites canônicos de Mídia v2 (PM-70 / PM-71 / PM-77, ADR-029). */
export const MEDIA_V2_LIMITS = Object.freeze({
  chunkMaxBytes: 96 * 1024,
  maxCarouselItems: 4,
  maxAudioSec: 60,
  maxVideoSec: 10,
  maxVideoFps: 30,
  maxCarouselAudioSec: 240,
  maxCarouselVideoSec: 40,
  slow3gKbps: SLOW_3G_KBPS,
  allowedMimes: ALLOWED_MIMES,
  layers: Object.freeze({
    half: Object.freeze({ maxHeight: 360 }),
    full: Object.freeze({ maxHeight: 720 }),
  }),
});

/**
 * Diz se o valor é um objeto simples (não nulo e não array).
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Diz se o valor é um número finito maior que zero.
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Normaliza um tipo MIME (sem parâmetros, em minúsculas).
 * @param {unknown} raw Valor bruto.
 * @returns {string}
 */
function normalizeMime(raw) {
  if (typeof raw !== "string") return "";
  return raw.split(";")[0].trim().toLowerCase();
}

/**
 * Calcula plano determinístico de pedaços de transporte (< 100 KB) e estimativa em Slow 3G (750 kbps).
 * @param {number} totalBytes Tamanho total em bytes do item ou carrossel (`>= 0`, inteiro).
 * @param {number} [chunkMaxBytes=MEDIA_V2_LIMITS.chunkMaxBytes] Tamanho máximo de cada pedaço em bytes.
 * @returns {{ totalBytes: number, chunkMaxBytes: number, chunkCount: number, chunkSizes: number[], slow3gKbps: number, estimatedSlow3gSec: number }} Plano de transporte.
 */
export function planTransportChunks(totalBytes, chunkMaxBytes = MEDIA_V2_LIMITS.chunkMaxBytes) {
  if (!Number.isInteger(totalBytes) || totalBytes < 0) {
    throw new RangeError("totalBytes deve ser inteiro finito >= 0.");
  }
  if (!Number.isInteger(chunkMaxBytes) || chunkMaxBytes <= 0) {
    throw new RangeError("chunkMaxBytes deve ser inteiro finito > 0.");
  }
  if (totalBytes === 0) {
    return { totalBytes: 0, chunkMaxBytes, chunkCount: 0, chunkSizes: [], slow3gKbps: SLOW_3G_KBPS, estimatedSlow3gSec: 0 };
  }
  const chunkCount = Math.ceil(totalBytes / chunkMaxBytes);
  const remainder = totalBytes % chunkMaxBytes;
  const lastSize = remainder === 0 ? chunkMaxBytes : remainder;
  const chunkSizes = Array.from({ length: chunkCount }, (_, i) => (i === chunkCount - 1 ? lastSize : chunkMaxBytes));
  const estimatedSlow3gSec = Math.round(((totalBytes * 8) / SLOW_3G_BITS_PER_SEC) * 1000) / 1000;
  return { totalBytes, chunkMaxBytes, chunkCount, chunkSizes, slow3gKbps: SLOW_3G_KBPS, estimatedSlow3gSec };
}

/**
 * Valida os campos comuns a todo item de mídia (tipo, camada, MIME, bytes).
 * @param {object} item Item de mídia.
 * @param {string[]} errors Lista de erros (é alterada).
 */
function validateCommonFields(item, errors) {
  const hasKind = typeof item.kind === "string" && VALID_KINDS.has(item.kind);
  if (!hasKind) errors.push(`kind inválido: ${String(item.kind)} (use photo, audio ou video).`);
  const hasLayer = typeof item.layer === "string" && Object.hasOwn(MEDIA_V2_LIMITS.layers, item.layer);
  if (!hasLayer) errors.push(`layer inválido: ${String(item.layer)} (use half ou full).`);
  const validBytes = Number.isInteger(item.bytes) && item.bytes > 0;
  if (!validBytes) errors.push("bytes deve ser inteiro positivo (> 0).");
  const mime = normalizeMime(item.mime);
  if (!ALLOWED_MIMES.includes(mime)) {
    errors.push(`mime não permitido: ${String(item.mime)}.`);
  } else if (hasKind && !MIME_BY_KIND[item.kind].has(mime)) {
    errors.push(`mime ${mime} incompatível com kind ${item.kind}.`);
  }
  return { hasKind, hasLayer, chunkCount: validBytes ? planTransportChunks(item.bytes).chunkCount : 0 };
}

/**
 * Valida largura e altura contra o limite da camada.
 * @param {object} item Item de mídia.
 * @param {boolean} hasLayer Se a camada informada é válida.
 * @param {string[]} errors Lista de erros (é alterada).
 */
function validateVisualDimensions(item, hasLayer, errors) {
  if (!isPositiveNumber(item.width)) errors.push("width deve ser número positivo.");
  if (!isPositiveNumber(item.height)) {
    errors.push("height deve ser número positivo.");
    return;
  }
  if (hasLayer) {
    const maxHeight = MEDIA_V2_LIMITS.layers[item.layer].maxHeight;
    if (item.height > maxHeight) {
      errors.push(`height ${item.height} excede limite da camada ${item.layer} (${maxHeight}px).`);
    }
  }
}

/**
 * Valida os campos de um item de áudio (duração).
 * @param {object} item Item de mídia.
 * @param {string[]} errors Lista de erros (é alterada).
 */
function validateAudioFields(item, errors) {
  if (!isPositiveNumber(item.durationSec)) {
    errors.push("durationSec de áudio deve ser número positivo.");
    return;
  }
  if (item.durationSec > MEDIA_V2_LIMITS.maxAudioSec) {
    errors.push(`durationSec ${item.durationSec}s excede limite de áudio (${MEDIA_V2_LIMITS.maxAudioSec}s).`);
  }
}

/**
 * Valida os campos de um item de vídeo (dimensões e duração).
 * @param {object} item Item de mídia.
 * @param {boolean} hasLayer Se a camada informada é válida.
 * @param {string[]} errors Lista de erros (é alterada).
 */
function validateVideoFields(item, hasLayer, errors) {
  validateVisualDimensions(item, hasLayer, errors);
  if (!isPositiveNumber(item.durationSec)) {
    errors.push("durationSec de vídeo deve ser número positivo.");
  } else if (item.durationSec > MEDIA_V2_LIMITS.maxVideoSec) {
    errors.push(`durationSec ${item.durationSec}s excede limite de vídeo (${MEDIA_V2_LIMITS.maxVideoSec}s).`);
  }
  if (!isPositiveNumber(item.fps)) {
    errors.push("fps de vídeo deve ser número positivo.");
  } else if (item.fps > MEDIA_V2_LIMITS.maxVideoFps) {
    errors.push(`fps ${item.fps} excede limite de vídeo (${MEDIA_V2_LIMITS.maxVideoFps} fps).`);
  }
  if (item.hasKeyframe !== true) {
    errors.push("Vídeo exige quadro-chave inicial (hasKeyframe: true).");
  }
}

/**
 * Valida um descritor individual de mídia na especificação Mídia v2 (Half 360p / Full 720p).
 * @param {object} item Descritor da mídia (`kind`, `layer`, `bytes`, `mime`, dimensões e campos de áudio/vídeo).
 * @returns {{ ok: boolean, errors: string[], chunkCount: number }} Resultado da validação e contagem de pedaços.
 */
export function validateMediaItem(item) {
  if (!isPlainObject(item)) {
    return { ok: false, errors: ["Item de mídia deve ser um objeto."], chunkCount: 0 };
  }
  const errors = [];
  const { hasKind, hasLayer, chunkCount } = validateCommonFields(item, errors);
  if (hasKind && item.kind === "photo") validateVisualDimensions(item, hasLayer, errors);
  if (hasKind && item.kind === "audio") validateAudioFields(item, errors);
  if (hasKind && item.kind === "video") validateVideoFields(item, hasLayer, errors);
  return { ok: errors.length === 0, errors, chunkCount };
}

/**
 * Monta o resultado de um carrossel inválido, só com os erros.
 * @param {string[]} errors Erros encontrados.
 * @returns {object}
 */
function emptyCarouselResult(errors) {
  return {
    ok: false,
    errors,
    kind: null,
    itemCount: 0,
    totalBytes: 0,
    totalDurationSec: 0,
    totalChunkCount: 0,
    transport: planTransportChunks(0),
    items: [],
  };
}

/**
 * Valida a duração total de áudio ou vídeo do carrossel.
 * @param {string} kind Tipo da mídia do carrossel.
 * @param {number} totalDurationSec Duração total, em segundos.
 * @param {string[]} errors Lista de erros (é alterada).
 */
function validateAggregateDuration(kind, totalDurationSec, errors) {
  if (kind === "audio" && totalDurationSec > MEDIA_V2_LIMITS.maxCarouselAudioSec) {
    errors.push(`Duração total de áudio (${totalDurationSec}s) excede limite do carrossel (${MEDIA_V2_LIMITS.maxCarouselAudioSec}s).`);
  }
  if (kind === "video" && totalDurationSec > MEDIA_V2_LIMITS.maxCarouselVideoSec) {
    errors.push(`Duração total de vídeo (${totalDurationSec}s) excede limite do carrossel (${MEDIA_V2_LIMITS.maxCarouselVideoSec}s).`);
  }
}

/**
 * Valida cada item do carrossel e acumula bytes, duração e tipos.
 * @param {object[]} items Itens do carrossel.
 * @param {string[]} errors Lista de erros (é alterada).
 * @returns {object}
 */
function accumulateCarouselItems(items, errors) {
  const kinds = new Set();
  const itemResults = [];
  let totalBytes = 0;
  let totalDurationSec = 0;
  let totalChunkCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const res = validateMediaItem(item);
    itemResults.push(res);
    for (const err of res.errors) errors.push(`items[${i}]: ${err}`);
    if (isPlainObject(item) && typeof item.kind === "string") kinds.add(item.kind);
    if (isPlainObject(item) && Number.isInteger(item.bytes) && item.bytes > 0) totalBytes += item.bytes;
    if (isPlainObject(item) && isPositiveNumber(item.durationSec)) totalDurationSec += item.durationSec;
    totalChunkCount += res.chunkCount;
  }
  return { kinds, itemResults, totalBytes, totalDurationSec, totalChunkCount };
}

/**
 * Valida um carrossel homogêneo (1 a 4 itens do mesmo tipo, tetos agregados de duração e keyframes em vídeo).
 * @param {Array<object>} items Lista de descritores de mídia do carrossel.
 * @returns {{ ok: boolean, errors: string[], kind: string|null, itemCount: number, totalBytes: number, totalDurationSec: number, totalChunkCount: number, transport: ReturnType<typeof planTransportChunks>, items: Array<{ok: boolean, errors: string[], chunkCount: number}> }} Resumo de validação e orçamento.
 */
export function validateCarousel(items) {
  if (!Array.isArray(items)) return emptyCarouselResult(["Carrossel deve ser um array de itens."]);
  const errors = [];
  if (items.length === 0 || items.length > MEDIA_V2_LIMITS.maxCarouselItems) {
    errors.push(`Carrossel deve conter entre 1 e ${MEDIA_V2_LIMITS.maxCarouselItems} itens (recebido ${items.length}).`);
  }
  const acc = accumulateCarouselItems(items, errors);
  if (acc.kinds.size > 1) {
    errors.push(`Carrossel deve ser homogêneo (mesmo kind); encontrados: ${[...acc.kinds].join(", ")}.`);
  }
  const kind = acc.kinds.size === 1 && VALID_KINDS.has([...acc.kinds][0]) ? [...acc.kinds][0] : null;
  validateAggregateDuration(kind, acc.totalDurationSec, errors);
  return {
    ok: errors.length === 0,
    errors,
    kind,
    itemCount: items.length,
    totalBytes: acc.totalBytes,
    totalDurationSec: acc.totalDurationSec,
    totalChunkCount: acc.totalChunkCount,
    transport: planTransportChunks(acc.totalBytes),
    items: acc.itemResults,
  };
}

/**
 * Lê o valor que acompanha uma flag da linha de comando.
 * @param {string[]} argv Argumentos.
 * @param {number} index Posição da flag.
 * @param {string} flag Nome da flag, usado na mensagem de erro.
 * @returns {string}
 */
function readNextArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`Falta valor para ${flag}.`);
  return value;
}

/**
 * Interpreta os argumentos da linha de comando.
 * @param {string[]} argv Argumentos sem `node` e o script.
 * @returns {object}
 */
function parseCliArgs(argv) {
  const opts = { input: "", json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--input" || arg === "-i") {
      opts.input = readNextArg(argv, i, arg);
      i += 1;
    }
    else if (arg.startsWith("--input=")) opts.input = arg.slice(8);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return opts;
}

/**
 * Lê e interpreta um arquivo JSON.
 * @param {string} filePath Caminho do arquivo.
 * @returns {unknown}
 */
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

/**
 * Escolhe o modo (carrossel ou item único) conforme a forma do JSON e valida.
 * @param {unknown} data JSON lido.
 * @returns {{mode: string, result: object}}
 */
function evaluateBundle(data) {
  if (Array.isArray(data)) return { mode: "carousel", result: validateCarousel(data) };
  if (isPlainObject(data) && Array.isArray(data.items)) return { mode: "carousel", result: validateCarousel(data.items) };
  if (isPlainObject(data) && isPlainObject(data.item)) return { mode: "item", result: validateMediaItem(data.item) };
  if (isPlainObject(data)) return { mode: "item", result: validateMediaItem(data) };
  return { mode: "unknown", result: { ok: false, errors: ["Bundle JSON inválido."], chunkCount: 0 } };
}

/**
 * Formata o resultado da validação em texto (`PASS` ou `FAIL`).
 * @param {string} mode Modo da validação.
 * @param {object} result Resultado da validação.
 * @returns {string}
 */
function formatTextReport(mode, result) {
  const status = result.ok ? "PASS" : "FAIL";
  const lines = [`[${status}] Mídia v2 (${mode})`];
  if (mode === "carousel") {
    lines.push(`Itens: ${result.itemCount} · Tipo: ${result.kind ?? "misto/indefinido"} · Bytes: ${result.totalBytes} · Pedaços: ${result.totalChunkCount} · Slow 3G: ${result.transport.estimatedSlow3gSec}s`);
  } else if (typeof result.chunkCount === "number") {
    lines.push(`Pedaços: ${result.chunkCount}`);
  }
  for (const err of result.errors) lines.push(`- ${err}`);
  return `${lines.join("\n")}\n`;
}

/**
 * Escreve o texto na saída padrão.
 * @param {string} text Texto a escrever.
 */
function writeStdout(text) {
  process.stdout.write(text);
}

/**
 * Executa a CLI do validador de orçamento de Mídia v2 (`--input` e `--json`).
 * @param {string[]} [argv=process.argv.slice(2)] Argumentos de linha de comando.
 * @param {(text: string) => void} [write] Escritor da saída (padrão: stdout); injetável para testes.
 * @returns {{ exitCode: number, ok: boolean, mode: string, result: object|null, output: string }} Resultado e saída gerada.
 */
export function runCli(argv = process.argv.slice(2), write = writeStdout) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    const usage = "Uso: node scripts/media-v2-budget.mjs --input <bundle.json> [--json]\n";
    write(usage);
    return { exitCode: 0, ok: true, mode: "help", result: null, output: usage };
  }
  if (!opts.input) throw new Error("Parâmetro obrigatório ausente: --input <bundle.json>.");
  const { mode, result } = evaluateBundle(readJsonFile(opts.input));
  const output = opts.json ? `${JSON.stringify({ mode, ...result }, null, 2)}\n` : formatTextReport(mode, result);
  write(output);
  return { exitCode: result.ok ? 0 : 1, ok: result.ok, mode, result, output };
}

/**
 * Diz se este arquivo foi chamado direto pelo Node (e não importado).
 * @returns {boolean}
 */
function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isMainModule()) {
  try {
    process.exitCode = runCli().exitCode;
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
