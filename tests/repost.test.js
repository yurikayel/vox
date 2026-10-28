import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as repost from "../client/js/repost.js";
import * as localAccount from "../client/js/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as render from "../client/js/render.js";
import { renderRepostBtn, iconCycle } from "../client/js/render/repost-btn.js";

test("repost - draft cita originalId sem impulsionar", () => {
  const draft = repost.buildRepostDraft({
    id: "top_orig_1",
    author: "vx_demo_ac",
    title: "Foto",
    body: "Trecho do post original",
  });
  assert.ok(draft);
  assert.equal(draft.originalId, "top_orig_1");
  assert.equal(draft.type, "topic");
  assert.equal(draft.isRepost, true);
  assert.match(draft.body, /#\/t\/top_orig_1/);
  assert.match(draft.body, /Trecho do post/);
  assert.equal(repost.getOriginalId(draft), "top_orig_1");
  assert.equal(repost.buildRepostDraft({}), null);
  assert.match(repost.REPOST_LABEL, /^Republicar$/);
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

test("repost - segundo clique desfaz e tira ativo", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  const created = await repost.toggleFromContext({
    postId: "top_toggle_1",
    title: "Oi",
    authorRoute: "vx_demo_ac",
  });
  assert.equal(created.kind, "create");
  assert.equal(created.signed.originalId, "top_toggle_1");
  assert.equal(repost.hasOwnRepost("top_toggle_1"), true);
  const on = renderRepostBtn({ id: "top_toggle_1" });
  assert.ok(on.includes("btn-repost active"));
  assert.ok(on.includes("icon-repost-check"));
  assert.ok(on.includes("Desfazer republicação"));

  const undone = await repost.toggleFromContext({ postId: "top_toggle_1" });
  assert.equal(undone.kind, "undo");
  assert.equal(undone.ok, true);
  assert.equal(repost.hasOwnRepost("top_toggle_1"), false);
  assert.equal(await cacheNode.getLocalPost(created.signed.id), null);
  const off = renderRepostBtn({ id: "top_toggle_1" });
  assert.ok(!off.includes("btn-repost active"));
  assert.ok(!off.includes("icon-repost-check"));
});

test("repost - contagem visível honesta e cite no feed", () => {
  localStorage.clear();
  const visible = [
    { id: "r1", originalId: "o1", isOwnLocalPost: true, excerpt: "Trecho" },
    { id: "r2", originalId: "o1", excerpt: "Outro" },
    { id: "plain", title: "Sem cite" },
  ];
  repost.rememberVisible(visible, "vx_me");
  assert.equal(repost.getVisibleCount("o1"), 2);
  assert.equal(repost.countCites(visible, "o1"), 2);
  assert.equal(repost.hasOwnRepost("o1"), true);

  const html = render.renderPostItem({
    id: "r1",
    title: "Republicação",
    body: "Republicação de vx_demo_ac\n#/t/o1\n\nTrecho",
    originalId: "o1",
    originalAuthor: "vx_demo_ac",
    excerpt: "Trecho",
    isRepost: true,
    author: "vx_me",
  });
  assert.ok(html.includes("repost-cite"));
  assert.ok(html.includes("#/t/o1"));
  assert.ok(html.includes("Republicação"));
  assert.ok(html.includes("btn-repost"));
});

test("repost - toolbar foto e texto com ciclo, sem zap/avião no botão", () => {
  const cycle = iconCycle(false);
  assert.ok(cycle.includes("M3 12a9 9 0 0 1 15"));
  assert.ok(!cycle.includes("icon-zap"));
  assert.ok(!cycle.includes("M22 2"));

  const photo = render.renderPostItem({
    id: "ph_rp",
    title: "Foto",
    image: "https://example.com/p.jpg",
    author: "vx_demo_ac",
    ts: Date.now(),
  });
  const left = photo.slice(photo.indexOf("post-ig-toolbar-left"), photo.indexOf("btn-save"));
  assert.ok(left.indexOf("btn-like") < left.indexOf("btn-comment"));
  assert.ok(left.indexOf("btn-comment") < left.indexOf("btn-repost"));
  assert.ok(left.indexOf("btn-repost") < left.indexOf("btn-share"));
  assert.ok(left.includes("icon-repost"));
  assert.ok(!left.includes("icon-zap"));

  const text = render.renderPostItem({
    id: "tx_rp",
    title: "Texto",
    body: "Corpo",
    author: "vx_demo_sp",
    ts: Date.now(),
  });
  const prim = text.slice(text.indexOf("toolbar-primary"), text.indexOf("toolbar-secondary"));
  assert.ok(prim.includes("btn-repost"));
  assert.ok(prim.includes("icon-repost"));
  assert.ok(!prim.includes("btn-zap-post"));
  assert.ok(text.includes("btn-zap-post"));
});
