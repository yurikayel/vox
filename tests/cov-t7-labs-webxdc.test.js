/**
 * @file Cobertura T7 de `labs/mofn-lab.js`, `labs/parado/webxdc-host.js` e `labs/parado/webxdc-loader.js`:
 * laboratório M-de-N com chaves efêmeras reais, host sandbox com iframe falso e leitura de .xdc (zip) montado em memória.
 */
import "./setup.js";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { renderMofnLab, wireMofnLab } from "../client/js/labs/mofn-lab.js";
import * as host from "../client/js/labs/parado/webxdc-host.js";
import * as loader from "../client/js/labs/parado/webxdc-loader.js";
import { installFakeDocument } from "./helpers/cov-t7-fake-dom.mjs";

/**
 * Raiz falsa do laboratório: campos de formulário, `outerHTML` do bloco e clique delegado.
 * @param {{ n?: string, m?: string, name?: string, text?: string }} [form] Valores dos campos.
 * @returns {{ root: object, click: (action: string) => Promise<void>, html: () => string }} Raiz e utilitários.
 */
function fakeLabRoot(form = {}) {
  const fields = { "#mofn-n": form.n, "#mofn-m": form.m, "#mofn-name": form.name, "#mofn-text": form.text };
  let outer = "";
  let handler;
  const root = {
    querySelector: (sel) => (sel === "#mofn-lab" ? { set outerHTML(v) { outer = v; } } : sel in fields ? { value: fields[sel] } : null),
    addEventListener: (_ev, fn) => { handler = fn; },
  };
  const click = async (action) => {
    handler({ target: { closest: () => (action ? { dataset: { mofn: action } } : null) } });
    await new Promise((r) => setTimeout(r, 120));
  };
  return { root, click, html: () => outer };
}

test("renderMofnLab - formulário, botões e mensagem inicial sem membros", () => {
  const html = renderMofnLab();
  assert.match(html, /id="mofn-n" type="number" min="2" max="8"/);
  for (const a of ["gen", "sign-m", "sign-m1", "tamper", "verify"]) assert.match(html, new RegExp(`data-mofn="${a}"`));
  assert.match(html, /Nenhum membro lab gerado/);
});

test("lab M-de-N - gerar, assinar com M, adulterar e verificar mostram o resultado de cada passo", async () => {
  const lab = fakeLabRoot({ n: "9", m: "0", name: "Coletivo <X>", text: "Texto A" });
  wireMofnLab(lab.root);
  await lab.click("");
  await lab.click("verify");
  assert.match(lab.html(), /Inválido/);
  await lab.click("sign-m");
  assert.match(lab.html(), /Gere membros lab primeiro/);
  await lab.click("tamper");
  assert.match(lab.html(), /Nada para adulterar|adulterado/);
  await lab.click("gen");
  assert.match(lab.html(), /Gerados 8 membros lab/);
  assert.equal((lab.html().match(/<li><code>/g) || []).length, 8);
  assert.match(lab.html(), /Coletivo &lt;X&gt;/);
  await lab.click("sign-m");
  assert.match(lab.html(), /Assinado por 2 membro\(s\)\. Limiar M=2/);
  await lab.click("verify");
  assert.match(lab.html(), /Válido: 2\/2/);
  await lab.click("tamper");
  assert.match(lab.html(), /adulterado/);
  await lab.click("verify");
  assert.match(lab.html(), /Inválido[\s\S]*0\/2/);
});

test("lab M-de-N - assinar com M−1 não atinge o limiar", async () => {
  const lab = fakeLabRoot({ n: "3", m: "3", name: "Trio", text: "x" });
  wireMofnLab(lab.root);
  await lab.click("gen");
  await lab.click("sign-m1");
  assert.match(lab.html(), /Assinado por 2 membro\(s\)\. Limiar M=3/);
  await lab.click("verify");
  assert.match(lab.html(), /Inválido[\s\S]*2\/3/);
  await lab.click("desconhecida");
});

test("validateWebxdcUpdate - aceita update válido e recusa os inválidos com mensagem", () => {
  assert.equal(host.validateWebxdcUpdate({ payload: 0 }), true);
  assert.throws(() => host.validateWebxdcUpdate(null), /deve ser um objeto/);
  assert.throws(() => host.validateWebxdcUpdate({}), /campo payload/);
  assert.throws(() => host.validateWebxdcUpdate({ payload: 1, info: "x".repeat(host.MAX_INFO_LEN + 1) }), /info não pode exceder 50/);
  assert.throws(() => host.validateWebxdcUpdate({ payload: 1, summary: "x".repeat(host.MAX_SUMMARY_LEN + 1) }), /summary não pode exceder 20/);
  assert.equal(host.validateWebxdcUpdate({ payload: 1, info: "x".repeat(50), summary: "y".repeat(20) }), true);
});

