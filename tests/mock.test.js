import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";

test("mock - mockCommunities retorna lista demo", () => {
  const res = mock.mockCommunities();
  assert.equal(res.demo, true);
  assert.ok(Array.isArray(res.items));
  assert.ok(res.items.length >= 2);
  assert.ok(res.items[0].id);
  assert.ok(res.items[0].title);
});

test("mock - mockTopics retorna topicos da comunidade ou array vazio", () => {
  const comm1 = mock.mockTopics("demo-community-1");
  assert.equal(comm1.demo, true);
  assert.ok(comm1.items.length >= 1);
  assert.equal(comm1.items[0].communityId, "demo-community-1");

  const inexistente = mock.mockTopics("comunidade_fantasma");
  assert.equal(inexistente.demo, true);
  assert.deepEqual(inexistente.items, []);
});

test("mock - mockReplies retorna respostas do topico ou array vazio", () => {
  const replies = mock.mockReplies("demo-topic-1");
  assert.equal(replies.demo, true);
  assert.ok(replies.items.length >= 1);
  assert.equal(replies.items[0].replyTo, "demo-topic-1");

  const vazio = mock.mockReplies("topico_fantasma");
  assert.equal(vazio.demo, true);
  assert.deepEqual(vazio.items, []);
});
