/**
 * Vox Media Lo-Fi Engine — Ultraleveza Cívica e Soberana.
 * Limites calibrados: fotos <= 99 KB (1080p), áudios <= 60s (blocos de 15s), vídeos <= 10s (blocos de 2s @ 360p).
 */
import { computeBlobHash, isDataUrl, parseDataUrl } from "./media-blob.js";

export const LOFI_LIMITS = Object.freeze({
  PHOTO_MAX_BYTES: 99 * 1024, // 101.376 bytes cravados (Arweave Free Tier <= 100 KiB)
  PHOTO_MAX_DIMENSION: 1080,
  PHOTO_DEFAULT_QUALITY: 0.50,
  AUDIO_BITRATE: 48000,
  AUDIO_MAX_SECONDS: 60,
  AUDIO_CHUNK_SECONDS: 15,
  VIDEO_BITRATE: 380000, // 380 kbps total (vídeo 340k + áudio 40k)
  VIDEO_MAX_SECONDS: 10,
  VIDEO_CHUNK_SECONDS: 2,
  VIDEO_MAX_WIDTH: 360,
});

export const LOFI_FILTERS = Object.freeze([
  { id: "normal", label: "Padrão", desc: "WebP 1080p ultra-otimizado" },
  { id: "xerox", label: "📰 Xerox", desc: "Zine popular dither preto e branco" },
  { id: "vhs", label: "📼 VHS 90s", desc: "Analógico quente estilo camcorder" },
  { id: "risograph", label: "🎨 Risógrafo", desc: "Duotone cívico de alto contraste" },
]);

export function calculateConstrainedDimensions(srcW, srcH, maxDim = LOFI_LIMITS.PHOTO_MAX_DIMENSION) {
  const w = Number(srcW) || 1;
  const h = Number(srcH) || 1;
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  if (w >= h) {
    return { width: maxDim, height: Math.max(1, Math.round((h * maxDim) / w)) };
  }
  return { width: Math.max(1, Math.round((w * maxDim) / h)), height: maxDim };
}

export function parseAspectRatio(aspect) {
  if (aspect === "16:9") return 16 / 9;
  if (aspect === "9:16") return 9 / 16;
  if (aspect === "4:3") return 4 / 3;
  if (aspect === "3:4") return 3 / 4;
  if (aspect === "1:1") return 1 / 1;
  return null;
}

export function calculateCropAndBounds(srcW, srcH, { aspect = "original", maxLong = 1920, maxShort = 1080 } = {}) {
  const origW = Number(srcW) || 1;
  const origH = Number(srcH) || 1;
  const targetRatio = parseAspectRatio(aspect);

  let sx = 0;
  let sy = 0;
  let sWidth = origW;
  let sHeight = origH;

  if (targetRatio !== null) {
    const curRatio = origW / origH;
    if (curRatio > targetRatio) {
      sHeight = origH;
      sWidth = Math.max(1, Math.round(origH * targetRatio));
      sx = Math.round((origW - sWidth) / 2);
    } else if (curRatio < targetRatio) {
      sWidth = origW;
      sHeight = Math.max(1, Math.round(origW / targetRatio));
      sy = Math.round((origH - sHeight) / 2);
    }
  }

  const isLandscape = sWidth >= sHeight;
  const boxW = isLandscape ? maxLong : maxShort;
  const boxH = isLandscape ? maxShort : maxLong;

  const scale = Math.min(1, boxW / sWidth, boxH / sHeight);
  const destW = Math.max(1, Math.round(sWidth * scale));
  const destH = Math.max(1, Math.round(sHeight * scale));

  return { sx, sy, sWidth, sHeight, destW, destH };
}

export function applyXeroxDither(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const threshold = (bayer[y % 4][x % 4] / 16) * 255;
      const val = lum < threshold ? 20 : 240;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export function applyRisographDuotone(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  // Azul escuro cívico (0, 35, 75) para sombras; Ouro/âmbar (245, 195, 30) para altas luzes
  const c1 = [12, 35, 68];
  const c2 = [245, 200, 35];

  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    data[i] = Math.round(c1[0] * (1 - lum) + c2[0] * lum);
    data[i + 1] = Math.round(c1[1] * (1 - lum) + c2[1] * lum);
    data[i + 2] = Math.round(c1[2] * (1 - lum) + c2[2] * lum);
  }
  ctx.putImageData(imgData, 0, 0);
}

