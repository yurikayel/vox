import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as lofi from "../client/js/media-lofi.js";

test("media-lofi: constantes e limites calibrados rigorosamente", () => {
  assert.equal(lofi.LOFI_LIMITS.PHOTO_MAX_BYTES, 99 * 1024);
  assert.equal(lofi.LOFI_LIMITS.PHOTO_MAX_BYTES, 101376);
  assert.equal(lofi.LOFI_LIMITS.PHOTO_MAX_DIMENSION, 1080);
  assert.equal(lofi.LOFI_LIMITS.PHOTO_DEFAULT_QUALITY, 0.50);

  assert.equal(lofi.LOFI_LIMITS.AUDIO_BITRATE, 48000);
  assert.equal(lofi.LOFI_LIMITS.AUDIO_MAX_SECONDS, 60);
  assert.equal(lofi.LOFI_LIMITS.AUDIO_CHUNK_SECONDS, 15);

  assert.equal(lofi.LOFI_LIMITS.VIDEO_BITRATE, 380000);
  assert.equal(lofi.LOFI_LIMITS.VIDEO_MAX_SECONDS, 10);
  assert.equal(lofi.LOFI_LIMITS.VIDEO_CHUNK_SECONDS, 2);
  assert.equal(lofi.LOFI_LIMITS.VIDEO_MAX_WIDTH, 360);
});

test("media-lofi: calculateConstrainedDimensions respeita 1080p sem upscale", () => {
  assert.deepEqual(lofi.calculateConstrainedDimensions(4000, 3000), { width: 1080, height: 810 });
  assert.deepEqual(lofi.calculateConstrainedDimensions(1000, 2000), { width: 540, height: 1080 });
  assert.deepEqual(lofi.calculateConstrainedDimensions(800, 600), { width: 800, height: 600 });
  assert.deepEqual(lofi.calculateConstrainedDimensions(1080, 1080), { width: 1080, height: 1080 });
});

test("media-lofi: calculateAudioChunks fatia em blocos de 15s até teto de 60s", () => {
  const c15 = lofi.calculateAudioChunks(15);
  assert.equal(c15.chunkCount, 1);
  assert.equal(c15.estimatedBytesPerChunk, 90000); // ~87.8 KB <= 99 KB

  const c30 = lofi.calculateAudioChunks(30);
  assert.equal(c30.chunkCount, 2);

  const c60 = lofi.calculateAudioChunks(60);
  assert.equal(c60.chunkCount, 4);

  const c90 = lofi.calculateAudioChunks(90); // teto 60s
  assert.equal(c90.chunkCount, 4);
});

test("media-lofi: calculateVideoChunks fatia em blocos de 2s até teto de 10s @ 360p", () => {
  const v2 = lofi.calculateVideoChunks(2);
  assert.equal(v2.chunkCount, 1);
  assert.equal(v2.estimatedBytesPerChunk, 95000); // ~92.7 KB <= 99 KB

  const v6 = lofi.calculateVideoChunks(6);
  assert.equal(v6.chunkCount, 3);

  const v10 = lofi.calculateVideoChunks(10);
  assert.equal(v10.chunkCount, 5);

  const v20 = lofi.calculateVideoChunks(20); // teto 10s
  assert.equal(v20.chunkCount, 5);
});

test("media-lofi: sliceBufferIntoFixedChunks e manifest determinístico", async () => {
  // Simula buffer de 250 KB (deve virar 3 pedaços de <= 99 KB)
  const fakeBytes = new Uint8Array(250 * 1024);
  for (let i = 0; i < fakeBytes.length; i++) fakeBytes[i] = i % 256;

  const chunks = lofi.sliceBufferIntoFixedChunks(fakeBytes, lofi.LOFI_LIMITS.PHOTO_MAX_BYTES);
  assert.equal(chunks.length, 3);
  assert.ok(chunks[0].byteLength <= lofi.LOFI_LIMITS.PHOTO_MAX_BYTES);
  assert.ok(chunks[1].byteLength <= lofi.LOFI_LIMITS.PHOTO_MAX_BYTES);
  assert.ok(chunks[2].byteLength <= lofi.LOFI_LIMITS.PHOTO_MAX_BYTES);

  // Reconstituição byte a byte idêntica
  const reassembled = new Uint8Array(250 * 1024);
  reassembled.set(chunks[0], 0);
  reassembled.set(chunks[1], chunks[0].byteLength);
  reassembled.set(chunks[2], chunks[0].byteLength + chunks[1].byteLength);
  assert.deepEqual(reassembled, fakeBytes);

  const manifest = await lofi.buildMediaChunkManifest({
    type: "video",
    mime: "video/webm",
    durationSeconds: 6,
    chunks,
  });

  assert.equal(manifest.blockCount, 3);
  assert.equal(manifest.allBlocksFreeTier, true);
  assert.equal(manifest.blocks[0].hash.length, 64);
  assert.equal(manifest.blocks[1].hash.length, 64);
  assert.equal(manifest.blocks[2].hash.length, 64);
});

test("media-lofi: oclusão Zero-Knowledge (AES-GCM-256) protege contra espionagem", async () => {
  const secretData = new TextEncoder().encode("Mensagem e foto soberana do comitê popular.");

  const key = await lofi.generateOclusionKey();
  const hex = await lofi.exportOclusionKey(key);
  assert.equal(typeof hex, "string");
  assert.equal(hex.length, 64); // 256 bits = 32 bytes = 64 hex chars

  const importedKey = await lofi.importOclusionKey(hex);

  // Criptografa
  const encrypted = await lofi.encryptBlobForOclusion(secretData, key);
  assert.ok(encrypted.byteLength > secretData.byteLength); // 12 bytes IV + ciphertext + 16 bytes tag
  assert.notDeepEqual(encrypted.slice(12), secretData); // Massa de ruído puro

  // Descriptografa com chave importada
  const decrypted = await lofi.decryptBlobFromOclusion(encrypted, importedKey);
  const recoveredText = new TextDecoder().decode(decrypted);
  assert.equal(recoveredText, "Mensagem e foto soberana do comitê popular.");

  // Adulteração de ciphertext falha imediatamente
  encrypted[15] ^= 0xff;
  await assert.rejects(
    async () => await lofi.decryptBlobFromOclusion(encrypted, importedKey),
    /operation failed|MAC|operation|corrompido/i
  );
});

test("media-lofi: filtros retrô Xerox, Risógrafo e VHS executam sobre buffer de pixels", () => {
  const width = 8;
  const height = 8;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 120;     // R
    pixels[i + 1] = 150; // G
    pixels[i + 2] = 200; // B
    pixels[i + 3] = 255; // A
  }

  const mockCtx = {
    getImageData: () => ({ data: pixels }),
    putImageData: () => {},
  };

  // Executa cada filtro
  lofi.applyXeroxDither(mockCtx, width, height);
  assert.ok(pixels[0] === 20 || pixels[0] === 240); // Monocromático Dither

  lofi.applyRisographDuotone(mockCtx, width, height);
  assert.ok(pixels[0] > 0);

  lofi.applyVhsCamcorder(mockCtx, width, height);
  assert.ok(pixels[0] > 0);

  lofi.applyLofiFilter(mockCtx, width, height, "normal");
});
