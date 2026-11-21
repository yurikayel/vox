/**
 * Reconciliador DOM por chave.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createKeyedList } from "../client/js/shared/keyed-list.js";

function makeMiniContainer() {
  const children = [];
  const syncLinks = () => {
    children.forEach((c, idx) => {
      c.nextSibling = children[idx + 1] || null;
      c.parentNode = api;
    });
  };
  const api = {
    children,
    get firstChild() {
      return children[0] || null;
    },
    insertBefore(node, ref) {
      const oldIdx = children.indexOf(node);
      if (oldIdx !== -1) children.splice(oldIdx, 1);
      const refIdx = ref ? children.indexOf(ref) : children.length;
      children.splice(refIdx === -1 ? children.length : refIdx, 0, node);
      syncLinks();
    },
    removeChild(node) {
      const idx = children.indexOf(node);
      if (idx !== -1) children.splice(idx, 1);
      node.parentNode = null;
      node.nextSibling = null;
      syncLinks();
    }
  };
  return api;
}

test("keyed-list — preserva nós ao reordenar e remove obsoletos", () => {
  const container = makeMiniContainer();
  const removed = [];
  const list = createKeyedList({
    container,
    getKey: (x) => x.id,
    createNode: (x) => ({ id: x.id, text: x.t, parentNode: null, nextSibling: null }),
    updateNode: (node, x) => {
      node.text = x.t;
    },
    onRemove: (_node, k) => removed.push(k)
  });
  list.update([{ id: "a", t: "A1" }, { id: "b", t: "B1" }, { id: "c", t: "C1" }]);
  const nodeA = container.children[0];
  const nodeB = container.children[1];
  list.update([{ id: "c", t: "C2" }, { id: "a", t: "A2" }, { id: "d", t: "D1" }]);
  assert.equal(container.children.map((n) => `${n.id}:${n.text}`).join(","), "c:C2,a:A2,d:D1");
  assert.equal(container.children[1], nodeA);
  assert.notEqual(nodeB.parentNode, container);
  assert.deepEqual(removed, ["b"]);
  assert.throws(() => list.update([{ id: "x" }, { id: "x" }]), /duplicada/);
});
