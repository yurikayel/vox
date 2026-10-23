import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as media from "../client/js/composer-media.js";

function mockFile({ type, size, name = "photo.jpg" }) {
  return { type, size, name };
}

test("composer-media - aceita JPEG dentro do limite", () => {
  const res = media.validateComposerImageFile(mockFile({ type: "image/jpeg", size: 1024 }));
  assert.equal(res.ok, true);
});

test("composer-media - rejeita MIME não permitido", () => {
  const res = media.validateComposerImageFile(mockFile({ type: "image/svg+xml", size: 512 }));
  assert.equal(res.ok, false);
  assert.ok(res.message.includes("Formato não suportado"));
});

test("composer-media - rejeita arquivo acima do tamanho máximo", () => {
  const over = media.COMPOSER_IMAGE_MAX_BYTES + 1;
  const res = media.validateComposerImageFile(mockFile({ type: "image/png", size: over }));
  assert.equal(res.ok, false);
  assert.ok(res.message.includes("Máximo"));
});

test("composer-media - rejeita arquivo vazio", () => {
  const res = media.validateComposerImageFile(mockFile({ type: "image/webp", size: 0 }));
  assert.equal(res.ok, false);
});

test("composer-media - dimensões dentro do teto", () => {
  const max = media.COMPOSER_IMAGE_MAX_DIMENSION;
  assert.equal(media.validateComposerImageDimensions(max, max - 100).ok, true);
});

test("composer-media - dimensões acima do teto", () => {
  const max = media.COMPOSER_IMAGE_MAX_DIMENSION;
  const res = media.validateComposerImageDimensions(max + 1, 800);
  assert.equal(res.ok, false);
  assert.ok(res.message.includes(String(max)));
});
