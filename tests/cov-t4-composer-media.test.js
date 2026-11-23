/**
 * @file Cobertura de `composer-media.js` (lote T4): leitura de arquivo e compressão Lo-Fi com canvas de mentira.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument } from "./helpers/cov-t4-dom.mjs";
import { installFakeFileReader, installFakeImage, makeFakeCanvas } from "./helpers/cov-t4-media-env.mjs";

const cm = await import("../client/js/composer-media.js");

const PNG_URL = "data:image/png;base64,QUJD";

/**
 * Prepara documento, FileReader, Image e o canvas devolvido por `createElement`.
 * @param {object} [imageCfg] Config do `Image` falso.
 * @param {object} [canvasCfg] Config do canvas falso.
 * @returns {{ canvases: object[], cleanup: () => void }} Canvases criados e restauração.
 */
function mountMediaEnv(imageCfg, canvasCfg) {
  const dom = installFakeDocument();
  const canvases = [];
  dom.doc.createElement = () => {
    const c = makeFakeCanvas(canvasCfg);
    canvases.push(c);
    return c;
  };
  const restoreImg = installFakeImage(imageCfg);
  const restoreReader = installFakeFileReader();
  return { canvases, cleanup: () => { dom.restore(); restoreImg(); restoreReader(); } };
}

test("composer-media — readComposerMediaFile devolve o data URL e rejeita quando a leitura falha", async () => {
  const restore = installFakeFileReader();
  try {
    assert.equal(await cm.readComposerMediaFile({ type: "audio/mp3", __dataUrl: "data:audio/mp3;base64,AAAA" }), "data:audio/mp3;base64,AAAA");
    await assert.rejects(cm.readComposerMediaFile({ __fail: true }), /leitura falhou/);
  } finally {
    restore();
  }
});

test("composer-media — processComposerLofiImage rejeita entrada inválida e texto que não é data URL", async () => {
  const bad = await cm.processComposerLofiImage(42);
  assert.deepEqual(bad, { ok: false, message: "Arquivo inválido para processamento Lo-Fi." });
  const notUrl = await cm.processComposerLofiImage("http://x/y.png");
  assert.deepEqual(notUrl, { ok: false, message: "Formato de imagem inválido." });
});

test("composer-media — sem DOM devolve o data URL original marcado como leve", async () => {
  const saved = globalThis.document;
  delete globalThis.document;
  try {
    const r = await cm.processComposerLofiImage(PNG_URL, { filter: "vhs", aspect: "1:1" });
    assert.deepEqual(r, { ok: true, dataUrl: PNG_URL, byteLength: PNG_URL.length, filter: "vhs", aspect: "1:1", isUnder99Kb: true });
  } finally {
    if (saved !== undefined) globalThis.document = saved;
  }
});

test("composer-media — comprime em canvas, recorta pela proporção e informa dimensões e qualidade", async () => {
  const { canvases, cleanup } = mountMediaEnv({ width: 400, height: 300 });
  try {
    const r = await cm.processComposerLofiImage(PNG_URL, { aspect: "1:1" });
    assert.equal(r.ok, true);
    assert.equal(r.width, r.height, "proporção 1:1 gera destino quadrado");
    assert.equal(canvases[0].width, r.width);
    assert.equal(canvases[0].ctx.draws.length, 1, "uma imagem desenhada no canvas");
    assert.equal(r.byteLength, 1000);
    assert.equal(r.qualityUsed, 0.95);
    assert.equal(r.isUnder99Kb, true);
    assert.equal(r.aspect, "1:1");
    assert.ok(r.dataUrl.startsWith("data:image/webp;base64,"));
  } finally {
    cleanup();
  }
});

test("composer-media — arquivo (File) é lido com FileReader antes de comprimir", async () => {
  const { cleanup } = mountMediaEnv();
  try {
    const file = { slice() {}, type: "image/png", __dataUrl: PNG_URL };
    const r = await cm.processComposerLofiImage(file, { filter: "normal" });
    assert.equal(r.ok, true);
    assert.equal(r.filter, "normal");
    assert.equal(r.aspect, "original");
  } finally {
    cleanup();
  }
});

