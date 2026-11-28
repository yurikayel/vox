/**
 * @file SUB-29: o mapa importado guarda o tamanho real da imagem (proporção mantida) e a imagem grande demais
 * para o envio aos jogadores é recusada com aviso, sem gravar o arquivo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { getActiveScene, uploadSceneMapBlob } from "../client/js/dungeon/dungeon-scene-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { fitMapSize, readImageSize } from "../client/js/dungeon/map-image-size.js";
import { MAX_SYNC_BLOB_BYTES } from "../client/js/dungeon/vtt-sync-codec.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s) => [...s].map((c) => c.charCodeAt(0));
const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

const png = (w, h) => new Uint8Array([0x89, ...text("PNG"), 13, 10, 26, 10, ...u32(13), ...text("IHDR"), ...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
const jpeg = (w, h) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
const webpX = (w, h) => new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP"), ...text("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
const webpL = (w, h) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP"), ...text("VP8L"), 5, 0, 0, 0, 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255, 0, 0, 0, 0, 0, 0]);
};
const gif = (w, h) => new Uint8Array([...text("GIF89a"), w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0]);

async function importar(bytes, mime = "image/png") {
  const store = createVttStore(createMemoryVttBackend());
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const outcome = await uploadSceneMapBlob(state, { bytes, mime }, { store }).then(() => null, (e) => e);
  const scene = getActiveScene(state);
  const floor = scene.floors.find((f) => f.z === scene.activeFloorZ);
  return { state, store, floor, outcome };
}

test("PNG 1200×800 vira piso 1200×800", async () => {
  const { floor } = await importar(png(1200, 800));
  assert.deepEqual([floor.widthPx, floor.heightPx], [1200, 800]);
});

test("JPEG e WebP (VP8X e VP8L) e GIF trazem o tamanho lido", async () => {
  const j = await importar(jpeg(1000, 500), "image/jpeg");
  assert.deepEqual([j.floor.widthPx, j.floor.heightPx], [1000, 500]);
  const w = await importar(webpX(1500, 900), "image/webp");
  assert.deepEqual([w.floor.widthPx, w.floor.heightPx], [1500, 900]);
  assert.deepEqual(readImageSize(webpL(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(readImageSize(gif(300, 400)), { width: 300, height: 400 });
});

test("imagem 10000×5000 cabe em 8192×4096 sem cortar a proporção", async () => {
  const { floor } = await importar(png(10000, 5000));
  assert.deepEqual([floor.widthPx, floor.heightPx], [8192, 4096]);
});

test("imagem pequena sobe ao mínimo do piso mantendo a proporção", () => {
  assert.deepEqual(fitMapSize(128, 64), { widthPx: 512, heightPx: 256 });
});

test("acima do teto de envio: recusa, avisa 16 MiB e não grava nada", async () => {
  const grande = new Uint8Array(MAX_SYNC_BLOB_BYTES + 1);
  grande.set(png(1200, 800));
  const { state, store, outcome } = await importar(grande);
  assert.ok(outcome instanceof Error);
  assert.match(state.mapNotice, /16 MiB/);
  assert.equal((await store.getAllBlobsMap()).size, 0);
});

test("exatamente no teto de envio ainda é aceito", async () => {
  const limite = new Uint8Array(MAX_SYNC_BLOB_BYTES);
  limite.set(png(1200, 800));
  const { outcome, store } = await importar(limite);
  assert.equal(outcome, null);
  assert.equal((await store.getAllBlobsMap()).size, 1);
});

test("bytes que não são imagem conhecida mantêm o padrão e o envio segue", async () => {
  const { floor, outcome, state } = await importar(new Uint8Array([1, 2, 3, 4]));
  assert.equal(outcome, null);
  assert.deepEqual([floor.widthPx, floor.heightPx], [768, 576]);
  assert.match(state.mapNotice, /Mapa salvo localmente/);
});

test("cabeçalhos truncados ou corrompidos não lançam e não dão tamanho", () => {
  for (const b of [new Uint8Array(0), png(10, 10).slice(0, 12), jpeg(10, 10).slice(0, 6), webpX(10, 10).slice(0, 20), new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]) {
    assert.equal(readImageSize(b), null);
  }
  assert.equal(readImageSize("não é Uint8Array"), null);
});
