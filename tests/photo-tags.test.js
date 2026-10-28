import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as photoTags from "../client/js/photo-tags.js";
import { persistPhotoTags } from "../client/js/app/photo-tag-persist.js";
import * as localAccount from "../client/js/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";

test("photo-tags - normaliza coordenadas e alvo", () => {
  photoTags.__resetPhotoTagsForTests();
  const tag = photoTags.normalizeTag({ x: 140, y: -4, targetId: "vx_amigo", label: "Ana" });
  assert.equal(tag.x, 100);
  assert.equal(tag.y, 0);
  assert.equal(tag.targetId, "vx_amigo");
  assert.equal(photoTags.normalizeTag({ x: 10, y: 10, targetId: "" }), null);

  const list = photoTags.addTag([], { x: 33.33, y: 50, targetId: "vx_amigo", label: "Ana" });
  assert.equal(list[0].x, 33.3);
  assert.equal(list[0].targetId, "vx_amigo");
  photoTags.setLocalTags("post_t1", list);
  assert.equal(photoTags.getLocalTags("post_t1")[0].targetId, "vx_amigo");
  assert.match(photoTags.TAGS_HINT, /não é notificado/i);
});

test("photo-tags - persist no post assinado próprio", async () => {
  localStorage.clear();
  photoTags.__resetPhotoTagsForTests();
  const acc = await localAccount.ensureLocalAccount();
  const post = await localAccount.signPayload({
    id: "top_tag_1",
    type: "topic",
    title: "Foto",
    body: "com gente",
    image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
  });
  await cacheNode.saveLocalPost(post);
  const tags = [{ x: 25, y: 75, targetId: acc.routeId, label: "eu" }];
  const saved = await persistPhotoTags("top_tag_1", tags);
  assert.equal(saved[0].x, 25);
  assert.equal(saved[0].y, 75);
  assert.equal(saved[0].targetId, acc.routeId);
  const rec = await cacheNode.getPostRecord("top_tag_1");
  assert.equal(rec.photoTags[0].targetId, acc.routeId);
  assert.equal(rec.photoTags[0].x, 25);
});
