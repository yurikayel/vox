import test from "node:test";
import assert from "node:assert/strict";
import { groupRepliesForThread, flattenReplyThread, MAX_THREAD_DEPTH } from "../client/js/reply-thread.js";

const r = (id, ts, parentId = "") => ({ id, ts, parentId });

test("reply-thread - agrupa por parentId e mantém raízes", () => {
  const { tops, byParent } = groupRepliesForThread([r("a", 1), r("b", 2, "a"), r("c", 3)]);
  assert.deepEqual(tops.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(byParent.a.map((x) => x.id), ["b"]);
});

test("reply-thread - órfã (pai ausente/moderado) sobe para a raiz", () => {
  const { tops } = groupRepliesForThread([r("a", 1), r("b", 2, "sumiu")]);
  assert.deepEqual(tops.map((x) => x.id), ["a", "b"]);
});

test("reply-thread - achata em DFS cronológico com profundidade", () => {
  const flat = flattenReplyThread([r("c", 5), r("a", 1), r("a2", 4, "a"), r("a1", 2, "a"), r("a1x", 3, "a1")]);
  assert.deepEqual(flat.map((x) => `${x.reply.id}:${x.depth}`), ["a:0", "a1:1", "a1x:2", "a2:1", "c:0"]);
});

test("reply-thread - profundidade visual travada em MAX_THREAD_DEPTH", () => {
  const chain = [r("n0", 0)];
  for (let i = 1; i <= 7; i++) chain.push(r(`n${i}`, i, `n${i - 1}`));
  const depths = flattenReplyThread(chain).map((x) => x.depth);
  assert.equal(Math.max(...depths), MAX_THREAD_DEPTH);
  assert.equal(depths.length, 8);
});

test("reply-thread - ciclo de parentId não perde respostas nem trava", () => {
  const flat = flattenReplyThread([r("x", 1, "y"), r("y", 2, "x"), r("self", 3, "self")]);
  assert.deepEqual(flat.map((f) => f.reply.id).sort(), ["self", "x", "y"]);
});
