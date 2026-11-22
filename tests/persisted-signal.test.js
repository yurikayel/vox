/**
 * Signal persistido com validação e sync entre abas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createScope } from "../client/js/shared/signals.js";
import { persistedSignal } from "../client/js/shared/persisted-signal.js";

function makeMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    }
  };
}

test("persistedSignal — fallback em JSON corrompido ou tipo inválido", () => {
  const s1 = persistedSignal("k1", { ok: false }, {
    storage: makeMemoryStorage({ k1: "{quebrado" }),
    validate: (v) => Boolean(v && typeof v === "object" && !Array.isArray(v))
  });
  assert.deepEqual(s1.peek(), { ok: false });
  const s2 = persistedSignal("k2", 0, {
    storage: makeMemoryStorage({ k2: JSON.stringify("texto") }),
    validate: (v) => typeof v === "number"
  });
  assert.equal(s2.peek(), 0);
  s1.dispose();
  s2.dispose();
});

test("persistedSignal — grava, sync via storage e respeita validate/quota", () => {
  const storage = makeMemoryStorage();
  const target = new EventTarget();
  const errors = [];
  const scope = createScope();
  const sig = persistedSignal("k3", 1, {
    storage,
    eventTarget: target,
    validate: (v) => Number.isInteger(v) && v >= 0,
    onWriteError: (e) => errors.push(e.message),
    scope
  });
  assert.equal(sig.set(5), true);
  assert.equal(storage.getItem("k3"), "5");
  assert.throws(() => sig.set(-1), TypeError);
  storage.setItem("k3", "9");
  const ev = new Event("storage");
  Object.assign(ev, { key: "k3", storageArea: storage });
  target.dispatchEvent(ev);
  assert.equal(sig.peek(), 9);
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.equal(sig.set(10), false);
  assert.deepEqual(errors, ["QuotaExceededError"]);
  scope.dispose();
});
