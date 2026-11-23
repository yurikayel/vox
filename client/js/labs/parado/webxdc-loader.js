/**
 * webxdc-loader.js — Parser de Pacotes .xdc (ZIP) e Inlining para Sandbox (Vox)
 *
 * Implementa:
 * 1. Descompactação ZIP nativa em memória usando DecompressionStream (deflate-raw);
 * 2. Inlining automático de <script> e <style> para contornar restrições cross-origin;
 * 3. Conversão de ativos binários (imagens/fontes) em Data URLs (data:...;base64);
 * 4. Injeção de Prelude de bloqueio WebRTC e CSP de rede zero (connect-src 'none').
 */

/**
 * Operação `PRELUDE_SCRIPT` do módulo.
 * @type {*}
 */
export const PRELUDE_SCRIPT = `
(function() {
  try {
    Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, writable: false });
    Object.defineProperty(window, 'webkitRTCPeerConnection', { value: undefined, writable: false });
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, writable: false });
  } catch(e) {}
})();
`.trim();

/**
 * Operação `CSP_META_TAG` do módulo.
 * @type {*}
 */
export const CSP_META_TAG =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' data:; style-src \'unsafe-inline\' data:; img-src data:; font-src data:; media-src data:; connect-src \'none\';">';

/**
 * Operação `MIME_TYPES` do módulo.
 * @type {*}
 */
export const MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  gif: "image/gif",
  webp: "image/webp",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
};

/**
 * Operação `decompressDeflateRaw` do módulo.
 * @param {*} [bytes] Parâmetro `bytes`.
 * @returns {*} Resultado da operação.
 */
export async function decompressDeflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream não suportado neste ambiente");
  }
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concatChunks(chunks);
}

function concatChunks(chunks) {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Operação `parseZipEntries` do módulo.
 * @param {*} [buffer] Parâmetro `buffer`.
 * @returns {*} Resultado da operação.
 */
export async function parseZipEntries(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const entries = {};

  while (pos < bytes.length - 4) {
    const sig = view.getUint32(pos, true);
    if (sig === 0x04034b50) {
      const { entry, nextPos } = await parseLocalHeader(bytes, view, pos);
      if (entry) entries[entry.name] = entry.data;
      pos = nextPos;
    } else {
      pos++;
    }
  }
  return entries;
}

async function parseLocalHeader(bytes, view, pos) {
  const method = view.getUint16(pos + 8, true);
  const compSize = view.getUint32(pos + 18, true);
  const nameLen = view.getUint16(pos + 26, true);
  const extraLen = view.getUint16(pos + 28, true);

  const nameBytes = bytes.slice(pos + 30, pos + 30 + nameLen);
  const name = new TextDecoder().decode(nameBytes).replace(/\\/g, "/");
  const dataStart = pos + 30 + nameLen + extraLen;
  const compData = bytes.slice(dataStart, dataStart + compSize);

  let data = null;
  if (!name.endsWith("/")) {
    if (method === 0) {
      data = compData;
    } else if (method === 8) {
      data = await decompressDeflateRaw(compData);
    }
  }
  return { entry: data ? { name, data } : null, nextPos: dataStart + compSize };
}

/**
 * Operação `bufferToDataUrl` do módulo.
 * @param {*} [bytes] Parâmetro `bytes`.
 * @param {*} [mimeType] Parâmetro `mimeType`.
 * @returns {*} Resultado da operação.
 */
export function bufferToDataUrl(bytes, mimeType = "application/octet-stream") {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return `data:${mimeType};base64,${btoa(bin)}`;
}

/**
 * Operação `detectMimeType` do módulo.
 * @param {*} [filename] Parâmetro `filename`.
 * @returns {*} Resultado da operação.
 */
export function detectMimeType(filename) {
  const ext = String(filename).split(".").pop().toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Operação `buildWebxdcBridgeScript` do módulo.
 * @param {*} [selfName] Parâmetro `selfName`.
 * @param {*} [selfAddr] Parâmetro `selfAddr`.
 * @returns {*} Resultado da operação.
 */
export function buildWebxdcBridgeScript(selfName = "Cidadão Vox", selfAddr = "vx_local") {
  const jsonName = JSON.stringify(selfName);
  const jsonAddr = JSON.stringify(selfAddr);
  return `<script>
(function() {
  var listeners = [];
  window.webxdc = {
    selfName: ${jsonName}, selfAddr: ${jsonAddr},
    sendUpdate: function(u, d) { window.parent.postMessage({ type: "webxdc_send_update", update: u, description: d || "" }, "*"); },
    setUpdateListener: function(cb, s) {
      listeners.push(cb);
      window.parent.postMessage({ type: "webxdc_ready", serial: s || 0 }, "*");
      return Promise.resolve();
    }
  };
  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "webxdc_update" && e.data.update) {
      listeners.forEach(function(cb) { try { cb(e.data.update); } catch(err) {} });
    }
  });
})();
</script>`.trim();
}

/**
 * Operação `inlineCartridgeAssets` do módulo.
 * @param {*} [html] Parâmetro `html`.
 * @param {*} [entries] Parâmetro `entries`.
 * @returns {*} Resultado da operação.
 */
export function inlineCartridgeAssets(html, entries) {
  let processed = html;

  // Inlining de CSS
  processed = processed.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    const cleanHref = href.replace(/^\.\//, "");
    if (entries[cleanHref]) {
      const css = new TextDecoder().decode(entries[cleanHref]);
      return `<style>/* inlined: ${cleanHref} */\n${css}</style>`;
    }
    return match;
  });

  // Inlining de JS
  processed = processed.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
    const cleanSrc = src.replace(/^\.\//, "");
    if (entries[cleanSrc]) {
      const js = new TextDecoder().decode(entries[cleanSrc]);
      return `<script>/* inlined: ${cleanSrc} */\n${js}</script>`;
    }
    return match;
  });

  return inlineImageRefs(processed, entries);
}

