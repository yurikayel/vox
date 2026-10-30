import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const localAccount = await import("../client/js/local-account.js");
const cacheNode = await import("../client/js/cache-node.js");
const util = await import("../client/js/render/util.js");
const feed = await import("../client/js/render/feed.js");
const screensCompose = await import("../client/js/app/screens-compose.js");

test("cache-node - persiste e restaura authorDisplay, authorAvatar e authorHandle", async () => {
  await cacheNode.clearLocalPosts();

  const post = {
    id: "top_p2p_sync_1",
    type: "topic",
    title: "Post P2P",
    author: "vx_remote_author_123",
    authorDisplay: "Yuri Kayel Test",
    authorAvatar: "https://example.com/avatar.jpg",
    authorHandle: "yurikayel",
    ts: Date.now(),
  };

  await cacheNode.saveLocalPost(post);
  const loaded = await cacheNode.getLocalPost("top_p2p_sync_1");

  assert.equal(loaded.authorDisplay, "Yuri Kayel Test");
  assert.equal(loaded.authorAvatar, "https://example.com/avatar.jpg");
  assert.equal(loaded.authorHandle, "yurikayel");
});

test("cache-node - getReplyCountsMap agrega contagem correta de respostas por tópico", async () => {
  await cacheNode.clearLocalPosts();

  await cacheNode.saveLocalPost({
    id: "rep_1",
    type: "reply",
    replyTo: "top_alpha",
    body: "Comentário 1",
  });
  await cacheNode.saveLocalPost({
    id: "rep_2",
    type: "reply",
    replyTo: "top_alpha",
    body: "Comentário 2",
  });
  await cacheNode.saveLocalPost({
    id: "rep_3",
    type: "reply",
    replyTo: "top_beta",
    body: "Comentário no beta",
  });

  const map = await cacheNode.getReplyCountsMap();
  assert.equal(map["top_alpha"], 2);
  assert.equal(map["top_beta"], 1);
  assert.equal(map["top_inexistente"], undefined);
});

test("local-account - signPayload enriquece com displayName e avatar do perfil ativo", async () => {
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Alice Cidadã");
  localAccount.setProfileEnrichment({
    displayName: "Alice Cidadã",
    avatarUrl: "https://example.com/alice.png",
  });

  const signed = await localAccount.signPayload({
    type: "topic",
    title: "Proposta",
    body: "Texto",
  });

  assert.equal(signed.authorDisplay, "Alice Cidadã");
  assert.equal(signed.authorAvatar, "https://example.com/alice.png");

  localAccount.wipeLocalAccount();
});

test("render - renderAvatarHtml aceita avatarOverride e renderiza imagem corretamente", () => {
  const htmlWithAvatar = util.renderAvatarHtml("vx_other", "Outro Usuário", "sm", "https://example.com/pic.png");
  assert.ok(htmlWithAvatar.includes('src="https://example.com/pic.png"'));
  assert.ok(htmlWithAvatar.includes('alt="Outro Usuário"'));
  assert.ok(htmlWithAvatar.includes('avatar-img'));

  const htmlFallback = util.renderAvatarHtml("vx_other", "Outro Usuário", "sm", "");
  assert.ok(htmlFallback.includes(">O</span>"));
});

test("render - renderPostItem renderiza .count-replies mesmo com 0 respostas", () => {
  const topicZero = { id: "top_zero", title: "Zero", repliesCount: 0 };
  const htmlZero = feed.renderPostItem(topicZero);
  assert.ok(htmlZero.includes('count-replies'));

  const topicTwo = { id: "top_two", title: "Dois", repliesCount: 2 };
  const htmlTwo = feed.renderPostItem(topicTwo);
  assert.ok(htmlTwo.includes('>2</span>'));
  assert.ok(htmlTwo.includes('aria-label="Comentar, 2 comentários"'));
});

test("screens-compose - bumpReplyCount incrementa a contagem de respostas corretamente", () => {
  const countEl = { textContent: "" };
  const btnEl = {
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    querySelector(sel) { return sel === ".count-replies" ? countEl : null; },
  };
  const article = {
    querySelectorAll(sel) {
      if (sel === ".count-replies") return [countEl];
      if (sel === ".btn-comment") return [btnEl];
      return [];
    },
  };

  screensCompose.bumpReplyCount(article);
  assert.equal(countEl.textContent, "1");
  assert.equal(btnEl.getAttribute("aria-label"), "Comentar, 1 comentários");

  screensCompose.bumpReplyCount(article);
  assert.equal(countEl.textContent, "2");
  assert.equal(btnEl.getAttribute("aria-label"), "Comentar, 2 comentários");
});
