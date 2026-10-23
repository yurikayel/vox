import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as social from "../client/js/social.js";

test("social - likes toggle e contagem", () => {
  localStorage.clear();

  assert.equal(social.isLiked("post_1"), false);
  assert.equal(social.getLikesCount("post_1", 20), 20);

  // Curtir
  const first = social.toggleLike("post_1", 20);
  assert.equal(first.liked, true);
  assert.equal(first.count, 21);
  assert.equal(social.isLiked("post_1"), true);
  assert.equal(social.getLikesCount("post_1", 20), 21);

  // Descurtir
  const second = social.toggleLike("post_1", 20);
  assert.equal(second.liked, false);
  assert.equal(second.count, 20);
  assert.equal(social.isLiked("post_1"), false);

  // Post nulo
  assert.equal(social.toggleLike(null).liked, false);
});

test("social - salvos/bookmarks toggle", () => {
  localStorage.clear();

  assert.equal(social.isSaved("post_abc"), false);

  // Salvar
  const saved = social.toggleSave("post_abc");
  assert.equal(saved, true);
  assert.equal(social.isSaved("post_abc"), true);

  // Remover
  const unsaved = social.toggleSave("post_abc");
  assert.equal(unsaved, false);
  assert.equal(social.isSaved("post_abc"), false);

  assert.equal(social.toggleSave(""), false);
});
