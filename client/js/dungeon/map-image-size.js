/**
 * @file Leitura do tamanho de uma imagem de mapa direto dos bytes (PNG, JPEG, WebP, GIF), ajuste à faixa do
 * `FloorDoc` mantendo a proporção e checagem do teto de envio, tudo puro e sem decodificar a imagem.
 * @module dungeon/map-image-size
 */
import { MAX_SYNC_BLOB_BYTES } from "./vtt-sync-codec.js";

/** Menor e maior lado aceitos pelo `FloorDoc` (`widthPx`/`heightPx`). */
const MIN_SIDE = 256;
const MAX_SIDE = 8192;
const MIB = 1024 * 1024;

const be16 = (b, i) => (b[i] << 8) | b[i + 1];
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b, i) => b[i] | (b[i + 1] << 8);
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

function readPng(b) {
  if (b.length < 24 || be32(b, 0) !== 0x89504e47 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: be32(b, 16), height: be32(b, 20) };
}

function readGif(b) {
  if (b.length < 10 || ascii(b, 0, 4) !== "GIF8") return null;
  return { width: le16(b, 6), height: le16(b, 8) };
}

/** Marcadores SOFn que carregam o tamanho (exclui DHT `C4`, JPG `C8` e DAC `CC`). */
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function readJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (isSof(marker)) return { width: be16(b, i + 7), height: be16(b, i + 5) };
    i += 2 + be16(b, i + 2);
  }
  return null;
}

function readWebp(b) {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const kind = ascii(b, 12, 4);
  if (kind === "VP8X") return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
  if (kind === "VP8 ") return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
  if (kind === "VP8L" && b[20] === 0x2f) {
    return {
      width: 1 + (b[21] | ((b[22] & 0x3f) << 8)),
      height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)),
    };
  }
  return null;
}

/**
 * Lê largura e altura da imagem pelos bytes do cabeçalho.
 * @param {Uint8Array} bytes Arquivo da imagem.
 * @returns {{ width: number, height: number } | null} Tamanho real, ou `null` se o formato for desconhecido.
 */
export function readImageSize(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  const size = readPng(bytes) || readJpeg(bytes) || readWebp(bytes) || readGif(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/**
 * Ajusta o tamanho à faixa do `FloorDoc` (256..8192 por lado) mantendo a proporção.
 * @param {number} width Largura real em pixels.
 * @param {number} height Altura real em pixels.
 * @param {number} [max=8192] Maior lado permitido.
 * @returns {{ widthPx: number, heightPx: number }} Tamanho para guardar no piso.
 */
export function fitMapSize(width, height, max = MAX_SIDE) {
  let scale = 1;
  const small = Math.min(width, height);
  if (small < MIN_SIDE) scale = MIN_SIDE / small;
  if (Math.max(width, height) * scale > max) scale = max / Math.max(width, height);
  return { widthPx: Math.max(1, Math.round(width * scale)), heightPx: Math.max(1, Math.round(height * scale)) };
}

/**
 * Decide se a imagem pode ser importada e com que tamanho. Formato desconhecido segue sem tamanho (vale o padrão).
 * @param {Uint8Array} bytes Arquivo da imagem.
 * @returns {{ ok: true, widthPx?: number, heightPx?: number } | { ok: false, reason: string }} Resultado.
 */
export function checkMapUpload(bytes) {
  if (bytes.length > MAX_SYNC_BLOB_BYTES) {
    return { ok: false, reason: `Imagem grande demais: os jogadores não conseguiriam receber (limite de ${MAX_SYNC_BLOB_BYTES / MIB} MiB).` };
  }
  const size = readImageSize(bytes);
  return size ? { ok: true, ...fitMapSize(size.width, size.height) } : { ok: true };
}

/**
 * Texto de aviso depois de salvar o mapa.
 * @param {{ sha256: string, deduplicated: boolean }} saved Resultado do `putBlob`.
 * @returns {string} Aviso para a tela.
 */
export function mapNoticeFor(saved) {
  const short = `${saved.sha256.slice(0, 10)}…`;
  return saved.deduplicated
    ? `Mapa reutilizado sem duplicar disco (SHA-256 ${short}).`
    : `Mapa salvo localmente (SHA-256 ${short}).`;
}
