/**
 * @file JPEG com a marca EXIF Orientation (foto de celular de pé): o cabeçalho dá a largura e a altura do sensor, mas o
 * navegador decodifica já girada. Com a Orientation 5 a 8 o tamanho lido troca largura e altura; 1 a 4 e sem EXIF não.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { checkMapUpload, readImageSize } from "../client/js/dungeon/map-image-size.js";

const text = (s) => [...s].map((c) => c.charCodeAt(0));

/** Entrada de 12 bytes da tag Orientation: tag, tipo SHORT, contagem 1 e o valor nos 2 primeiros bytes do campo. */
function entry(o, big) {
  const w16 = (n) => (big ? [n >> 8, n & 255] : [n & 255, n >> 8]);
  return [...w16(0x0112), ...w16(3), ...(big ? [0, 0, 0, 1] : [1, 0, 0, 0]), ...w16(o), 0, 0];
}

/** APP1 completo: marcador, tamanho, "Exif\0\0", cabeçalho TIFF e um IFD com a Orientation. */
function app1(o, big = true) {
  const head = [...text(big ? "MM" : "II"), ...(big ? [0, 42, 0, 0, 0, 8, 0, 1] : [42, 0, 8, 0, 0, 0, 1, 0])];
  const body = [...text("Exif"), 0, 0, ...head, ...entry(o, big), 0, 0, 0, 0];
  return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
}

/** JPEG mínimo `w`×`h` no cabeçalho (SOF0), com o APP1 dado antes dele. */
const jpeg = (w, h, segmentos = []) => new Uint8Array([0xff, 0xd8, ...segmentos, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);

test("Orientation 5 a 8: largura e altura trocam (foto de pé)", () => {
  for (const o of [5, 6, 7, 8]) {
    assert.deepEqual(readImageSize(jpeg(1200, 800, app1(o))), { width: 800, height: 1200 }, `Orientation ${o}`);
  }
});

test("Orientation 1 a 4 e JPEG sem EXIF: o tamanho do cabeçalho vale como está", () => {
  for (const o of [1, 2, 3, 4]) {
    assert.deepEqual(readImageSize(jpeg(1200, 800, app1(o))), { width: 1200, height: 800 }, `Orientation ${o}`);
  }
  assert.deepEqual(readImageSize(jpeg(1200, 800)), { width: 1200, height: 800 });
});

test("a ordem de bytes Intel também é lida", () => {
  assert.deepEqual(readImageSize(jpeg(1200, 800, app1(6, false))), { width: 800, height: 1200 });
  assert.deepEqual(readImageSize(jpeg(1200, 800, app1(1, false))), { width: 1200, height: 800 });
});

test("o piso guarda o tamanho já girado: 300×200 com Orientation 6 é 200×300 e sobe para 256×384", () => {
  const r = checkMapUpload(jpeg(300, 200, app1(6)));
  assert.deepEqual([r.widthPx, r.heightPx], [256, 384]);
});

test("EXIF torto não derruba a leitura: o tamanho do cabeçalho vale", () => {
  const truncado = app1(6).slice(0, 18);
  truncado[3] = truncado.length - 2;
  assert.deepEqual(readImageSize(jpeg(1200, 800, truncado)), { width: 1200, height: 800 });
  assert.deepEqual(readImageSize(jpeg(1200, 800, app1(9))), { width: 1200, height: 800 }, "valor fora de 1..8");
});
