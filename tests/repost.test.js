import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as repost from "../client/js/repost.js";
import * as localAccount from "../client/js/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";

test("repost - draft cita originalId sem impulsionar", () => {
  const draft = repost.buildRepostDraft({
    id: "top_orig_1",
    author: "vx_demo_ac",
    title: "Foto",
    body: "Trecho da praça original",
  });
  assert.ok(draft);
  assert.equal(draft.originalId, "top_orig_1");
  assert.equal(draft.type, "topic");
  assert.equal(draft.isRepost, true);
  assert.match(draft.body, /#\/t\/top_orig_1/);
  assert.match(draft.body, /Trecho da praça/);
  assert.equal(repost.getOriginalId(draft), "top_orig_1");
  assert.equal(repost.buildRepostDraft({}), null);
  assert.match(repost.REPOST_LABEL, /Republicar na praça/);
  assert.match(repost.REPOST_HINT, /impulsionar/i);
});

test("repost - persist cria item local com original id", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  const signed = await repost.persistRepost(
    repost.buildRepostDraft({
      id: "top_orig_persist",
      author: "vx_demo_mg",
      body: "Original persistido",
    }),
  );
  assert.ok(signed?.id);
  assert.equal(signed.originalId, "top_orig_persist");
  const rec = await cacheNode.getPostRecord(signed.id);
  assert.equal(rec.originalId, "top_orig_persist");
});
