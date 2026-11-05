import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  LAST_SEEN_STORAGE_KEY,
  loadLastSeenMap,
  saveLastSeenMap,
  getCommunityLastSeenTs,
  markCommunitySeen,
  computeCommunityUnreadCount,
  renderCommunityUnreadBadge,
  renderCommunityCatchupBanner,
} from "../client/js/community-unread.js";

test("community-unread - markCommunitySeen grava e getCommunityLastSeenTs recupera", () => {
  globalThis.localStorage.clear();
  assert.equal(getCommunityLastSeenTs("comm_a"), 0);

  const t1 = 1700000000000;
  markCommunitySeen("comm_a", t1);
  assert.equal(getCommunityLastSeenTs("comm_a"), t1);

  const map = loadLastSeenMap();
  assert.equal(map.comm_a, t1);
});

test("community-unread - computeCommunityUnreadCount conta apenas tópicos com atividade nova", () => {
  const lastSeen = 1000;
  const topics = [
    { id: "t1", ts: 500, lastReplyTs: 1200 }, // bump novo
    { id: "t2", ts: 1100 },                    // post novo
    { id: "t3", ts: 800, lastReplyTs: 900 },   // antigo
  ];

  assert.equal(computeCommunityUnreadCount(topics, lastSeen), 2);
  // Sem lastSeen (primeira visita) não gera falsa urgência
  assert.equal(computeCommunityUnreadCount(topics, 0), 0);
  assert.equal(computeCommunityUnreadCount([], lastSeen), 0);
});

test("community-unread - renderCommunityUnreadBadge retorna badge apenas quando houver novidades", () => {
  assert.equal(renderCommunityUnreadBadge(0), "");
  assert.equal(renderCommunityUnreadBadge(-1), "");
  assert.ok(renderCommunityUnreadBadge(3).includes("3 novos"));
  assert.ok(renderCommunityUnreadBadge(3).includes("community-unread-pill"));
});

test("community-unread - renderCommunityCatchupBanner traz mensagem finita de 'em dia'", () => {
  const upToDate = renderCommunityCatchupBanner({ totalUnread: 0 });
  assert.ok(upToDate.includes("Você está em dia"));
  assert.ok(upToDate.includes("Sem rolagem infinita"));

  const hasNews = renderCommunityCatchupBanner({ totalUnread: 5 });
  assert.ok(hasNews.includes("5 novidades"));
});
