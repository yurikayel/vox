/**
 * PM-70 — parte de vídeo (H.264 480p24, WebCodecs, modo quantizador) e áudio (Opus 32 kbps) da bancada.
 * Ferramenta de desenvolvimento, não publicada.
 */
import { fitBox, log, bench, SPEC } from "./bench.js";

const FPS = 24;
const KEYFRAME_EVERY = 48;

function avcConfig(width, height, extra = {}) {
  return { codec: "avc1.640028", width, height, framerate: FPS, avc: { format: "annexb" }, ...extra };
}

/** O que este navegador consegue codificar e tocar. */
export async function probe() {
  const vc = globalThis.VideoEncoder;
  const ac = globalThis.AudioEncoder;
  const v = document.createElement("video");
  const res = {
    webCodecs: Boolean(vc && ac),
    avcQuantizer: vc ? (await vc.isConfigSupported(avcConfig(854, 480, { bitrateMode: "quantizer" }))).supported : false,
    avcHardware: vc ? (await vc.isConfigSupported(avcConfig(854, 480, { hardwareAcceleration: "prefer-hardware", bitrate: 600_000 }))).supported : false,
    opusSpec: ac ? (await ac.isConfigSupported({ codec: "opus", sampleRate: 48000, numberOfChannels: 1, bitrate: SPEC.opusBps })).supported : false,
    recorderWebmOpus: MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus") || false,
    recorderMp4AvcOpus: MediaRecorder.isTypeSupported?.("video/mp4;codecs=avc1.640028,opus") || false,
    recorderMp4AvcAac: MediaRecorder.isTypeSupported?.("video/mp4;codecs=avc1.640028,mp4a.40.2") || false,
    playMp4Opus: v.canPlayType('audio/mp4; codecs="opus"') || "não",
    playWebmOpus: v.canPlayType('audio/webm; codecs="opus"') || "não",
    playAvif: await canDecodeAvif(),
  };
  bench.probe = res;
  log(`Sondagem: ${JSON.stringify(res)}`);
  return res;
}

function canDecodeAvif() {
  const img = new Image();
  const tiny = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=";
  return new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = tiny;
  });
}

function makeEncoder(stats) {
  const enc = new VideoEncoder({
    output: (chunk) => {
      stats.bytes += chunk.byteLength;
      stats.chunks += 1;
    },
    error: (e) => log(`Erro no codificador: ${e.message}`),
  });
  return enc;
}

function loadVideo(blob) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("vídeo não carregou"));
  });
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = t;
  });
}

/**
 * Busca quadro a quadro (24 fps) e codifica os primeiros `seconds`, com o quantizador pedido.
 * Por busca e não por reprodução: funciona com a aba em segundo plano. O tempo medido inclui a
 * decodificação das buscas, então serve para tamanho e taxa, não para velocidade do codificador.
 */
export async function measureVideo(name, blob, quantizer, seconds = 10) {
  const video = await loadVideo(blob);
  const { width, height } = fitBox(video.videoWidth, video.videoHeight, SPEC.video);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const stats = { bytes: 0, chunks: 0, frames: 0 };
  const enc = makeEncoder(stats);
  enc.configure(avcConfig(width, height, { bitrateMode: "quantizer", latencyMode: "quality" }));
  const span = Math.min(seconds, video.duration);
  const t0 = performance.now();
  for (let i = 0; i < Math.floor(span * FPS); i++) {
    await seekTo(video, i / FPS);
    encodeFrame({ enc, ctx, canvas, video, stats, quantizer });
  }
  await enc.flush();
  enc.close();
  const row = { name, source: `${video.videoWidth}×${video.videoHeight}`, size: `${width}×${height}`, quantizer, seconds: span, frames: stats.frames, bytes: stats.bytes, kbps: Math.round((stats.bytes * 8) / span / 1000), wallMs: Math.round(performance.now() - t0) };
  bench.videos.push(row);
  log(`Vídeo ${JSON.stringify(row)}`);
  return row;
}

function encodeFrame({ enc, ctx, canvas, video, stats, quantizer }) {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = new VideoFrame(canvas, { timestamp: Math.round((stats.frames * 1e6) / FPS) });
  enc.encode(frame, { keyFrame: stats.frames % KEYFRAME_EVERY === 0, avc: { quantizer } });
  frame.close();
  stats.frames += 1;
}

/** Opus na taxa da spec em 60 s de sinal sintético (tom + ruído, pior caso para o codificador de voz). */
export async function measureOpus(seconds = 60) {
  let bytes = 0;
  let maxPacket = 0;
  const enc = new AudioEncoder({ output: (c) => { bytes += c.byteLength; maxPacket = Math.max(maxPacket, c.byteLength); }, error: (e) => log(e.message) });
  enc.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: 1, bitrate: SPEC.opusBps });
  const block = 960;
  for (let i = 0; i < (48000 * seconds) / block; i++) {
    const data = new Float32Array(block).map((_, k) => 0.3 * Math.sin((2 * Math.PI * 440 * (i * block + k)) / 48000) + 0.05 * (Math.random() - 0.5));
    enc.encode(new AudioData({ format: "f32", sampleRate: 48000, numberOfFrames: block, numberOfChannels: 1, timestamp: (i * block * 1e6) / 48000, data }));
  }
  await enc.flush();
  const row = { seconds, bytes, kbPerMin: Math.round((bytes / 1024) * (60 / seconds)), maxPacket };
  bench.opus = row;
  log(`Opus ${JSON.stringify(row)}`);
  return row;
}

globalThis.runVideoUrl = async (url, quantizers = [24, 28, 32], seconds = 10) => {
  const blob = await (await fetch(url)).blob();
  const name = decodeURIComponent(url.split("/").pop());
  const rows = [];
  for (const q of quantizers) rows.push(await measureVideo(name, blob, q, seconds));
  return rows;
};
globalThis.runProbe = probe;
globalThis.runOpus = measureOpus;

document.getElementById("btn-probe").addEventListener("click", () => void probe().then(() => measureOpus()));
document.getElementById("pick-video").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) void [24, 28, 32].reduce((p, q) => p.then(() => measureVideo(f.name, f, q)), Promise.resolve());
});
