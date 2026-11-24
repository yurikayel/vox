/** @file Testes unitários para `shared/reduce-lww` (`isNewerLww` e `reduceLwwByAuthor`). */
import test from "node:test";
import assert from "node:assert/strict";
import { isNewerLww, reduceLwwByAuthor } from "../client/js/shared/reduce-lww.js";

test("isNewerLww: item mais novo vence e mais velho perde (editedAt e fallback ts)", () => {
  const cur = { editedAt: 2000, ts: 1000, sig: "sig_cur" };
  assert.equal(isNewerLww({ editedAt: 2001, sig: "aaa" }, cur), true);
  assert.equal(isNewerLww({ editedAt: 1999, sig: "zzz" }, cur), false);
  assert.equal(isNewerLww({ ts: 2500, sig: "aaa" }, cur), true);
  assert.equal(isNewerLww({ ts: 1500, sig: "zzz" }, cur), false);
  assert.equal(isNewerLww({ editedAt: 0, ts: 9999, sig: "zzz" }, { editedAt: 1, sig: "aaa" }), false);
  assert.equal(isNewerLww({ editedAt: 1, sig: "aaa" }, null), true);
  assert.equal(isNewerLww(null, cur), false);
});

test("isNewerLww: mesma marca (editedAt + sig) é ignorada", () => {
  const item = { editedAt: 5000, sig: "sig_same" };
  assert.equal(isNewerLww({ ...item }, item), false);
  assert.equal(isNewerLww({ ts: 5000, sig: "sig_same" }, { editedAt: 5000, sig: "sig_same" }), false);
});

test("isNewerLww: desempate determinístico por sig quando editedAt empata", () => {
  const low = { editedAt: 5000, sig: "sig_alpha" };
  const high = { editedAt: 5000, sig: "sig_zeta" };
  assert.equal(isNewerLww(high, low), true);
  assert.equal(isNewerLww(low, high), false);
});

test("reduceLwwByAuthor: converge por autor independente da ordem e ignora duplicatas", () => {
  const a1 = { routeId: "vx_a", editedAt: 100, sig: "s1", body: "old" };
  const a2 = { routeId: "vx_a", editedAt: 200, sig: "s_alpha", body: "tie-low" };
  const a3 = { routeId: "vx_a", editedAt: 200, sig: "s_omega", body: "tie-high" };
  const b1 = { routeId: "vx_b", ts: 300, sig: "sb1", body: "b-first" };
  const b1Dup = { routeId: "vx_b", ts: 300, sig: "sb1", body: "b-dup" };
  const noAuthor = { editedAt: 9999, sig: "s_none" };

  const forward = reduceLwwByAuthor([a1, a2, a3, b1, b1Dup, noAuthor], (x) => x.routeId);
  const reverse = reduceLwwByAuthor([noAuthor, b1Dup, b1, a3, a2, a1], (x) => x.routeId);

  assert.equal(forward.size, 2);
  assert.equal(forward.get("vx_a"), a3);
  assert.equal(forward.get("vx_b"), b1);
  assert.equal(reverse.get("vx_a"), a3);
  assert.equal(reverse.get("vx_b").sig, b1.sig);
  assert.equal(reduceLwwByAuthor(null).size, 0);
});
