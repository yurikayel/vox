/**
 * PM-70 / PM-71 / PM-77 — Testes do validador de orçamento Mídia v2 e carrossel.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEDIA_V2_LIMITS,
  planTransportChunks,
  runCli,
  validateCarousel,
  validateMediaItem,
} from "../scripts/media-v2-budget.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/media-v2-budget.mjs");

function makePhoto(overrides = {}) {
  return { kind: "photo", layer: "half", width: 640, height: 360, bytes: 44_000, mime: "image/avif", ...overrides };
}

function makeAudio(overrides = {}) {
  return { kind: "audio", layer: "half", durationSec: 60, bytes: 240_000, mime: "audio/opus", ...overrides };
}

function makeVideo(overrides = {}) {
  return {
    kind: "video",
    layer: "half",
    width: 640,
    height: 360,
    durationSec: 10,
    fps: 30,
    hasKeyframe: true,
    bytes: 500_000,
    mime: "video/mp4",
    ...overrides,
  };
}

test("PM-70/71/77: MEDIA_V2_LIMITS expõe constantes congeladas conforme ADR-029", () => {
  assert.equal(Object.isFrozen(MEDIA_V2_LIMITS), true);
  assert.equal(Object.isFrozen(MEDIA_V2_LIMITS.layers), true);
  assert.ok(MEDIA_V2_LIMITS.chunkMaxBytes > 0 && MEDIA_V2_LIMITS.chunkMaxBytes < 100_000);
  assert.equal(MEDIA_V2_LIMITS.maxCarouselItems, 4);
  assert.equal(MEDIA_V2_LIMITS.maxAudioSec, 60);
  assert.equal(MEDIA_V2_LIMITS.maxVideoSec, 10);
  assert.equal(MEDIA_V2_LIMITS.maxVideoFps, 30);
  assert.equal(MEDIA_V2_LIMITS.maxCarouselAudioSec, 240);
  assert.equal(MEDIA_V2_LIMITS.maxCarouselVideoSec, 40);
  assert.deepEqual(MEDIA_V2_LIMITS.layers, { half: { maxHeight: 360 }, full: { maxHeight: 720 } });
});

test("PM-70/71: aceita foto, áudio e vídeo válidos nas camadas Half 360p e Full 720p", () => {
  const cases = [
    makePhoto({ layer: "half", width: 640, height: 360, mime: "image/avif" }),
    makePhoto({ layer: "full", width: 1280, height: 720, bytes: 140_000, mime: "image/webp" }),
    makeAudio({ layer: "half", durationSec: 45, mime: "audio/opus" }),
    makeAudio({ layer: "full", durationSec: 60, bytes: 720_000, mime: "audio/mp4" }),
    makeVideo({ layer: "half", width: 640, height: 360, fps: 30 }),
    makeVideo({ layer: "full", width: 1280, height: 720, bytes: 1_500_000, fps: 24 }),
  ];
  for (const item of cases) {
    const res = validateMediaItem(item);
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.deepEqual(res.errors, []);
    assert.equal(res.chunkCount, Math.ceil(item.bytes / MEDIA_V2_LIMITS.chunkMaxBytes));
  }
});

test("PM-70/71: rejeita violações de altura, duração, fps, keyframe, bytes e MIME", () => {
  assert.equal(validateMediaItem(null).ok, false);
  assert.equal(validateMediaItem(makePhoto({ layer: "half", height: 480 })).ok, false);
  assert.equal(validateMediaItem(makePhoto({ layer: "full", height: 1080 })).ok, false);
  assert.equal(validateMediaItem(makePhoto({ bytes: 0 })).ok, false);
  assert.equal(validateMediaItem(makePhoto({ mime: "image/png" })).ok, false);
  assert.equal(validateMediaItem(makePhoto({ mime: "audio/opus" })).ok, false);
  assert.equal(validateMediaItem(makeAudio({ durationSec: 61 })).ok, false);
  assert.equal(validateMediaItem(makeVideo({ durationSec: 11 })).ok, false);
  assert.equal(validateMediaItem(makeVideo({ fps: 60 })).ok, false);
  assert.equal(validateMediaItem(makeVideo({ hasKeyframe: false })).ok, false);
  assert.equal(validateMediaItem(makeVideo({ mime: "video/webm" })).ok, false);
});

test("PM-77: aceita carrosséis homogêneos válidos (4 fotos, 4 áudios <= 240s, 4 vídeos <= 40s)", () => {
  const photos = validateCarousel([makePhoto(), makePhoto({ layer: "full", height: 720 }), makePhoto(), makePhoto()]);
  assert.equal(photos.ok, true);
  assert.equal(photos.kind, "photo");
  assert.equal(photos.itemCount, 4);

  const audios = validateCarousel(Array.from({ length: 4 }, () => makeAudio({ durationSec: 60 })));
  assert.equal(audios.ok, true);
  assert.equal(audios.totalDurationSec, 240);

  const videos = validateCarousel(Array.from({ length: 4 }, () => makeVideo({ durationSec: 10, hasKeyframe: true })));
  assert.equal(videos.ok, true);
  assert.equal(videos.totalDurationSec, 40);
  assert.equal(videos.totalBytes, 2_000_000);
  assert.ok(videos.totalChunkCount >= 20);
});

test("PM-77: rejeita carrossel vazio, >4 itens, tipos mistos, vídeo sem keyframe e excesso de duração", () => {
  assert.equal(validateCarousel("bad").ok, false);
  assert.equal(validateCarousel([]).ok, false);
  assert.equal(validateCarousel(Array.from({ length: 5 }, () => makePhoto())).ok, false);

  const mixed = validateCarousel([makePhoto(), makeVideo()]);
  assert.equal(mixed.ok, false);
  assert.ok(mixed.errors.some((e) => e.includes("homogêneo")));

  const missingKeyframe = validateCarousel([makeVideo(), makeVideo({ hasKeyframe: false })]);
  assert.equal(missingKeyframe.ok, false);
  assert.ok(missingKeyframe.errors.some((e) => e.includes("hasKeyframe")));

  const overAudio = validateCarousel(Array.from({ length: 4 }, () => makeAudio({ durationSec: 61 })));
  assert.equal(overAudio.ok, false);
  assert.ok(overAudio.errors.some((e) => e.includes("240")));

  const overVideo = validateCarousel(Array.from({ length: 4 }, () => makeVideo({ durationSec: 10.5 })));
  assert.equal(overVideo.ok, false);
  assert.ok(overVideo.errors.some((e) => e.includes("40")));
});

test("PM-70/71: planTransportChunks garante soma exata, pedaços <= chunkMaxBytes e estimativa Slow 3G", () => {
  const zero = planTransportChunks(0);
  assert.equal(zero.chunkCount, 0);
  assert.deepEqual(zero.chunkSizes, []);
  assert.equal(zero.estimatedSlow3gSec, 0);

  const totalBytes = 250_000;
  const plan = planTransportChunks(totalBytes);
  assert.equal(plan.chunkMaxBytes, MEDIA_V2_LIMITS.chunkMaxBytes);
  assert.equal(plan.chunkCount, plan.chunkSizes.length);
  assert.ok(plan.chunkSizes.every((size) => size > 0 && size <= plan.chunkMaxBytes));
  assert.equal(plan.chunkSizes.reduce((acc, s) => acc + s, 0), totalBytes);
  assert.equal(plan.slow3gKbps, 750);
  assert.equal(plan.estimatedSlow3gSec, 2.667);

  assert.throws(() => planTransportChunks(-1), RangeError);
  assert.throws(() => planTransportChunks(100, 0), RangeError);
});

test("PM-70/71/77: CLI executa roundtrip (--input, --json) e retorna exit 0/1 conforme validade", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-media-v2-"));
  const validPath = path.join(tmpDir, "valid-carousel.json");
  const invalidPath = path.join(tmpDir, "invalid-carousel.json");
  try {
    fs.writeFileSync(validPath, JSON.stringify({ items: [makePhoto(), makePhoto({ layer: "full", height: 720 })] }), "utf8");
    fs.writeFileSync(invalidPath, JSON.stringify({ items: [makePhoto(), makeVideo()] }), "utf8");

    const okProc = spawnSync(process.execPath, [SCRIPT_PATH, "--input", validPath, "--json"], { encoding: "utf8" });
    assert.equal(okProc.status, 0);
    const okPayload = JSON.parse(okProc.stdout);
    assert.equal(okPayload.ok, true);
    assert.equal(okPayload.mode, "carousel");
    assert.equal(okPayload.itemCount, 2);

    const failProc = spawnSync(process.execPath, [SCRIPT_PATH, "--input", invalidPath, "--json"], { encoding: "utf8" });
    assert.equal(failProc.status, 1);
    const failPayload = JSON.parse(failProc.stdout);
    assert.equal(failPayload.ok, false);
    assert.ok(failPayload.errors.length > 0);

    const written = [];
    const directRes = runCli(["--input", validPath, "--json"], (text) => written.push(text));
    assert.equal(directRes.exitCode, 0);
    assert.equal(directRes.ok, true);
    assert.deepEqual(written, [directRes.output]);
    const helpRes = runCli(["--help"], (text) => written.push(text));
    assert.equal(helpRes.mode, "help");
    assert.equal(written.length, 2);
    assert.throws(() => runCli(["--input", path.join(tmpDir, "missing.json")], () => {}), /Não foi possível ler/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
