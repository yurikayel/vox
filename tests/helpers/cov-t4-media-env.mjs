/**
 * @file Ambiente de mídia de mentira (FileReader, Image e canvas) para os testes de cobertura do lote T4.
 *
 * O Node não traz `FileReader` nem `Image`; aqui cada fake devolve valores determinísticos
 * para o teste conferir o que o módulo repassa (data URL, dimensões, tamanho em bytes).
 *
 * @module tests/helpers/cov-t4-media-env
 */
import { FakeEl } from "./cov-t4-dom.mjs";

/**
 * Instala `FileReader` que lê `file.__dataUrl` (ou falha quando `file.__fail` está definido).
 * @returns {() => void} Função que restaura o global anterior.
 */
export function installFakeFileReader() {
  const previous = globalThis.FileReader;
  globalThis.FileReader = class FakeFileReader {
    readAsDataURL(file) {
      queueMicrotask(() => {
        if (file.__fail) {
          this.error = new Error("leitura falhou");
          this.onerror?.();
          return;
        }
        this.result = file.__dataUrl ?? `data:${file.type};base64,QUJD`;
        this.onload?.();
      });
    }
  };
  return () => { globalThis.FileReader = previous; };
}

/**
 * Instala `Image` que dispara `onload` (ou `onerror` se `failDecode`) ao receber `src`.
 * @param {{ width?: number, height?: number, failDecode?: boolean }} [cfg] Dimensões naturais e modo de falha.
 * @returns {() => void} Função que restaura o global anterior.
 */
export function installFakeImage({ width = 400, height = 300, failDecode = false } = {}) {
  const previous = globalThis.Image;
  globalThis.Image = class FakeImage {
    set src(value) {
      this.naturalWidth = width;
      this.naturalHeight = height;
      this.loadedSrc = value;
      queueMicrotask(() => (failDecode ? this.onerror?.() : this.onload?.()));
    }
  };
  return () => { globalThis.Image = previous; };
}

/**
 * Cria um canvas de mentira cuja `toDataURL` devolve `bytesFor(qualidade)` bytes de payload base64.
 * @param {{ bytesFor?: (quality: number) => number, noContext?: boolean }} [cfg] Tamanho por qualidade e falha de contexto.
 * @returns {FakeEl} Canvas com `calls` (qualidades pedidas) e `ctx.draws`.
 */
export function makeFakeCanvas({ bytesFor = () => 1000, noContext = false } = {}) {
  const canvas = new FakeEl("", { tag: "CANVAS" });
  canvas.calls = [];
  canvas.ctx = { draws: [], drawImage(...args) { this.draws.push(args); } };
  canvas.getContext = () => (noContext ? null : canvas.ctx);
  canvas.toDataURL = (mime, quality) => {
    canvas.calls.push(quality);
    return `data:${mime};base64,${"A".repeat(Math.ceil((bytesFor(quality) * 4) / 3))}`;
  };
  return canvas;
}
