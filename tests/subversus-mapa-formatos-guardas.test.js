/**
 * @file Guardas da leitura de tamanho de mapa (SUB-29) para os formatos menos comuns: JPEG progressivo, WebP com
 * perda, bits altos do WebP sem perda, PNG sem IHDR, tamanho zero e a regra de que o tamanho dado por quem chama vence.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { getActiveScene, uploadSceneMapBlob } from "../client/js/dungeon/dungeon-scene-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { readImageSize } from "../client/js/dungeon/map-image-size.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const text = (s) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w, h, chunk = "IHDR") => new Uint8Array([0x89, ...text("PNG"), 13, 10, 26, 10, ...u32(13), ...text(chunk), ...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
const sof = (marker, w, h) => new Uint8Array([0xff, 0xd8, 0xff, marker, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);

/** WebP com perda (VP8): quadro-chave com o código de início 9d 01 2a e 14 bits para cada lado. */
const webpLossy = (w, h) => new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP"), ...text("VP8 "), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8]);

/** WebP sem perda (VP8L): 14 bits de largura-1 e 14 de altura-1 depois da assinatura 0x2f. */
function webpLossless(w, h) {
  const bits = BigInt(w - 1) | (BigInt(h - 1) << 14n);
  const b = [0, 1, 2, 3].map((i) => Number((bits >> BigInt(8 * i)) & 255n));
  return new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP"), ...text("VP8L"), 5, 0, 0, 0, 0x2f, ...b, 0, 0, 0, 0, 0, 0]);
}

test("JPEG progressivo (SOF2) e de base (SOF0) dão o mesmo tamanho", () => {
  assert.deepEqual(readImageSize(sof(0xc2, 3000, 2000)), { width: 3000, height: 2000 });
  assert.deepEqual(readImageSize(sof(0xc0, 3000, 2000)), { width: 3000, height: 2000 });
});

test("WebP com perda (VP8) traz o tamanho lido", () => {
  assert.deepEqual(readImageSize(webpLossy(1920, 1080)), { width: 1920, height: 1080 });
});

test("WebP sem perda (VP8L) usa os 14 bits de cada lado, inclusive os altos", () => {
  assert.deepEqual(readImageSize(webpLossless(16384, 16384)), { width: 16384, height: 16384 });
  assert.deepEqual(readImageSize(webpLossless(8193, 300)), { width: 8193, height: 300 });
  assert.deepEqual(readImageSize(webpLossless(300, 8193)), { width: 300, height: 8193 });
});

test("PNG sem o bloco IHDR no lugar e imagem de tamanho zero não dão tamanho", () => {
  assert.equal(readImageSize(png(1200, 800, "IDAT")), null);
  assert.equal(readImageSize(png(0, 800)), null);
  assert.equal(readImageSize(png(1200, 0)), null);
  assert.equal(readImageSize(sof(0xc0, 0, 800)), null);
});

test("o tamanho dado por quem chama vence o lido da imagem", async () => {
  const store = createVttStore(createMemoryVttBackend());
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  await uploadSceneMapBlob(state, { bytes: png(1200, 800), mime: "image/png", widthPx: 640, heightPx: 480 }, { store });
  const scene = getActiveScene(state);
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ);
  assert.deepEqual([floor.widthPx, floor.heightPx], [640, 480]);
});
