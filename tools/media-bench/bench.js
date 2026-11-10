/**
 * PM-70 — bancada de medição da mídia v2 (docs/specs/midia-v2.md). Ferramenta de desenvolvimento, não publicada.
 * Imagem: AVIF q70 (jSquash/libavif, uma thread) na caixa 960×540 / 540×960, degraus até caber em 99.999 bytes,
 * WebP 0,78 nativo de comparação e miniatura de 160 px. Vídeo: H.264 480p24 por WebCodecs em modo quantizador.
 * Áudio: Opus 32 kbps por WebCodecs. Os resultados ficam em window.__bench para leitura automática.
 */
// Direto no codificador de thread única: o encode.js do jSquash importa wasm-feature-detect 1.10.0, que usa
// `import.source(...)` e não carrega no Chrome 152 (SyntaxError). Sem COOP/COEP não haveria threads de qualquer forma.
import avifEncFactory from "../../node_modules/@jsquash/avif/codec/enc/avif_enc.js";
import { initEmscriptenModule } from "../../node_modules/@jsquash/avif/utils.js";
import { defaultOptions } from "../../node_modules/@jsquash/avif/meta.js";

let avifModule = null;
function initAvif() {
  avifModule ??= initEmscriptenModule(avifEncFactory);
  return avifModule;
}

async function encodeAvif(imageData, options) {
  const module = await initAvif();
  const output = module.encode(new Uint8Array(imageData.data.buffer), imageData.width, imageData.height, { ...defaultOptions, ...options });
  if (!output) throw new Error("Falha ao codificar AVIF.");
  return output.buffer;
}

export const CAP_BYTES = 99_999;
/** Parâmetros da spec (docs/specs/midia-v2.md): estética retrô, revisada em 09/11/2026. */
export const SPEC = Object.freeze({
  image: { long: 960, short: 540, quality: 70 },
  video: { long: 854, short: 480 },
  opusBps: 32000,
});
export const AVIF_LADDER = [70, 66, 60, 55, 50, 45, 40, 35, 30, 25, 20, 10];
const out = document.getElementById("out");
const logEl = document.getElementById("log");
const bench = (globalThis.__bench = { images: [], videos: [], probe: null, avifInitMs: null });

function log(msg) {
  logEl.textContent += `${msg}\n`;
}

/** Caixa da spec (lado maior e lado menor), nunca amplia. Dimensões pares (exigência do H.264). */
export function fitBox(w, h, box = SPEC.image) {
  const scale = Math.min(1, box.long / Math.max(w, h), box.short / Math.min(w, h));
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(w), height: even(h) };
}

async function toCanvas(blob) {
  const src = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const { width, height } = fitBox(src.width, src.height);
  const resized = await createImageBitmap(src, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(resized, 0, 0);
  return { canvas, source: `${src.width}×${src.height}`, size: `${width}×${height}` };
}

async function avifUnderCap(imageData, speed = 6) {
  const steps = [];
  for (const quality of AVIF_LADDER) {
    const t0 = performance.now();
    const buf = await encodeAvif(imageData, { quality, speed });
    steps.push({ quality, bytes: buf.byteLength, ms: Math.round(performance.now() - t0), buf });
    if (buf.byteLength <= CAP_BYTES) break;
  }
  return steps;
}

/** PSNR da luminância (dB) entre a imagem reduzida sem compressão e a versão decodificada. Métrica objetiva simples. */
export function psnrY(ref, test) {
  let sum = 0;
  const n = ref.width * ref.height;
  for (let i = 0; i < ref.data.length; i += 4) {
    const y1 = 0.299 * ref.data[i] + 0.587 * ref.data[i + 1] + 0.114 * ref.data[i + 2];
    const y2 = 0.299 * test.data[i] + 0.587 * test.data[i + 1] + 0.114 * test.data[i + 2];
    sum += (y1 - y2) ** 2;
  }
  const mse = sum / n;
  return mse === 0 ? 99 : Math.round(100 * 10 * Math.log10((255 * 255) / mse)) / 100;
}

async function decodedPsnr(ref, blob) {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(ref.width, ref.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0, ref.width, ref.height);
  return psnrY(ref, ctx.getImageData(0, 0, ref.width, ref.height));
}

async function blobBytes(canvas, type, quality) {
  return (await canvas.convertToBlob({ type, quality })).size;
}

async function thumbBytes(canvas) {
  const scale = 160 / Math.max(canvas.width, canvas.height);
  const thumb = new OffscreenCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
  thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return blobBytes(thumb, "image/webp", 0.6);
}

async function measureFast(imageData) {
  const t0 = performance.now();
  const buf = await encodeAvif(imageData, { quality: SPEC.image.quality, speed: 8 });
  return { bytes: buf.byteLength, ms: Math.round(performance.now() - t0) };
}

export async function measureImage(name, blob) {
  const { canvas, source, size } = await toCanvas(blob);
  const ref = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const steps = await avifUnderCap(ref);
  const final = steps[steps.length - 1];
  const webp = await canvas.convertToBlob({ type: "image/webp", quality: 0.78 });
  const fast = await measureFast(ref);
  return {
    name, source, size, inputBytes: blob.size,
    baseBytes: steps[0].bytes, avifQ: final.quality, avifBytes: final.bytes, steps: steps.length - 1,
    avifMsBase: steps[0].ms, avifMsTotal: steps.reduce((acc, x) => acc + x.ms, 0),
    avifPsnr: await decodedPsnr(ref, new Blob([final.buf], { type: "image/avif" })),
    webpBytes: webp.size, webpPsnr: await decodedPsnr(ref, webp),
    fastBytes: fast.bytes, fastMs: fast.ms, thumbBytes: await thumbBytes(canvas),
  };
}

function renderImageTable(rows) {
  const kb = (n) => (n / 1024).toFixed(1);
  const body = rows.map((r) => `<tr><td>${r.name}</td><td>${r.source}→${r.size}</td><td class="${r.steps ? "over" : ""}">${kb(r.avifBytes)} (q${r.avifQ})</td>
    <td>${r.avifMsBase}</td><td>${kb(r.webpBytes)}</td><td>${kb(r.thumbBytes)}</td></tr>`).join("");
  out.innerHTML = `<table><tr><th>Imagem</th><th>Original→caixa</th><th>AVIF KiB</th><th>ms q70</th><th>WebP 0,78 KiB</th><th>Miniatura KiB</th></tr>${body}</table>`;
}

async function ensureAvifReady() {
  if (bench.avifInitMs !== null) return;
  const t0 = performance.now();
  await initAvif();
  bench.avifInitMs = Math.round(performance.now() - t0);
  log(`Codificador AVIF carregado em ${bench.avifInitMs} ms (crossOriginIsolated=${globalThis.crossOriginIsolated})`);
}

export async function runImages(items) {
  await ensureAvifReady();
  for (const { name, blob } of items) {
    try {
      bench.images.push(await measureImage(name, blob));
    } catch (err) {
      log(`Falhou ${name}: ${err.message}`);
    }
    renderImageTable(bench.images);
  }
  return bench.images;
}

/** Para automação: mede uma lista de URLs servidas pelo mesmo servidor local. */
globalThis.runBenchUrls = async (urls) => {
  const items = [];
  for (const url of urls) items.push({ name: decodeURIComponent(url.split("/").pop()), blob: await (await fetch(url)).blob() });
  return runImages(items);
};

document.getElementById("pick-images").addEventListener("change", (e) => {
  void runImages([...e.target.files].map((f) => ({ name: f.name, blob: f })));
});

export { log, bench };
