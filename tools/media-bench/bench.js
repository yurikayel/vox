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
/**
 * Inicializa o módulo WASM do codificador AVIF uma só vez.
 * @returns {Promise<object>}
 */
function initAvif() {
  avifModule ??= initEmscriptenModule(avifEncFactory);
  return avifModule;
}

/**
 * Codifica a imagem em AVIF.
 * @param {ImageData} imageData Pixels da imagem.
 * @param {object} options Opções que sobrescrevem as padrão.
 * @returns {Promise<Uint8Array>}
 */
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

/**
 * Acrescenta uma linha ao registro da página.
 * @param {string} msg Mensagem.
 */
function log(msg) {
  logEl.textContent += `${msg}\n`;
}

/** Caixa da spec (lado maior e lado menor), nunca amplia. Dimensões pares (exigência do H.264). */
export function fitBox(w, h, box = SPEC.image) {
  const scale = Math.min(1, box.long / Math.max(w, h), box.short / Math.min(w, h));
  /**
   * Arredonda a dimensão pela escala, para número par com no mínimo 2.
   * @param {number} n Dimensão original.
   * @returns {number}
   */
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/**
 * Decodifica o arquivo em um canvas ajustado ao limite de tamanho.
 * @param {Blob} blob Arquivo de imagem.
 * @returns {Promise<object>}
 */
async function toCanvas(blob) {
  const src = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const { width, height } = fitBox(src.width, src.height);
  const resized = await createImageBitmap(src, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(resized, 0, 0);
  return { canvas, source: `${src.width}×${src.height}`, size: `${width}×${height}` };
}

/**
 * Procura a qualidade AVIF mais alta que cabe no teto de bytes, descendo a escada de qualidade.
 * @param {ImageData} imageData Pixels da imagem.
 * @param {number} [speed=6] Velocidade do codificador.
 * @returns {Promise<object>}
 */
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

/**
 * Calcula o PSNR entre a imagem de referência e a imagem decodificada.
 * @param {ImageData} ref Pixels de referência.
 * @param {Blob} blob Imagem codificada.
 * @returns {Promise<number>}
 */
async function decodedPsnr(ref, blob) {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(ref.width, ref.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0, ref.width, ref.height);
  return psnrY(ref, ctx.getImageData(0, 0, ref.width, ref.height));
}

/**
 * Mede o tamanho do canvas codificado no tipo e na qualidade dados.
 * @param {OffscreenCanvas} canvas Canvas.
 * @param {string} type Tipo MIME.
 * @param {number} quality Qualidade, de 0 a 1.
 * @returns {Promise<number>}
 */
async function blobBytes(canvas, type, quality) {
  return (await canvas.convertToBlob({ type, quality })).size;
}

/**
 * Mede o tamanho da miniatura (lado maior de 160 px).
 * @param {OffscreenCanvas} canvas Canvas.
 * @returns {Promise<number>}
 */
async function thumbBytes(canvas) {
  const scale = 160 / Math.max(canvas.width, canvas.height);
  const thumb = new OffscreenCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
  thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return blobBytes(thumb, "image/webp", 0.6);
}

/**
 * Mede o tempo de codificação AVIF rápida.
 * @param {ImageData} imageData Pixels da imagem.
 * @returns {Promise<object>}
 */
async function measureFast(imageData) {
  const t0 = performance.now();
  const buf = await encodeAvif(imageData, { quality: SPEC.image.quality, speed: 8 });
  return { bytes: buf.byteLength, ms: Math.round(performance.now() - t0) };
}

/**
 * Mede o tamanho e a qualidade de uma imagem em cada formato.
 * @param {string} name Nome do arquivo.
 * @param {Blob} blob Arquivo de imagem.
 * @returns {Promise<object>}
 */
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

/** Nome de arquivo vem da pessoa: escapar antes de pôr no HTML. */
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Renderiza a tabela de resultados das imagens em HTML.
 * @param {object[]} rows Resultados por imagem.
 * @returns {string}
 */
function renderImageTable(rows) {
  /**
   * Formata bytes em KB com uma casa.
   * @param {number} n Bytes.
   * @returns {string}
   */
  const kb = (n) => (n / 1024).toFixed(1);
  const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.source}→${r.size}</td><td class="${r.steps ? "over" : ""}">${kb(r.avifBytes)} (q${r.avifQ})</td>
    <td>${r.avifMsBase}</td><td>${kb(r.webpBytes)}</td><td>${kb(r.thumbBytes)}</td></tr>`).join("");
  out.innerHTML = `<table><tr><th>Imagem</th><th>Original→caixa</th><th>AVIF KiB</th><th>ms q70</th><th>WebP 0,78 KiB</th><th>Miniatura KiB</th></tr>${body}</table>`;
}

/**
 * Garante que o codificador AVIF foi inicializado e registra o tempo.
 * @returns {Promise<void>}
 */
async function ensureAvifReady() {
  if (bench.avifInitMs !== null) return;
  const t0 = performance.now();
  await initAvif();
  bench.avifInitMs = Math.round(performance.now() - t0);
  log(`Codificador AVIF carregado em ${bench.avifInitMs} ms (crossOriginIsolated=${globalThis.crossOriginIsolated})`);
}

/**
 * Mede cada imagem da lista e atualiza a tabela.
 * @param {object[]} items Itens com `name` e `blob`.
 * @returns {Promise<void>}
 */
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
