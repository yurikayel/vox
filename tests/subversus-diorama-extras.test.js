/**
 * @file Extras da lente Diorama (gestos e picking) carregados sob demanda por `import()` dinâmico.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadDioramaExtras } from "../client/js/dungeon/diorama/diorama-extras.js";
import { attachDioramaOverlay } from "../client/js/dungeon/diorama/diorama-view.js";
import { createFloorDoc } from "../client/js/dungeon/vtt-scene-schema.js";

/** Import ou re-export estático de input/pick, inclusive com a lista de nomes quebrada em várias linhas. */
const STATIC_EXTRA_IMPORT = /^\s*(?:import|export)\b[^;]*?\bfrom\s*["'][^"']*diorama-(?:input|pick)\.js["']/m;

test("extras: a regex pega import estático em uma ou várias linhas e ignora import() dinâmico", () => {
  assert.match('import { a } from "./diorama-input.js";', STATIC_EXTRA_IMPORT);
  assert.match(`import {
  a,
  b,
} from "./diorama-pick.js";`, STATIC_EXTRA_IMPORT);
  assert.match(`export {
  pickDioramaTarget,
} from "./diorama-pick.js";`, STATIC_EXTRA_IMPORT);
  assert.doesNotMatch('const m = await import("./diorama-input.js");', STATIC_EXTRA_IMPORT);
  assert.doesNotMatch('import { a } from "./diorama-math.js";', STATIC_EXTRA_IMPORT);
});

test("extras: o núcleo (diorama-view) não importa input nem pick de forma estática", () => {
  const src = readFileSync(new URL("../client/js/dungeon/diorama/diorama-view.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, STATIC_EXTRA_IMPORT);
  const loader = readFileSync(new URL("../client/js/dungeon/diorama/diorama-extras.js", import.meta.url), "utf8");
  assert.match(loader, /import\("\.\/diorama-input\.js"\)/);
});

test("extras: loadDioramaExtras entrega gestos e picking e reaproveita o carregamento", async () => {
  const first = loadDioramaExtras();
  assert.equal(loadDioramaExtras(), first);
  const extras = await first;
  for (const key of ["attachDioramaGestures", "unprojectRay", "pickDioramaScene"]) assert.equal(typeof extras[key], "function");
  assert.equal(typeof extras.DIORAMA_KEYS_HELP, "string");
});

test("extras: sem eles o overlay desenha, mas não liga gestos nem clique", () => {
  const listeners = {};
  const gl = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => new Proxy({}, { get: () => () => true }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }), setAttribute() {},
    addEventListener: (n, fn) => { listeners[n] = fn; }, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: (t) => (t === "div" ? { dataset: {}, style: {}, setAttribute() {}, remove() {} } : gl) } };
  const overlay = attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "gm", storage: null });
  assert.doesNotThrow(() => overlay.draw());
  assert.equal(listeners.pointerdown, undefined);
});

test("extras: o canvas GL tem aria-label mesmo sem extras", () => {
  const attrs = {};
  const gl = { dataset: {}, style: {}, width: 800, height: 500, parentNode: null, getContext: () => new Proxy({}, { get: () => () => true }),
    setAttribute: (k, v) => { attrs[k] = v; }, addEventListener() {}, removeEventListener() {}, remove() {} };
  const host = { style: {}, appendChild: (c) => { c.parentNode = host; }, querySelector: () => null };
  const base = { width: 800, height: 500, parentNode: host, ownerDocument: { createElement: (t) => (t === "div" ? { dataset: {}, style: {}, setAttribute() {}, remove() {} } : gl) } };
  attachDioramaOverlay(base, createFloorDoc({}), { mode: "3d", viewerRole: "gm", storage: null });
  assert.ok(attrs["aria-label"]?.length > 0);
});
