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

test("social - stars toggle, contagem e lista", () => {
  localStorage.clear();

  assert.equal(social.isStarred("post_star_1"), false);
  assert.equal(social.getStarsCount("post_star_1", 5), 5);
  assert.deepEqual(social.getStarredPostIds(), []);

  // Dar estrela
  const res1 = social.toggleStar("post_star_1", 5);
  assert.equal(res1.starred, true);
  assert.equal(res1.count, 6);
  assert.equal(social.isStarred("post_star_1"), true);
  assert.deepEqual(social.getStarredPostIds(), ["post_star_1"]);

  // Remover estrela
  const res2 = social.toggleStar("post_star_1", 5);
  assert.equal(res2.starred, false);
  assert.equal(res2.count, 5);
  assert.equal(social.isStarred("post_star_1"), false);
  assert.deepEqual(social.getStarredPostIds(), []);

  // Nulo
  assert.equal(social.toggleStar(null).starred, false);
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

test("social - watch perfis e lista de acompanhados", () => {
  localStorage.clear();

  assert.equal(social.isWatching("vx_demo_mg"), false);
  assert.deepEqual(social.getWatchedProfiles(), []);

  // ComeÃ§ar a acompanhar
  const watching = social.toggleWatch("vx_demo_mg");
  assert.equal(watching, true);
  assert.equal(social.isWatching("vx_demo_mg"), true);
  assert.deepEqual(social.getWatchedProfiles(), ["vx_demo_mg"]);
  assert.equal(social.getFollowersCount("vx_demo_mg", 10), 11);

  // Parar de acompanhar
  const unwatching = social.toggleWatch("vx_demo_mg");
  assert.equal(unwatching, false);
  assert.equal(social.isWatching("vx_demo_mg"), false);
  assert.deepEqual(social.getWatchedProfiles(), []);
  assert.equal(social.getFollowersCount("vx_demo_mg", 10), 10);
});

test("social - post fixado por autor (pinned)", () => {
  localStorage.clear();

  assert.equal(social.getPinnedPostId("vx_demo_mg"), "");
  assert.equal(social.isPostPinned("vx_demo_mg", "demo-post-mg"), false);

  // Fixar
  social.setPinnedPostId("vx_demo_mg", "demo-post-mg");
  assert.equal(social.getPinnedPostId("vx_demo_mg"), "demo-post-mg");
  assert.equal(social.isPostPinned("vx_demo_mg", "demo-post-mg"), true);

  // Desafixar
  social.setPinnedPostId("vx_demo_mg", "");
  assert.equal(social.getPinnedPostId("vx_demo_mg"), "");
});

test("social - reações em comentários toggle e contagem", () => {
  localStorage.clear();

  assert.equal(social.isCommentReacted("demo-reply-ba-ma-0"), false);
  assert.equal(social.getCommentReactCount("demo-reply-ba-ma-0", 3), 3);

  const first = social.toggleCommentReact("demo-reply-ba-ma-0", 3);
  assert.equal(first.reacted, true);
  assert.equal(first.count, 4);

  const second = social.toggleCommentReact("demo-reply-ba-ma-0", 3);
  assert.equal(second.reacted, false);
  assert.equal(second.count, 3);
});

test("social - readme local e github handle", () => {
  localStorage.clear();

  assert.equal(social.getLocalReadme(), "");
  assert.equal(social.getLocalGithubHandle(), "");

  social.setLocalReadme("### Meu README local\nDesenvolvedor P2P.");
  assert.equal(social.getLocalReadme().includes("Meu README"), true);

  social.setLocalGithubHandle("@yurikayel");
  assert.equal(social.getLocalGithubHandle(), "yurikayel");

  social.setLocalGithubHandle("");
  assert.equal(social.getLocalGithubHandle(), "");
});