const IMAGE_FILE_RE = /\.(png|jpg|jpeg|svg|gif|webp)$/i;

/**
 * Data URL da imagem do cartucho referida por `ref` (com ou sem `./`), ou `null` se não for imagem do pacote.
 * @param {string} ref Referência como escrita no HTML ou CSS.
 * @param {Record<string, Uint8Array>} entries Arquivos do cartucho.
 * @returns {string|null} Data URL ou `null`.
 */
function imageDataUrlFor(ref, entries) {
  const clean = ref.replace(/^\.\//, "");
  if (!IMAGE_FILE_RE.test(clean) || !entries[clean]) return null;
  return bufferToDataUrl(entries[clean], detectMimeType(clean));
}

/**
 * Troca por data URL só as referências exatas a imagens do cartucho: valor de `src`/`href` e `url(...)`.
 * Texto comum e nomes que só contêm o de outra imagem (`ai.png` x `i.png`) ficam como estão.
 * @param {string} html HTML já com CSS e JS embutidos.
 * @param {Record<string, Uint8Array>} entries Arquivos do cartucho.
 * @returns {string} HTML com as imagens embutidas.
 */
function inlineImageRefs(html, entries) {
  return html
    .replace(/(\s(?:src|href)=)(["'])([^"']+)\2/gi, (match, attr, quote, ref) => {
      const dataUrl = imageDataUrlFor(ref, entries);
      return dataUrl ? `${attr}${quote}${dataUrl}${quote}` : match;
    })
    .replace(/url\((["']?)([^"')]+)\1\)/gi, (match, quote, ref) => {
      const dataUrl = imageDataUrlFor(ref, entries);
      return dataUrl ? `url(${quote}${dataUrl}${quote})` : match;
    });
}

/**
 * Operação `prepareSandboxedSrcdoc` do módulo.
 * @param {*} [entries] Parâmetro `entries`.
 * @param {Object} [options] `selfName` e `selfAddr` do bridge sandbox.
 * @returns {*} Resultado da operação.
 */
export function prepareSandboxedSrcdoc(entries, { selfName = "Cidadão Vox", selfAddr = "vx_local" } = {}) {
  const indexFile = entries["index.html"] || entries["./index.html"];
  if (!indexFile) {
    throw new Error("Pacote .xdc inválido: index.html não encontrado na raiz");
  }

  let html = new TextDecoder().decode(indexFile);
  html = inlineCartridgeAssets(html, entries);

  const headInjections = `${CSP_META_TAG}\n<script>${PRELUDE_SCRIPT}</script>\n${buildWebxdcBridgeScript(selfName, selfAddr)}`;

  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n${headInjections}`);
  } else {
    html = `<head>${headInjections}</head>\n${html}`;
  }
  return html;
}
