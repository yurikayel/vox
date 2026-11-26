/**
 * @file Link só de leitura da ficha `.voxchar` (docs/specs/voxchar-v0.md §9): o mesmo JSON do arquivo, comprimido
 * e posto em base64url no fragmento `#/ficha/ver#voxchar=…`. O fragmento não vai ao servidor. Tudo que chega por
 * link é dado de outra pessoa e passa pelo mesmo `checkVoxchar`. Carregado sob demanda (`import()`), fora do precache.
 *
 * @module dungeon/voxchar-link
 */
import { checkVoxchar, VOXCHAR_MAX_BYTES } from "./voxchar-check.js";
import { exportVoxchar } from "./voxchar.js";

/** Rota de visualização (sem o fragmento). */
export const VOXCHAR_VIEW_ROUTE = "#/ficha/ver";
/** Teto do valor em base64url para GERAR o link (~8 KB, D3). */
export const VOXCHAR_LINK_MAX_GENERATE = 8192;
/** Teto do valor em base64url aceito na ENTRADA, conferido antes de decodificar (~12 KB). */
export const VOXCHAR_LINK_MAX_INPUT = 12288;

const PREFIX = "#voxchar=";
const FORMAT = "deflate-raw";
const B64URL = /^[A-Za-z0-9_-]*$/;

/**
 * Diz se o navegador comprime e descomprime por stream nativo.
 * @returns {boolean} `true` com `CompressionStream` e `DecompressionStream`.
 */
export function linkSupported() {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function streamOf(bytes) {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

async function collect(stream, cap) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Descomprime lendo o stream em pedaços e aborta ao passar do teto, sem ler tudo para depois medir.
 * @param {Uint8Array} bytes Dados comprimidos (deflate-raw).
 * @param {number} cap Máximo de bytes de saída.
 * @returns {Promise<Uint8Array|null>} Bytes, ou `null` se passou do teto.
 */
export function inflateCapped(bytes, cap) {
  return collect(streamOf(bytes).pipeThrough(new DecompressionStream(FORMAT)), cap);
}

/**
 * Monta o link só de leitura da ficha. Não gera sem suporte do navegador nem acima de ~8 KB.
 * @param {object} sheet Ficha ativa.
 * @returns {Promise<{ok: true, href: string, size: number}|{ok: false, reason: string}>} Link ou o motivo da recusa.
 */
export async function buildVoxcharLink(sheet) {
  if (!linkSupported()) return { ok: false, reason: "Este navegador não comprime dados; use o arquivo .voxchar." };
  const artifact = exportVoxchar(sheet);
  if (!artifact) return { ok: false, reason: "Esta ficha não tem pacote de sistema para compartilhar." };
  const packed = await collect(streamOf(artifact.bytes).pipeThrough(new CompressionStream(FORMAT)), VOXCHAR_MAX_BYTES);
  const value = toBase64Url(packed || new Uint8Array(0));
  if (!packed || value.length > VOXCHAR_LINK_MAX_GENERATE) {
    return { ok: false, reason: `A ficha é grande demais para um link (limite ${VOXCHAR_LINK_MAX_GENERATE} caracteres); use o arquivo .voxchar.` };
  }
  return { ok: true, href: `${VOXCHAR_VIEW_ROUTE}${PREFIX}${value}`, size: value.length };
}

/**
 * Extrai o valor de `#voxchar=` de um hash completo.
 * @param {string} hash `location.hash`.
 * @returns {string|null} Valor em base64url, ou `null` se o hash não traz o fragmento.
 */
export function readLinkValue(hash) {
  const at = String(hash ?? "").indexOf(PREFIX);
  return at < 0 ? null : String(hash).slice(at + PREFIX.length);
}

/**
 * Lê um link de ficha: confere o tamanho antes de decodificar, descomprime com teto e valida com `checkVoxchar`.
 * Nada é gravado. Dado de outra pessoa é não confiável.
 * @param {string} hash `location.hash` completo.
 * @returns {Promise<{ok: true, doc: object, pack: object, bytes: Uint8Array}|{ok: false, issues: string[]}>} Resultado.
 */
export async function parseVoxcharLink(hash) {
  const value = readLinkValue(hash);
  const refuse = (msg) => ({ ok: false, issues: [msg] });
  if (value === null) return refuse("O link não traz uma ficha.");
  if (value.length > VOXCHAR_LINK_MAX_INPUT) return refuse("Link grande demais para uma ficha.");
  if (!value || !B64URL.test(value) || value.length % 4 === 1) return refuse("Link de ficha inválido ou truncado.");
  if (!linkSupported()) return refuse("Este navegador não abre links de ficha; peça o arquivo .voxchar.");
  let bytes;
  try { bytes = await inflateCapped(fromBase64Url(value), VOXCHAR_MAX_BYTES); } catch { return refuse("Link de ficha inválido ou truncado."); }
  if (!bytes) return refuse("A ficha do link passa do tamanho permitido.");
  const checked = checkVoxchar(bytes);
  return checked.ok ? { ...checked, bytes } : checked;
}
