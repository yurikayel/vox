import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  VOX_COLOR_MODE_KEY,
  parseColorMode,
  readColorMode,
  writeColorMode,
  applyColorModeToRoot,
  resolveEffectiveDark,
  cycleColorMode,
  colorModeLabel,
} from "../client/js/color-mode.js";

function mockStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    _store: store,
  };
}

test("color-mode - parse and persist preference", () => {
  assert.equal(parseColorMode("light"), "light");
  assert.equal(parseColorMode("dark"), "dark");
  assert.equal(parseColorMode("auto"), "auto");
  assert.equal(parseColorMode("nope"), "auto");
  assert.equal(parseColorMode(null), "auto");

  const storage = mockStorage();
  writeColorMode(storage, "dark");
  assert.equal(storage.getItem(VOX_COLOR_MODE_KEY), "dark");
  assert.equal(readColorMode(storage), "dark");

  writeColorMode(storage, "auto");
  assert.equal(storage.getItem(VOX_COLOR_MODE_KEY), null);
  assert.equal(readColorMode(storage), "auto");
});

test("color-mode - applyColorModeToRoot sets data attribute", () => {
  const root = {
    attrs: {},
    style: { colorScheme: "" },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
  };
  root.style.removeProperty = () => {
    root.style.colorScheme = "";
  };

  applyColorModeToRoot(root, "light");
  assert.equal(root.getAttribute("data-color-mode"), "light");
  assert.equal(root.style.colorScheme, "light");

  applyColorModeToRoot(root, "auto");
  assert.equal(root.getAttribute("data-color-mode"), null);
});

test("color-mode - resolveEffectiveDark and cycle", () => {
  assert.equal(resolveEffectiveDark("light", true), false);
  assert.equal(resolveEffectiveDark("dark", false), true);
  assert.equal(resolveEffectiveDark("auto", true), true);
  assert.equal(cycleColorMode("auto"), "light");
  assert.equal(cycleColorMode("light"), "dark");
  assert.equal(cycleColorMode("dark"), "auto");
  assert.equal(colorModeLabel("auto"), "Automático");
});