test("createSandboxedIframe - sem document devolve null; com document aplica sandbox estrito", () => {
  assert.equal(host.createSandboxedIframe("<p>"), null);
  const dom = installFakeDocument();
  try {
    const f = host.createSandboxedIframe("<p>oi</p>");
    assert.equal(f.getAttribute("sandbox"), "allow-scripts");
    assert.equal(f.getAttribute("referrerpolicy"), "no-referrer");
    assert.equal(f.srcdoc, "<p>oi</p>");
    assert.equal(f.className, "webxdc-cartridge-frame");
  } finally {
    dom.restore();
  }
});

/**
 * Host com `window.addEventListener` falso e container que guarda o iframe.
 * @returns {{ h: object, listeners: Function[], container: object, updates: Array, ready: number[], restore: Function }} Contexto do teste.
 */
function setupHost() {
  const dom = installFakeDocument();
  const listeners = [];
  const saved = [globalThis.addEventListener, globalThis.removeEventListener];
  globalThis.addEventListener = (_t, fn) => listeners.push(fn);
  globalThis.removeEventListener = (_t, fn) => listeners.splice(listeners.indexOf(fn), 1);
  const container = { kids: [], appendChild(k) { this.kids.push(k); k.parentElement = this; }, removeChild(k) { this.kids.splice(this.kids.indexOf(k), 1); } };
  const updates = [];
  const ready = [];
  const h = host.createWebxdcHost({ srcdoc: "<p>", container, instanceId: "i1", onSendUpdate: (u, d) => updates.push([u, d]), onReady: (s) => ready.push(s) });
  const restore = () => {
    [globalThis.addEventListener, globalThis.removeEventListener] = saved;
    dom.restore();
  };
  return { h, listeners, container, updates, ready, restore };
}

afterEach(() => {
  delete globalThis.addEventListener;
  delete globalThis.removeEventListener;
});

test("createWebxdcHost - anexa o iframe e repassa updates e ready só do iframe do cartucho", () => {
  const c = setupHost();
  try {
    assert.equal(c.h.instanceId, "i1");
    assert.deepEqual(c.container.kids, [c.h.iframe]);
    const posted = [];
    c.h.iframe.contentWindow = { postMessage: (m, o) => posted.push([m, o]) };
    const emit = (data, source = c.h.iframe.contentWindow) => c.listeners[0]({ source, data });
    emit({ type: "webxdc_send_update", update: { payload: 1 }, description: "d" });
    emit({ type: "webxdc_send_update", update: { payload: 2 } }, {});
    emit(null);
    emit("texto");
    emit({ type: "webxdc_ready", serial: "7" });
    emit({ type: "webxdc_ready" });
    assert.deepEqual(c.updates, [[{ payload: 1 }, "d"]]);
    assert.deepEqual(c.ready, [7, 0]);
    c.h.sendUpdate({ payload: 9 });
    assert.deepEqual(posted, [[{ type: "webxdc_update", update: { payload: 9 } }, "*"]]);
  } finally {
    c.restore();
  }
});

test("createWebxdcHost - update inválido é recusado e destroy remove ouvinte e iframe", () => {
  const c = setupHost();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    c.h.iframe.contentWindow = { postMessage() {} };
    c.listeners[0]({ source: c.h.iframe.contentWindow, data: { type: "webxdc_send_update", update: { sem: "payload" } } });
    assert.deepEqual(c.updates, []);
    assert.match(errors[0], /Validação do update Webxdc falhou: .*payload/);
    c.h.destroy();
    assert.deepEqual(c.listeners, []);
    assert.deepEqual(c.container.kids, []);
    assert.doesNotThrow(() => c.h.sendUpdate({ payload: 1 }));
  } finally {
    console.error = origErr;
    c.restore();
  }
});

test("createWebxdcHost - sem document não há iframe e o host ainda funciona", () => {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const h = host.createWebxdcHost({ srcdoc: "<p>" });
  assert.equal(h.iframe, null);
  assert.equal(h.instanceId, "cartucho_default");
  assert.doesNotThrow(() => { h.sendUpdate({}); h.destroy(); });
});

/**
 * Monta um zip em memória.
 * @param {Array<{ name: string, data: string, deflate?: boolean }>} files Entradas.
 * @returns {Uint8Array} Bytes do zip (só cabeçalhos locais, o que o leitor usa).
 */
