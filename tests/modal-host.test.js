import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { modalHost, clearModalHost } from "../client/js/render/modal-host.js";

function fakeDoc() {
  const byId = new Map();
  return {
    byId,
    getElementById: (id) => byId.get(id) || null,
    createElement: () => ({ id: "", innerHTML: "" }),
    body: { appendChild: (el) => byId.set(el.id, el) },
  };
}

test("modal-host: cria o contêiner uma vez, reaproveita e limpar fecha o modal", () => {
  const doc = fakeDoc();
  const a = modalHost("x-modal", doc);
  a.innerHTML = "<div>modal</div>";
  assert.equal(modalHost("x-modal", doc), a, "não cria outro");
  assert.equal(doc.byId.size, 1);
  clearModalHost("x-modal", doc);
  assert.equal(a.innerHTML, "");
  assert.doesNotThrow(() => clearModalHost("inexistente", doc));
});
