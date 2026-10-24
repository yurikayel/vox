import test from "node:test";
import assert from "node:assert/strict";
import * as mediaBlob from "../client/js/media-blob.js";

const SAMPLE_TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("media-blob: validação e parsing de Data URLs", () => {
  assert.equal(mediaBlob.isDataUrl(SAMPLE_TINY_PNG), true);
  assert.equal(mediaBlob.isDataUrl("https://example.com/photo.jpg"), false);
  assert.equal(mediaBlob.isDataUrl("not-a-data-url"), false);

  const parsed = mediaBlob.parseDataUrl(SAMPLE_TINY_PNG);
  assert.equal(parsed.mime, "image/png");
  assert.ok(parsed.byteLength > 0);
  assert.ok(parsed.base64.length > 0);

  assert.throws(() => mediaBlob.parseDataUrl("invalid"), /inválido/);
});

test("media-blob: cálculo de hash SHA-256 determinístico", async () => {
  const hash1 = await mediaBlob.computeBlobHash(SAMPLE_TINY_PNG);
  const hash2 = await mediaBlob.computeBlobHash(SAMPLE_TINY_PNG);

  assert.equal(typeof hash1, "string");
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);

  const stringHash = await mediaBlob.computeBlobHash("vox-p2p-test-string");
  assert.equal(stringHash.length, 64);
  assert.notEqual(stringHash, hash1);
});

test("media-blob: detachMedia e attachMedia preservam integridade", async () => {
  const originalPost = {
    id: "tx-test-media-1",
    author: "vx1sampleauthor",
    title: "Foto ao vivo",
    body: "Post com imagem",
    image: SAMPLE_TINY_PNG,
    ts: Date.now(),
  };

  const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia(originalPost);

  assert.equal(detachedPost.image, null);
  assert.ok(detachedPost.mediaRef);
  assert.equal(detachedPost.mediaRef.mime, "image/png");
  assert.equal(detachedPost.mediaRef.hash, blob.hash);
  assert.equal(blob.data, SAMPLE_TINY_PNG);

  // Re-anexo com blob correto
  const restoredPost = mediaBlob.attachMedia(detachedPost, blob);
  assert.equal(restoredPost.image, SAMPLE_TINY_PNG);

  // Tentativa de anexar blob com hash divergente não altera o post
  const fakeBlob = { hash: "0000000000000000000000000000000000000000000000000000000000000000", data: "fake" };
  const rejectedPost = mediaBlob.attachMedia(detachedPost, fakeBlob);
  assert.equal(rejectedPost.image, null);
});

test("media-blob: verifyMediaBlob detecta adulteração de payload", async () => {
  const hash = await mediaBlob.computeBlobHash(SAMPLE_TINY_PNG);
  const validBlob = {
    hash,
    mime: "image/png",
    data: SAMPLE_TINY_PNG,
  };

  const isValid = await mediaBlob.verifyMediaBlob(validBlob);
  assert.equal(isValid, true);

  const tamperedBlob = {
    hash,
    mime: "image/png",
    data: SAMPLE_TINY_PNG + "corrupted_bits",
  };
  const isTamperedValid = await mediaBlob.verifyMediaBlob(tamperedBlob);
  assert.equal(isTamperedValid, false);
});

test("media-blob: BlobStorage gerencia armazenamento e eviction LRU", async () => {
  const hash = await mediaBlob.computeBlobHash(SAMPLE_TINY_PNG);
  const blob = {
    hash,
    mime: "image/png",
    data: SAMPLE_TINY_PNG,
  };

  const storage = mediaBlob.defaultBlobStorage;
  storage.clear();

  await storage.put(blob);
  assert.equal(storage.has(hash), true);
  assert.equal(storage.get(hash).data, SAMPLE_TINY_PNG);

  // Rejeita inserção de blob adulterado
  await assert.rejects(
    async () => {
      await storage.put({ hash: "badhash", data: SAMPLE_TINY_PNG });
    },
    /mismatch/
  );

  storage.delete(hash);
  assert.equal(storage.has(hash), false);
  assert.equal(storage.get(hash), null);
});
