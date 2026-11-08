import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { handleImageFallback, handleDelegatedClick } from "../client/js/dom-delegates.js";

test("dom-delegates - imagem com data-fallback-next some e mostra as iniciais", () => {
  const sibling = { style: { display: "none" } };
  const img = { style: {}, nextElementSibling: sibling, matches: (s) => s === "img[data-fallback-next]" };
  assert.equal(handleImageFallback(img), true);
  assert.equal(img.style.display, "none");
  assert.equal(sibling.style.display, "flex");
  assert.equal(handleImageFallback({ matches: () => false }), false);
});

test("dom-delegates - data-click-target clica no alvo; data-focus-target foca ou navega", () => {
  let clicked = 0;
  let focused = 0;
  let assigned = "";
  const doc = { querySelector: (sel) => (sel === "#alvo" ? { click: () => clicked++ } : sel === "#campo" ? { focus: () => focused++ } : null) };
  const loc = { assign: (h) => { assigned = h; } };
  const el = (attrs) => ({ closest: (s) => (s === `[${Object.keys(attrs)[0]}]` ? { dataset: attrs.dataset } : null) });
  assert.equal(handleDelegatedClick(el({ "data-click-target": 1, dataset: { clickTarget: "#alvo" } }), doc, loc), true);
  assert.equal(clicked, 1);
  assert.equal(handleDelegatedClick(el({ "data-focus-target": 1, dataset: { focusTarget: "#campo" } }), doc, loc), true);
  assert.equal(focused, 1);
  handleDelegatedClick(el({ "data-focus-target": 1, dataset: { focusTarget: "#nada", focusFallback: "#/compose/reply?t=1" } }), doc, loc);
  assert.equal(assigned, "#/compose/reply?t=1");
  handleDelegatedClick(el({ "data-focus-target": 1, dataset: { focusTarget: "#nada", focusFallback: "javascript:alert(1)" } }), doc, { assign: () => { throw new Error("não deveria navegar"); } });
});