test("composer-media — canvas acima do teto reduz a qualidade por busca binária", async () => {
  const { canvases, cleanup } = mountMediaEnv({ width: 300, height: 200 }, { bytesFor: (q) => (q > 0.5 ? 500 * 1024 : 40 * 1024) });
  try {
    const r = await cm.processComposerLofiImage(PNG_URL);
    assert.equal(r.ok, true);
    assert.ok(r.qualityUsed <= 0.5, `qualidade ${r.qualityUsed} deve ficar sob o teto`);
    assert.ok(r.byteLength <= 40 * 1024);
    assert.ok(canvases[0].calls.length > 1, "várias tentativas de qualidade");
  } finally {
    cleanup();
  }
});

test("composer-media — falha ao decodificar a imagem vira erro; falha no canvas devolve o original", async () => {
  const failing = mountMediaEnv({ failDecode: true });
  try {
    const r = await cm.processComposerLofiImage(PNG_URL);
    assert.deepEqual(r, { ok: false, message: "Falha ao decodificar imagem para compressão Lo-Fi." });
  } finally {
    failing.cleanup();
  }
  const noCtx = mountMediaEnv({}, { noContext: true });
  try {
    const r = await cm.processComposerLofiImage(PNG_URL, { filter: "xerox" });
    assert.deepEqual(r, { ok: true, dataUrl: PNG_URL, byteLength: PNG_URL.length, filter: "xerox", aspect: "original", isUnder99Kb: true });
  } finally {
    noCtx.cleanup();
  }
});

test("composer-media — alt de publicação prefere o informado, depois título, corpo cortado e rótulo padrão", () => {
  assert.equal(cm.composerPreviewImageAltAttr(), 'alt=""');
  assert.equal(cm.resolveComposerPublishImageAlt({ imageAlt: "  Praça  ", title: "T" }), "Praça");
  assert.equal(cm.resolveComposerPublishImageAlt({ imageAlt: "", title: "T" }), "", "alt vazio explícito é decorativo");
  assert.equal(cm.resolveComposerPublishImageAlt({ title: " Título " }), "Título");
  assert.equal(cm.resolveComposerPublishImageAlt({ body: "b".repeat(200) }), "b".repeat(120));
  assert.equal(cm.resolveComposerPublishImageAlt(), "Foto");
});

test("composer-media — validadores de imagem, áudio e vídeo apontam o motivo da recusa", () => {
  assert.equal(cm.validateComposerImageFile(null).message, "Nenhum arquivo selecionado.");
  assert.match(cm.validateComposerImageFile({ type: "image/bmp", size: 5 }).message, /Formato não suportado/);
  assert.match(cm.validateComposerImageFile({ type: "image/png", size: cm.COMPOSER_IMAGE_MAX_BYTES + 1 }).message, /muito grande/);
  assert.match(cm.validateComposerImageFile({ type: "image/png", size: 0 }).message, /vazio/);
  assert.deepEqual(cm.validateComposerImageFile({ type: "IMAGE/PNG", size: 10 }), { ok: true });
  assert.equal(cm.validateComposerAudioFile(null).ok, false);
  assert.match(cm.validateComposerAudioFile({ type: "video/mp4", size: 5 }).message, /áudio não suportado/);
  assert.match(cm.validateComposerAudioFile({ type: "audio/ogg", size: cm.COMPOSER_AUDIO_MAX_BYTES + 1 }).message, /10 MB/);
  assert.match(cm.validateComposerAudioFile({ type: "audio/ogg", size: 0 }).message, /vazio/);
  assert.equal(cm.validateComposerVideoFile(undefined).ok, false);
  assert.match(cm.validateComposerVideoFile({ type: "audio/ogg", size: 5 }).message, /vídeo não suportado/);
  assert.match(cm.validateComposerVideoFile({ type: "video/mp4", size: cm.COMPOSER_VIDEO_MAX_BYTES + 1 }).message, /25 MB/);
  assert.match(cm.validateComposerVideoFile({ type: "video/mp4", size: 0 }).message, /vazio/);
  assert.deepEqual(cm.validateComposerVideoFile({ type: "video/webm", size: 9 }), { ok: true });
});

test("composer-media — dimensões: lado maior acima do teto é recusado e abaixo passa", () => {
  const max = cm.COMPOSER_IMAGE_MAX_DIMENSION;
  assert.deepEqual(cm.validateComposerImageDimensions(max, 10), { ok: true });
  const over = cm.validateComposerImageDimensions(10, max + 1);
  assert.equal(over.ok, false);
  assert.ok(over.message.includes(String(max)));
});
