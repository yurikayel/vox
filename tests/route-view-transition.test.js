/**
 * View Transition segura na troca de rotas (`client/js/app/route.js`),
 * respeitando `prefers-reduced-motion` e a invariante de a11y (`announceRoute` + foco no `h1`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

function createMockEl(tag = "div") {
  const attrs = new Map();
  return {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    innerHTML: "",
    children: [],
    style: {},
    focused: 0,
    hasAttribute: (k) => attrs.has(k),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    focus() {
      this.focused += 1;
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    remove() {},
  };
}

const mockRoot = createMockEl("div");
mockRoot.id = "app-root";
const mockMain = createMockEl("main");
mockMain.id = "app-main";
let activeH1 = null;

const mockDocument = {
  title: "Vox",
  body: createMockEl("body"),
  createElement: (tag) => createMockEl(tag),
  getElementById: (id) => {
    if (id === "app-root") return mockRoot;
    if (id === "app-main") return mockMain;
    return null;
  },
  querySelector: (sel) => (sel.includes("h1") ? activeH1 : null),
  querySelectorAll: () => [],
};

globalThis.document = mockDocument;

const { CANTINA_STORAGE_KEY } = await import("../client/js/app/cantina-gate.js");
const {
  canUseViewTransition,
  runWithViewTransition,
  routeImpl,
} = await import("../client/js/app/route.js");

function withRouteEnv({ hash, startViewTransition, reducedMotion }, fn) {
  const loc = { hash, search: "" };
  const prevWin = globalThis.window;
  const prevLoc = globalThis.location;
  const prevMatchMedia = globalThis.matchMedia;
  const prevStart = mockDocument.startViewTransition;

  mockMain.innerHTML = "";
  mockDocument.title = "Vox";
  activeH1 = createMockEl("h1");
  localStorage.setItem(CANTINA_STORAGE_KEY, "true");

  if (startViewTransition === undefined) delete mockDocument.startViewTransition;
  else mockDocument.startViewTransition = startViewTransition;

  globalThis.matchMedia = (q) => ({
    matches: Boolean(reducedMotion) && q.includes("prefers-reduced-motion: reduce"),
  });
  globalThis.window = {
    location: loc,
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.location = loc;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.window = prevWin;
      globalThis.location = prevLoc;
      globalThis.matchMedia = prevMatchMedia;
      if (prevStart === undefined) delete mockDocument.startViewTransition;
      else mockDocument.startViewTransition = prevStart;
    });
}

test("view transition: API ausente retorna false e executa fallback direto", async () => {
  const doc = {};
  const env = { matchMedia: () => ({ matches: false }) };
  assert.equal(canUseViewTransition(doc, env), false);
  let ran = 0;
  const out = await runWithViewTransition(() => {
    ran += 1;
    return "ok";
  }, doc, env);
  assert.equal(ran, 1);
  assert.equal(out, "ok");
});

test("view transition: prefers-reduced-motion ativo NÃO chama startViewTransition", async () => {
  let vtCalls = 0;
  const doc = {
    startViewTransition(cb) {
      vtCalls += 1;
      return { updateCallbackDone: Promise.resolve(cb()) };
    },
  };
  const env = { matchMedia: () => ({ matches: true }) };
  assert.equal(canUseViewTransition(doc, env), false);
  const out = await runWithViewTransition(() => "direct", doc, env);
  assert.equal(vtCalls, 0);
  assert.equal(out, "direct");
});

test("view transition: sem reduced-motion não espera finished nem falha em AbortError", async () => {
  let vtCalls = 0;
  const neverResolves = new Promise(() => {});
  const aborted = Promise.reject(new Error("AbortError"));
  const doc = {
    startViewTransition(cb) {
      vtCalls += 1;
      return {
        updateCallbackDone: Promise.resolve(cb()),
        ready: aborted,
        finished: neverResolves,
      };
    },
  };
  const env = { matchMedia: () => ({ matches: false }) };
  const out = await runWithViewTransition(() => "wrapped", doc, env);
  assert.equal(vtCalls, 1);
  assert.equal(out, "wrapped");
});

test("view transition: erro síncrono em startViewTransition cai no fallback gracioso", async () => {
  let ran = 0;
  const doc = {
    startViewTransition() {
      throw new Error("InvalidStateError");
    },
  };
  const env = { matchMedia: () => ({ matches: false }) };
  const out = await runWithViewTransition(() => {
    ran += 1;
    return "recovered";
  }, doc, env);
  assert.equal(ran, 1);
  assert.equal(out, "recovered");
});

test("routeImpl: API ausente atualiza #app-main, título e foco no h1", async () => {
  await withRouteEnv({ hash: "#/rota-inexistente-vt-1", reducedMotion: false }, async () => {
    await routeImpl();
    assert.match(mockMain.innerHTML, /Página não encontrada/);
    assert.equal(mockDocument.title, "Página não encontrada · Vox");
    assert.equal(activeH1.getAttribute("tabindex"), "-1");
    assert.equal(activeH1.focused, 1);
  });
});

test("routeImpl: prefers-reduced-motion: reduce NÃO chama startViewTransition e mantém a11y", async () => {
  let vtCalls = 0;
  const startViewTransition = (cb) => {
    vtCalls += 1;
    return { updateCallbackDone: Promise.resolve(cb()) };
  };
  await withRouteEnv(
    { hash: "#/rota-inexistente-vt-2", startViewTransition, reducedMotion: true },
    async () => {
      await routeImpl();
      assert.equal(vtCalls, 0);
      assert.match(mockMain.innerHTML, /Página não encontrada/);
      assert.equal(activeH1.focused, 1);
    },
  );
});

test("routeImpl: sem reduced-motion chama startViewTransition e foca h1 imediatamente", async () => {
  let vtCalls = 0;
  let focusedInsideCallback = 0;
  const startViewTransition = (cb) => {
    vtCalls += 1;
    const done = Promise.resolve(cb()).then(() => {
      focusedInsideCallback = activeH1.focused;
    });
    return { updateCallbackDone: done, finished: new Promise(() => {}) };
  };
  await withRouteEnv(
    { hash: "#/rota-inexistente-vt-3", startViewTransition, reducedMotion: false },
    async () => {
      await routeImpl();
      assert.equal(vtCalls, 1);
      assert.equal(focusedInsideCallback, 1);
      assert.match(mockMain.innerHTML, /Página não encontrada/);
      assert.equal(mockDocument.title, "Página não encontrada · Vox");
      assert.equal(activeH1.getAttribute("tabindex"), "-1");
      assert.equal(activeH1.focused, 1);
    },
  );
});

test("routeImpl: erro em startViewTransition faz fallback gracioso sem quebrar navegação", async () => {
  const startViewTransition = () => {
    throw new Error("ViewTransition failed");
  };
  await withRouteEnv(
    { hash: "#/rota-inexistente-vt-4", startViewTransition, reducedMotion: false },
    async () => {
      await routeImpl();
      assert.match(mockMain.innerHTML, /Página não encontrada/);
      assert.equal(mockDocument.title, "Página não encontrada · Vox");
      assert.equal(activeH1.focused, 1);
    },
  );
});
