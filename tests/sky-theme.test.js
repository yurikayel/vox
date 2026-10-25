import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  hourToSkyPeriod,
  applySkyTheme,
  SKY_PERIOD_HOURS,
  SKY_FOLLOW_CLOCK_KEY,
} from "../client/js/sky-theme.js";

function mockDoc({ attrs = {}, followClock = true } = {}) {
  const root = {
    attrs: { ...attrs },
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
  const storage = {
    store: new Map(),
    getItem(k) {
      return this.store.has(k) ? this.store.get(k) : null;
    },
    setItem(k, v) {
      this.store.set(k, String(v));
    },
  };
  if (!followClock) storage.setItem(SKY_FOLLOW_CLOCK_KEY, "0");
  return {
    documentElement: root,
    visibilityState: "visible",
    querySelectorAll: () => [],
    defaultView: {
      localStorage: storage,
      matchMedia: () => ({ matches: false, addEventListener() {} }),
    },
  };
}

test("sky-theme - hour bands map to palette ids", () => {
  assert.equal(hourToSkyPeriod(0), "madrugada");
  assert.equal(hourToSkyPeriod(5), "madrugada");
  assert.equal(hourToSkyPeriod(6), "manha");
  assert.equal(hourToSkyPeriod(11), "manha");
  assert.equal(hourToSkyPeriod(12), "tarde");
  assert.equal(hourToSkyPeriod(17), "tarde");
  assert.equal(hourToSkyPeriod(18), "entardecer");
  assert.equal(hourToSkyPeriod(20), "entardecer");
  assert.equal(hourToSkyPeriod(21), "noite");
  assert.equal(hourToSkyPeriod(23), "noite");
  assert.equal(hourToSkyPeriod(25), "madrugada");
});

test("sky-theme - applySkyTheme sets data-sky-period on root", () => {
  const doc = mockDoc();
  const result = applySkyTheme(doc, 8, { dark: false, followClock: true });
  assert.equal(result.period, "manha");
  assert.equal(doc.documentElement.getAttribute("data-sky-period"), "manha");
});

test("sky-theme - follow clock off clears sky attributes", () => {
  const doc = mockDoc({ attrs: { "data-sky-period": "tarde" }, followClock: false });
  const result = applySkyTheme(doc, 14, { followClock: false });
  assert.equal(result.period, null);
  assert.equal(doc.documentElement.getAttribute("data-sky-period"), null);
});

test("sky-theme - period table covers 24h without gaps", () => {
  const seen = new Set();
  for (let h = 0; h < 24; h += 1) seen.add(hourToSkyPeriod(h));
  assert.equal(seen.size, Object.keys(SKY_PERIOD_HOURS).length);
});
