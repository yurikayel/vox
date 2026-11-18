import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

function createMockEl(tag = "div") {
  return {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    innerHTML: "",
    value: "",
    attributes: {},
    style: {},
    children: [],
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    remove() {},
  };
}

const mockRoot = createMockEl("div");
mockRoot.id = "app-root";
const mockMain = createMockEl("main");
mockMain.id = "app-main";

globalThis.document = {
  body: createMockEl("body"),
  createElement: (tag) => createMockEl(tag),
  getElementById: (id) => {
    if (id === "app-root") return mockRoot;
    if (id === "app-main") return mockMain;
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
};

const { parseRoute } = await import("../client/js/app/route-parse.js");
const localAccount = await import("../client/js/identity/local-account.js");
const screensHome = await import("../client/js/app/screens-home.js");
const cacheNode = await import("../client/js/cache-node.js");

function routeFor(hash, search = "") {
  const loc = { hash, search };
  globalThis.window = { location: loc };
  globalThis.location = loc;
  return parseRoute();
}

test("route #/communities — resolve para a rota communities", () => {
  assert.deepEqual(routeFor("#/communities"), { name: "communities" });
});

test("route #/communities — barra no fim e query são ignoradas", () => {
  assert.deepEqual(routeFor("#/communities/"), { name: "communities" });
  assert.deepEqual(routeFor("#/communities?tab=online"), { name: "communities" });
});

test("route #/communities — não confunde com comunidade individual #/c/...", () => {
  assert.equal(routeFor("#/c/vox").name, "community");
});

test("screen communities — renderiza sem erro com os mocks do setup", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  mockMain.innerHTML = "";

  await screensHome.showCommunities();

  assert.ok(mockMain.innerHTML.length > 0, "a tela deve preencher o main");
  assert.equal(mockMain.innerHTML.includes("Erro"), false, "não deve exibir estado de erro");
});
