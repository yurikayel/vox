import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as webxdcLoader from "../client/js/webxdc-loader.js";
import * as webxdcHost from "../client/js/webxdc-host.js";

test("webxdc-loader - detecta mime types e gera data URLs de ativos", () => {
  assert.equal(webxdcLoader.detectMimeType("icon.png"), "image/png");
  assert.equal(webxdcLoader.detectMimeType("styles.css"), "text/css");
  assert.equal(webxdcLoader.detectMimeType("app.js"), "text/javascript");
  assert.equal(webxdcLoader.detectMimeType("font.woff2"), "font/woff2");

  const bytes = new TextEncoder().encode("teste");
  const dataUrl = webxdcLoader.bufferToDataUrl(bytes, "text/plain");
  assert.ok(dataUrl.startsWith("data:text/plain;base64,"));
});

test("webxdc-loader - faz inlining de CSS, JS e converte imagens em Data URLs", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="stylesheet" href="./style.css">
      </head>
      <body>
        <img src="logo.png" alt="Logo">
        <script src="./app.js"></script>
      </body>
    </html>
  `.trim();

  const entries = {
    "style.css": new TextEncoder().encode("body { margin: 0; }"),
    "app.js": new TextEncoder().encode("console.log('App rodando');"),
    "logo.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };

  const inlined = webxdcLoader.inlineCartridgeAssets(html, entries);

  // CSS deve estar embutido em <style>
  assert.ok(inlined.includes("<style>/* inlined: style.css */\nbody { margin: 0; }</style>"));
  assert.ok(!inlined.includes('<link rel="stylesheet"'));

  // JS deve estar embutido em <script>
  assert.ok(inlined.includes("<script>/* inlined: app.js */\nconsole.log('App rodando');</script>"));
  assert.ok(!inlined.includes('<script src='));

  // Imagem deve estar convertida em Data URL
  assert.ok(inlined.includes('data:image/png;base64,'));
  assert.ok(!inlined.includes('src="logo.png"'));
});

test("webxdc-loader - injeta CSP rede-zero, prelude WebRTC block e bridge webxdc", () => {
  const entries = {
    "index.html": new TextEncoder().encode("<!DOCTYPE html><html><head></head><body><h1>Cartucho</h1></body></html>"),
  };

  const srcdoc = webxdcLoader.prepareSandboxedSrcdoc(entries, {
    selfName: "Maria Padeira",
    selfAddr: "vx_ed25519_maria",
  });

  // CSP de rede zero
  assert.ok(srcdoc.includes("connect-src 'none'"));
  assert.ok(srcdoc.includes("default-src 'none'"));

  // Bloqueio WebRTC
  assert.ok(srcdoc.includes("RTCPeerConnection"));
  assert.ok(srcdoc.includes("webkitRTCPeerConnection"));
  assert.ok(srcdoc.includes("sendBeacon"));

  // Bridge do webxdc
  assert.ok(srcdoc.includes("window.webxdc"));
  assert.ok(srcdoc.includes('"Maria Padeira"'));
  assert.ok(srcdoc.includes('"vx_ed25519_maria"'));
});

test("webxdc-host - valida esquema e limites de tamanho em updates", () => {
  assert.throws(() => webxdcHost.validateWebxdcUpdate(null), /objeto/);
  assert.throws(() => webxdcHost.validateWebxdcUpdate({}), /payload/);

  // Limite de 50 caracteres no info
  const longInfo = "a".repeat(51);
  assert.throws(
    () => webxdcHost.validateWebxdcUpdate({ payload: "ok", info: longInfo }),
    /info não pode exceder 50/
  );

  // Limite de 20 caracteres no summary
  const longSummary = "s".repeat(21);
  assert.throws(
    () => webxdcHost.validateWebxdcUpdate({ payload: "ok", summary: longSummary }),
    /summary não pode exceder 20/
  );

  // Válido
  assert.equal(
    webxdcHost.validateWebxdcUpdate({
      payload: { itemId: 123, preco: 15.0 },
      info: "Nova torta adicionada",
      summary: "Feira de Doces",
    }),
    true
  );
});

test("webxdc-host - cria iframe com sandbox estrito sem allow-same-origin", () => {
  // Simula ambiente document mínimo
  const mockIframe = {
    className: "",
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
  };

  globalThis.document = {
    createElement(tag) {
      if (tag === "iframe") return { ...mockIframe };
      return {};
    },
  };

  const iframe = webxdcHost.createSandboxedIframe("<h1>Teste</h1>");
  assert.equal(iframe.getAttribute("sandbox"), "allow-scripts");
  assert.equal(iframe.getAttribute("referrerpolicy"), "no-referrer");
  assert.equal(iframe.srcdoc, "<h1>Teste</h1>");

  delete globalThis.document;
});