function buildZip(files) {
  const parts = [];
  for (const f of files) {
    const raw = Buffer.from(f.data);
    const body = f.deflate ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(f.name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(f.deflate ? 8 : 0, 8);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    parts.push(head, name, body);
  }
  return new Uint8Array(Buffer.concat(parts));
}

test("parseZipEntries - lê entradas guardadas e comprimidas, ignora pastas e normaliza barras", async () => {
  const zip = buildZip([
    { name: "index.html", data: "<html></html>" },
    { name: "app\\main.js", data: "console.log(1)".repeat(20), deflate: true },
    { name: "pasta/", data: "" },
  ]);
  const entries = await loader.parseZipEntries(zip);
  assert.deepEqual(Object.keys(entries).sort(), ["app/main.js", "index.html"]);
  assert.equal(new TextDecoder().decode(entries["index.html"]), "<html></html>");
  assert.equal(new TextDecoder().decode(entries["app/main.js"]), "console.log(1)".repeat(20));
  assert.deepEqual(await loader.parseZipEntries(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)).then(Object.keys), ["index.html", "app/main.js"]);
});

test("detectMimeType / bufferToDataUrl - extensão conhecida, desconhecida e base64", () => {
  assert.equal(loader.detectMimeType("a.PNG"), "image/png");
  assert.equal(loader.detectMimeType("f.woff2"), "font/woff2");
  assert.equal(loader.detectMimeType("sem-extensao"), "application/octet-stream");
  assert.equal(loader.bufferToDataUrl(new Uint8Array([104, 105]), "text/plain"), "data:text/plain;base64,aGk=");
  assert.equal(loader.bufferToDataUrl([104], undefined), "data:application/octet-stream;base64,aA==");
});

test("buildWebxdcBridgeScript - embute nome e endereço como JSON seguro", () => {
  const s = loader.buildWebxdcBridgeScript('Ana "A"', "vx_ana");
  assert.match(s, /selfName: "Ana \\"A\\"", selfAddr: "vx_ana"/);
  assert.match(s, /webxdc_send_update/);
  assert.match(loader.buildWebxdcBridgeScript(), /"Cidadão Vox"[\s\S]*"vx_local"/);
});

test("inlineCartridgeAssets - embute CSS e JS locais, troca imagens por data URL e preserva externos", () => {
  const enc = (t) => new TextEncoder().encode(t);
  const html = '<link rel="stylesheet" href="./s.css"><link rel="stylesheet" href="fora.css"><script src="a.js"></script><script src="nao.js"></script><img src="i.png">';
  const out = loader.inlineCartridgeAssets(html, { "s.css": enc("body{}"), "a.js": enc("var a=1;"), "i.png": new Uint8Array([1, 2]) });
  assert.match(out, /<style>\/\* inlined: s\.css \*\/\nbody\{\}<\/style>/);
  assert.match(out, /<script>\/\* inlined: a\.js \*\/\nvar a=1;<\/script>/);
  assert.match(out, /href="fora\.css"/);
  assert.match(out, /src="nao\.js"/);
  assert.match(out, /<img src="data:image\/png;base64,AQI=">/);
});

test("prepareSandboxedSrcdoc - injeta CSP, prelúdio e bridge no <head> ou cria um; sem index falha", () => {
  const enc = (t) => new TextEncoder().encode(t);
  const withHead = loader.prepareSandboxedSrcdoc({ "index.html": enc("<html><head></head><body>x</body></html>") }, { selfName: "Bia", selfAddr: "vx_bia" });
  assert.match(withHead, /<head>\n<meta[^>]*Content-Security-Policy/i);
  assert.match(withHead, /selfName: "Bia"/);
  const noHead = loader.prepareSandboxedSrcdoc({ "./index.html": enc("<body>y</body>") });
  assert.ok(noHead.startsWith("<head><meta"));
  assert.match(noHead, /<\/head>\n<body>y<\/body>/);
  assert.throws(() => loader.prepareSandboxedSrcdoc({}), /index\.html não encontrado/);
});

test("inlineCartridgeAssets - troca só a referência exata da imagem, com ou sem ./, em atributo e em url()", () => {
  const html = '<img src="./i.png"><img src="ai.png"><style>.b{background:url("i.png")}</style><p>arquivo i.png</p>';
  const out = loader.inlineCartridgeAssets(html, { "i.png": new Uint8Array([1, 2]), "ai.png": new Uint8Array([3]) });
  assert.match(out, /<img src="data:image\/png;base64,AQI=">/, "./i.png vira data URL inteira, sem sobrar ./");
  assert.match(out, /<img src="data:image\/png;base64,Aw==">/, "ai.png recebe a própria imagem, não a de i.png");
  assert.match(out, /url\("data:image\/png;base64,AQI="\)/);
  assert.match(out, /<p>arquivo i\.png<\/p>/, "texto comum não é tocado");
});
