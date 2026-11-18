/**
 * S30-S28: falha no registro do service worker não é engolida.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../client/js/boot-sw.js", import.meta.url), "utf8");

test("boot-sw — não usa catch vazio no register", () => {
  assert.doesNotMatch(source, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
});

test("boot-sw — rejeição do register avisa no console", async () => {
  const warnings = [];
  const loadListeners = [];
  const win = {
    addEventListener(type, fn) {
      if (type === "load") loadListeners.push(fn);
    },
  };
  const sandbox = {
    console: {
      ...console,
      warn(...args) {
        warnings.push(args);
      },
    },
    navigator: {
      serviceWorker: {
        register() {
          return Promise.reject(new Error("sw bloqueado"));
        },
      },
    },
    window: win,
  };
  vm.runInNewContext(source, sandbox, { filename: "boot-sw.js" });
  assert.equal(loadListeners.length, 1);
  loadListeners[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /service worker/i);
  assert.equal(warnings[0][1]?.message, "sw bloqueado");
});