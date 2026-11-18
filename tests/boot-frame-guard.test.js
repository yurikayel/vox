/**
 * THREAT-MODEL T33: lógica do `boot-frame-guard.js` (sem DOM pesado do navegador).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("T33: index referencia frame-guard no boot (RED na base)", () => {
  const html = fs.readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  assert.ok(html.includes('src="boot-frame-guard.js"'), "boot-frame-guard precisa carregar cedo no index");
});

function readFrameGuardSource() {
  return fs.readFileSync(new URL("../client/boot-frame-guard.js", import.meta.url), "utf8");
}

/**
 * Carrega o boot numa sandbox e devolve a API exposta em `globalThis.__VOX_FRAME_GUARD__`.
 *
 * @param {object} options Opções da sandbox.
 * @param {boolean} [options.skipAuto=true] Não roda o boot automático.
 * @param {Window} [options.window] Janela falsa.
 * @param {Document} [options.document] Documento falso.
 * @returns {object} Funções de teste do frame guard.
 */
function loadFrameGuard({ skipAuto = true, window: win, document: doc } = {}) {
  const sandbox = {
    console,
    __VOX_FRAME_GUARD_SKIP_AUTO__: skipAuto,
    document: doc,
    location: win?.location,
    top: win?.top,
    globalThis: null,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFrameGuardSource(), sandbox, { filename: "boot-frame-guard.js" });
  return sandbox.__VOX_FRAME_GUARD__;
}

function mockDocument() {
  const nodes = new Map();
  for (const id of ["app-root", "modal-container", "post-media-lightbox"]) {
    nodes.set(id, { id, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } });
  }
  const html = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const body = { children: [], prepend(el) { this.children.unshift(el); } };
  return {
    nodes,
    html,
    body,
    getElementById(id) {
      if (id === "vox-frame-guard") return nodes.get("vox-frame-guard") ?? null;
      return nodes.get(id) ?? null;
    },
    createElement(tag) {
      const el = {
        tag,
        id: "",
        attrs: {},
        style: { cssText: "" },
        children: [],
        setAttribute(k, v) { this.attrs[k] = v; },
        append(...kids) { this.children.push(...kids); },
      };
      return el;
    },
    documentElement: html,
  };
}

function mockWindow({ href, topSame }) {
  if (topSame) {
    const w = { location: { href }, top: null };
    w.top = w;
    return w;
  }
  return { location: { href }, top: {} };
}

test("T33: topo próprio não aplica proteção", () => {
  const api = loadFrameGuard();
  const win = mockWindow({ href: "https://yurikayel.github.io/vox/", topSame: true });
  assert.equal(api.isFramed(win), false);
  const doc = mockDocument();
  assert.equal(api.applyFrameGuard(doc, win), false);
  assert.equal(doc.nodes.get("app-root").attrs.hidden, undefined);
});

test("T33: iframe detectado e UI principal fica oculta com aviso", () => {
  const api = loadFrameGuard();
  const href = "https://yurikayel.github.io/vox/#/c/demo";
  const win = mockWindow({ href, topSame: false });
  assert.equal(api.isFramed(win), true);
  const doc = mockDocument();
  assert.equal(api.applyFrameGuard(doc, win), true);
  assert.equal(doc.nodes.get("app-root").attrs.hidden, "");
  assert.equal(doc.html.attrs["data-vox-frame-guard"], "");
  const banner = doc.body.children[0];
  assert.equal(banner.id, "vox-frame-guard");
  assert.equal(banner.attrs.role, "alert");
  const link = banner.children.find((n) => n.tag === "a");
  assert.equal(link.href, href);
  assert.equal(link.attrs.target, "_top");
  assert.equal(link.attrs.rel, "noopener noreferrer");
});

test("T33: acesso ao top bloqueado conta como moldura", () => {
  const api = loadFrameGuard();
  const win = {
    location: { href: "https://evil.test/vox/" },
    get top() {
      throw new Error("cross-origin");
    },
  };
  assert.equal(api.isFramed(win), true);
});

test("T33: index.html carrega o boot cedo no head", () => {
  const html = fs.readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  const guardPos = html.indexOf('src="boot-frame-guard.js"');
  const appPos = html.indexOf('src="js/app.js"');
  const swPos = html.indexOf('src="js/boot-sw.js"');
  assert.ok(guardPos > 0, "boot-frame-guard.js precisa estar no index");
  assert.ok(guardPos < appPos, "frame guard antes do app");
  assert.ok(guardPos < swPos, "frame guard antes do boot-sw");
});