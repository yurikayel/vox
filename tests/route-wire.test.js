/**
 * Roteador (`route.js`) e títulos de rota (`route-parse.routeTitle`).
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

function createMockEl(tag = "div") {
  return {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    innerHTML: "",
    children: [],
    style: {},
    setAttribute() {},
    getAttribute() {
      return null;
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

const { CANTINA_STORAGE_KEY } = await import("../client/js/app/cantina-gate.js");
const { routeTitle } = await import("../client/js/app/route-parse.js");
const { wireRoute, routeImpl } = await import("../client/js/app/route.js");
const { route } = await import("../client/js/app/navigation.js");

function withHash(hash, fn) {
  const loc = { hash, search: "" };
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  globalThis.window = { location: loc, addEventListener() {}, removeEventListener() {} };
  globalThis.location = loc;
  try {
    return fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
}

describe("routeTitle", () => {
  it("usa o mapa de telas conhecidas", () => {
    assert.equal(routeTitle({ name: "network-settings" }), "Rede · Vox");
    assert.equal(routeTitle({ name: "steward-wizard" }), "Guardião da rede · Vox");
  });

  it("cai na Ágora para rota desconhecida", () => {
    assert.equal(routeTitle({ name: "typo-route" }), "Ágora · Vox");
  });
});

describe("route — wireRoute e routeImpl", () => {
  it("wireRoute liga navigation.route ao routeImpl", async () => {
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    mockMain.innerHTML = "";
    wireRoute();
    await withHash("#/this-route-does-not-exist", async () => {
      await route();
      assert.match(mockMain.innerHTML, /Página não encontrada/);
    });
  });

  it("configurações de rede (#/settings/network) despacham sem cair na home", async () => {
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    mockMain.innerHTML = "";
    await withHash("#/settings/network", async () => {
      await routeImpl();
      assert.ok(mockMain.innerHTML.length > 0, "showNetworkSettings deve montar o shell");
      assert.match(mockMain.innerHTML, /Rede|rede|nó/i);
    });
  });
});