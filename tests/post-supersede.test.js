import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { isSupersededLocally } from "../client/js/post-supersede.js";

function mockStore({ tombstone = null, localPost = null } = {}) {
  return {
    getTombstone: async (id) => (tombstone?.id === id ? tombstone : null),
    getLocalPost: async (id) => (localPost?.id === id ? localPost : null),
  };
}

test("post-supersede — entrada nova não é superada", async () => {
  const store = mockStore();
  const ok = await isSupersededLocally({ id: "p1", ts: 100, author: "vx_a" }, store);
  assert.equal(ok, false);
});

test("post-supersede — lápide, versão local ou autor divergente vencem", async () => {
  const tomb = mockStore({ tombstone: { id: "p1", editedAt: 200 } });
  assert.equal(await isSupersededLocally({ id: "p1", ts: 100 }, tomb), true);

  const newer = mockStore({ localPost: { id: "p1", ts: 300, author: "vx_a" } });
  assert.equal(await isSupersededLocally({ id: "p1", ts: 100, author: "vx_a" }, newer), true);

  const clash = mockStore({ localPost: { id: "p1", ts: 50, author: "vx_a" } });
  assert.equal(
    await isSupersededLocally({ id: "p1", ts: 100, author: "vx_b" }, clash),
    true,
  );
});