export function applyVhsCamcorder(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const scanline = y % 2 === 0 ? 0.92 : 1.0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Calor analógico: aumenta vermelho/âmbar, reduz azul levemente
      data[i] = Math.min(255, (data[i] * 1.08 + 8) * scanline);
      data[i + 1] = Math.min(255, (data[i + 1] * 1.02) * scanline);
      data[i + 2] = Math.min(255, (data[i + 2] * 0.94) * scanline);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export function applyLofiFilter(ctx, width, height, filterName = "normal") {
  if (filterName === "xerox") return applyXeroxDither(ctx, width, height);
  if (filterName === "risograph") return applyRisographDuotone(ctx, width, height);
  if (filterName === "vhs") return applyVhsCamcorder(ctx, width, height);
}

export function optimizeCanvasQualityUnderCeiling(canvas, { maxBytes = LOFI_LIMITS.PHOTO_MAX_BYTES } = {}) {
  let low = 0.15;
  let high = 0.95;
  let best = null;

  try {
    const probeUrl = canvas.toDataURL("image/webp", high);
    const probeParsed = parseDataUrl(probeUrl);
    if (probeParsed.byteLength <= maxBytes) {
      return {
        dataUrl: probeUrl,
        byteLength: probeParsed.byteLength,
        qualityUsed: high,
        mime: "image/webp",
        isWithinLimit: true,
      };
    }
  } catch {}

  for (let iter = 0; iter < 6; iter++) {
    const mid = Number(((low + high) / 2).toFixed(3));
    try {
      const dataUrl = canvas.toDataURL("image/webp", mid);
      const parsed = parseDataUrl(dataUrl);
      if (parsed.byteLength <= maxBytes) {
        best = {
          dataUrl,
          byteLength: parsed.byteLength,
          qualityUsed: mid,
          mime: "image/webp",
          isWithinLimit: true,
        };
        low = mid;
      } else {
        high = mid;
      }
    } catch {
      high = mid;
    }
  }

  if (best) return best;

  if (canvas.width > 320 && canvas.height > 320 && typeof document !== "undefined" && document.createElement) {
    try {
      const down = document.createElement("canvas");
      down.width = Math.max(1, Math.round(canvas.width * 0.85));
      down.height = Math.max(1, Math.round(canvas.height * 0.85));
      const dctx = down.getContext("2d");
      dctx.drawImage(canvas, 0, 0, down.width, down.height);
      return optimizeCanvasQualityUnderCeiling(down, { maxBytes });
    } catch {}
  }

  const fallbackUrl = canvas.toDataURL("image/webp", 0.15);
  const fallbackParsed = parseDataUrl(fallbackUrl);
  return {
    dataUrl: fallbackUrl,
    byteLength: fallbackParsed.byteLength,
    qualityUsed: 0.15,
    mime: "image/webp",
    isWithinLimit: fallbackParsed.byteLength <= maxBytes,
  };
}

export function compressCanvasWithClamp(canvas, { quality = LOFI_LIMITS.PHOTO_DEFAULT_QUALITY, maxBytes = LOFI_LIMITS.PHOTO_MAX_BYTES } = {}) {
  return optimizeCanvasQualityUnderCeiling(canvas, { maxBytes });
}

export function calculateAudioChunks(durationSeconds) {
  const s = Math.max(1, Math.min(Number(durationSeconds) || 1, LOFI_LIMITS.AUDIO_MAX_SECONDS));
  const chunkSec = LOFI_LIMITS.AUDIO_CHUNK_SECONDS;
  const count = Math.ceil(s / chunkSec);
  return {
    totalDuration: s,
    chunkDuration: chunkSec,
    chunkCount: Math.min(4, count),
    estimatedBytesPerChunk: chunkSec * (LOFI_LIMITS.AUDIO_BITRATE / 8),
  };
}

export function calculateVideoChunks(durationSeconds) {
  const s = Math.max(1, Math.min(Number(durationSeconds) || 1, LOFI_LIMITS.VIDEO_MAX_SECONDS));
  const chunkSec = LOFI_LIMITS.VIDEO_CHUNK_SECONDS;
  const count = Math.ceil(s / chunkSec);
  return {
    totalDuration: s,
    chunkDuration: chunkSec,
    chunkCount: Math.min(5, count),
    estimatedBytesPerChunk: chunkSec * (LOFI_LIMITS.VIDEO_BITRATE / 8),
  };
}

export function sliceBufferIntoFixedChunks(bufferOrUint8, maxChunkBytes = LOFI_LIMITS.PHOTO_MAX_BYTES) {
  const bytes = bufferOrUint8 instanceof Uint8Array ? bufferOrUint8 : new Uint8Array(bufferOrUint8);
  const total = bytes.byteLength;
  if (!total) return [];
  const chunks = [];
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + maxChunkBytes, total);
    chunks.push(bytes.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export async function buildMediaChunkManifest({ type = "audio", mime = "audio/webm", durationSeconds = 0, chunks = [] }) {
  const blocks = [];
  let totalBytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkBytes = chunks[i];
    const hash = await computeBlobHash(chunkBytes);
    const size = chunkBytes.byteLength;
    totalBytes += size;
    blocks.push({
      index: i,
      hash,
      size,
      isUnder100Kb: size <= LOFI_LIMITS.PHOTO_MAX_BYTES,
    });
  }

  return {
    type,
    mime,
    durationSeconds,
    blockCount: blocks.length,
    totalBytes,
    allBlocksFreeTier: blocks.every((b) => b.isUnder100Kb),
    blocks,
  };
}

/* =========================================================================
   Criptografia Oclusiva Zero-Knowledge (AES-GCM-256 para Google Drive / Nuvem Cega)
   ========================================================================= */

export async function generateOclusionKey() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SubtleCrypto indisponível");
  return await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportOclusionKey(cryptoKey) {
  const subtle = globalThis.crypto?.subtle;
  const raw = await subtle.exportKey("raw", cryptoKey);
  const bytes = new Uint8Array(raw);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function importOclusionKey(hexKey) {
  const subtle = globalThis.crypto?.subtle;
  const len = hexKey.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hexKey.slice(i * 2, i * 2 + 2), 16);
  }
  return await subtle.importKey("raw", bytes, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptBlobForOclusion(dataBufferOrUint8, cryptoKey) {
  const subtle = globalThis.crypto?.subtle;
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const data = dataBufferOrUint8 instanceof Uint8Array ? dataBufferOrUint8 : new Uint8Array(dataBufferOrUint8);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data);

  // [12 bytes IV] + [Ciphertext + Auth Tag]
  const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.byteLength);
  return result;
}

export async function decryptBlobFromOclusion(encryptedUint8, cryptoKey) {
  const subtle = globalThis.crypto?.subtle;
  const bytes = encryptedUint8 instanceof Uint8Array ? encryptedUint8 : new Uint8Array(encryptedUint8);
  if (bytes.byteLength <= 12) throw new Error("Pacote criptografado inválido ou corrompido");

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
  return new Uint8Array(decrypted);
}
