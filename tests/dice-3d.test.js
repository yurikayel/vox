/**
 * Overlay dice-3d — caminhos early-exit sem carregar CSS no Node.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mountDice3dOverlay } from "../client/js/dungeon/dice-3d.js";

function mockContainer() {
  const children = [];
  return {
    appendChild(el) {
      if (!el.remove) {
        el.remove = () => {
          const i = children.indexOf(el);
          if (i >= 0) children.splice(i, 1);
        };
      }
      children.push(el);
    },
    _children: children,
  };
}

test("mountDice3dOverlay — roll inválido retorna noop", () => {
  const detach = mountDice3dOverlay(null, { ok: false });
  assert.equal(typeof detach, "function");
  assert.equal(detach(), undefined);
});

test("mountDice3dOverlay — container válido cria overlay e detach limpa", () => {
  const mk = () => ({
    className: "",
    style: { cssText: "", transform: "", transition: "" },
    dataset: {},
    setAttribute() {},
    appendChild() {},
    remove() {},
    innerHTML: "",
  });
  const realDoc = globalThis.document;
  globalThis.document = {
    createElement: mk,
  };
  const host = mockContainer();
  const detach = mountDice3dOverlay(
    host,
    { ok: true, total: 17, rolls: [{ kept: true, sides: 20, value: 17 }] },
    { reducedMotion: true },
  );
  assert.equal(host._children.length, 1);
  assert.doesNotThrow(() => detach());
  globalThis.document = realDoc;
});