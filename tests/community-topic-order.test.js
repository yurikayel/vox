import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveTopicLastActivityTs,
  sortTopicsByActivity,
  sortTopicsByNewest,
  orderCommunityTopics,
} from "../client/js/community-topic-order.js";

test("community-topic-order - resolveTopicLastActivityTs usa o maior entre post e resposta", () => {
  assert.equal(resolveTopicLastActivityTs({ ts: 100 }), 100);
  assert.equal(resolveTopicLastActivityTs({ ts: 100, lastReplyTs: 200 }), 200);
  assert.equal(resolveTopicLastActivityTs({ ts: 300, lastReplyTs: 200 }), 300);
  assert.equal(resolveTopicLastActivityTs({}), 0);
});

test("community-topic-order - sortTopicsByActivity faz bumping de tópico antigo com resposta nova", () => {
  const topics = [
    { id: "top_novo_sem_respostas", ts: 500 },
    { id: "top_antigo_com_bump", ts: 100, lastReplyTs: 600 },
    { id: "top_antigo_parado", ts: 50 },
  ];
  const sorted = sortTopicsByActivity(topics);
  assert.deepEqual(sorted.map((t) => t.id), [
    "top_antigo_com_bump",
    "top_novo_sem_respostas",
    "top_antigo_parado",
  ]);
});

test("community-topic-order - sortTopicsByNewest respeita data de criação sem bumping", () => {
  const topics = [
    { id: "top_1", ts: 100, lastReplyTs: 900 },
    { id: "top_2", ts: 500, lastReplyTs: 500 },
    { id: "top_3", ts: 300 },
  ];
  const sorted = sortTopicsByNewest(topics);
  assert.deepEqual(sorted.map((t) => t.id), ["top_2", "top_3", "top_1"]);
});

test("community-topic-order - orderCommunityTopics alterna corretamente entre active e newest", () => {
  const topics = [
    { id: "a", ts: 10, lastReplyTs: 50 },
    { id: "b", ts: 30, lastReplyTs: 0 },
  ];
  assert.deepEqual(orderCommunityTopics(topics, "active").map((t) => t.id), ["a", "b"]);
  assert.deepEqual(orderCommunityTopics(topics, "newest").map((t) => t.id), ["b", "a"]);
});

test("community-topic-order - orderCommunityTopics mantém tópicos fixados (isPinned) sempre no topo", () => {
  const topics = [
    { id: "reg_ativo", ts: 100, lastReplyTs: 1000 },
    { id: "pinned_antigo", ts: 50, isPinned: true },
    { id: "reg_novo", ts: 500 },
    { id: "pinned_mais_ativo", ts: 40, lastReplyTs: 200, isPinned: true },
  ];
  const sorted = orderCommunityTopics(topics, "active");
  // Os dois fixados ficam no topo (ordenados entre si por atividade: pinned_mais_ativo > pinned_antigo), seguidos pelos regulares
  assert.deepEqual(sorted.map((t) => t.id), [
    "pinned_mais_ativo",
    "pinned_antigo",
    "reg_ativo",
    "reg_novo",
  ]);
});

test("community-topic-order - lida com array vazio ou nulo sem quebrar", () => {
  assert.deepEqual(sortTopicsByActivity([]), []);
  assert.deepEqual(sortTopicsByActivity(null), []);
  assert.deepEqual(sortTopicsByNewest([]), []);
  assert.deepEqual(sortTopicsByNewest(null), []);
});
