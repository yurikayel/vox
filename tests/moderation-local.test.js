import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as moderation from "../client/js/moderation.js";
import * as localAccount from "../client/js/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as peers from "../client/js/peers.js";

test("moderation - block e unblock de autores locais", () => {
  localStorage.clear();
  const troll = "vx_troll_spammer_999";

  assert.equal(moderation.isUserBlocked(troll), false);
  moderation.blockUser(troll, "Spam excessivo");
  assert.equal(moderation.isUserBlocked(troll), true);

  const blocked = moderation.getBlockedUsers();
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].routeId, troll);
  assert.equal(blocked[0].reason, "Spam excessivo");

  moderation.unblockUser(troll);
  assert.equal(moderation.isUserBlocked(troll), false);
});

test("moderation - mute e unmute silencia posts sem bloquear na malha", () => {
  localStorage.clear();
  const noisy = "vx_noisy_neighbor_123";

  assert.equal(moderation.isUserMuted(noisy), false);
  moderation.muteUser(noisy);
  assert.equal(moderation.isUserMuted(noisy), true);

  assert.equal(moderation.shouldDropGossip(noisy), false);

  moderation.unmuteUser(noisy);
  assert.equal(moderation.isUserMuted(noisy), false);
});

test("moderation - filterFeedPosts remove posts de autores bloqueados e silenciados", () => {
  localStorage.clear();
  moderation.blockUser("vx_bad_actor");
  moderation.muteUser("vx_noisy_bot");

  const posts = [
    { id: "p1", author: "vx_legit_user", title: "Post normal" },
    { id: "p2", author: "vx_bad_actor", title: "Golpe financeiro" },
    { id: "p3", author: "vx_noisy_bot", title: "Muitos tweets por minuto" },
    { id: "p4", author: "vx_community_organizer", title: "Reunião de bairro" },
  ];

  const filtered = moderation.filterFeedPosts(posts);
  assert.equal(filtered.length, 2);
  assert.deepEqual(filtered.map((p) => p.id), ["p1", "p4"]);
});

test("moderation - gossip de usuário bloqueado é descartado antes do cache", async () => {
  localStorage.clear();
  await cacheNode.clearLocalPosts();

  const spammer = "vx_spammer_bot";
  moderation.blockUser(spammer, "Robô de phishing");

  const spamPost = await localAccount.signPayload({
    id: "post_spam_test_1",
    author: spammer,
    title: "Compre moedas agora",
    body: "Link malicioso",
    ts: Date.now(),
  });

  spamPost.author = spammer;

  await peers.handleVoxMessage({ type: "GOSSIP", item: spamPost, fromPeer: "peer_bot" }, () => {}, "rtc");

  const stored = await cacheNode.getLocalPost("post_spam_test_1");
  assert.equal(stored, null, "Post de autor bloqueado não deve ser salvo no IndexedDB");
});

test("moderation - quarentena local add/remove/persist por id de post", () => {
  localStorage.clear();
  const bait = "post_bait_isca_1";

  assert.equal(moderation.isPostQuarantined(bait), false);
  assert.equal(moderation.canEchoPost(bait), true);
  assert.equal(moderation.quarantinePost(bait), true);
  assert.equal(moderation.isPostQuarantined(bait), true);
  assert.equal(moderation.canEchoPost(bait), false);

  const persisted = localStorage.getItem(moderation.QUARANTINE_STORAGE_KEY);
  assert.ok(persisted.includes(bait));
  assert.deepEqual(moderation.getQuarantinedPostIds(), [bait]);

  assert.equal(moderation.unquarantinePost(bait), true);
  assert.equal(moderation.isPostQuarantined(bait), false);
  assert.equal(moderation.canEchoPost(bait), true);
  assert.deepEqual(moderation.getQuarantinedPostIds(), []);
});

test("moderation - filterFeedPosts oculta id em quarentena sem silenciar o autor", () => {
  localStorage.clear();
  moderation.quarantinePost("p-bait");

  const posts = [
    { id: "p-ok", author: "vx_same" },
    { id: "p-bait", author: "vx_same" },
    { id: "p-other", author: "vx_other" },
  ];
  const filtered = moderation.filterFeedPosts(posts);
  assert.deepEqual(filtered.map((p) => p.id), ["p-ok", "p-other"]);
  assert.equal(moderation.isUserMuted("vx_same"), false);
  assert.equal(moderation.isUserBlocked("vx_same"), false);
});

test("moderation - quarentena local não é mute de autor nem mod-action hide", () => {
  localStorage.clear();
  moderation.quarantinePost("tx_bait");
  const items = [
    { id: "tx_bait", author: "vx_author", owner: "vx_author" },
    { id: "tx_ok", author: "vx_author", owner: "vx_author" },
  ];

  const feed = moderation.filterFeedPosts(items);
  assert.deepEqual(feed.map((p) => p.id), ["tx_ok"]);

  const fromModAction = moderation.applyFilters(items, [], "owner");
  assert.equal(fromModAction.length, 2);
  assert.equal(moderation.isUserMuted("vx_author"), false);
  assert.ok(!moderation.exportModerationBundle().includes("tx_bait"));
});

test("moderation - export e import de listas de moderação", () => {
  localStorage.clear();
  moderation.blockUser("vx_troll_1", "Hate speech");
  moderation.muteUser("vx_noisy_1");

  const exported = moderation.exportModerationBundle();
  assert.ok(exported.includes("vox-moderation-list"));
  assert.ok(exported.includes("vx_troll_1"));
  assert.ok(exported.includes("vx_noisy_1"));

  localStorage.clear();
  assert.equal(moderation.isUserBlocked("vx_troll_1"), false);

  const ok = moderation.importModerationBundle(exported);
  assert.equal(ok, true);
  assert.equal(moderation.isUserBlocked("vx_troll_1"), true);
  assert.equal(moderation.isUserMuted("vx_noisy_1"), true);
});
