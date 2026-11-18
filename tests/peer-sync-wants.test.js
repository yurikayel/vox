import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const sync = await import("../client/js/peer-sync.js");

const post = (id, ts, extra = {}) => ({ id, ts, sig: "s", pubKey: {}, author: "vx_a", body: "x", ...extra });
const del = (id, ts) => ({ id, ts, sig: "s", pubKey: {}, author: "vx_a" });
const card = (routeId, name) => ({ routeId, name, avatarUrl: "", bio: "", handle: "" });

test("peer-sync - computeWants pede post novo, ignora versão coberta e remoção mais nova", async () => {
  const shared = sync.selectShared({
    posts: [post("p1", 10), post("p2", 30, { editedAt: 30 }), post("p3", 5)],
    tombstones: [del("p4", 50)],
    cards: [card("vx_1", "Ana")],
  });
  const local = await sync.buildInventory(shared);
  const remotePosts = [
    [await sync.shortHash("p1"), 10],
    [await sync.shortHash("p2"), 30],
    [await sync.shortHash("p3"), 5],
    [await sync.shortHash("p9"), 99],
  ];
  const remote = { posts: remotePosts, dels: [[await sync.shortHash("p4"), 50]], cards: [] };
  const wants = sync.computeWants(remote, local);
  assert.deepEqual(wants.posts, [await sync.shortHash("p9")]);

  const withTomb = await sync.buildInventory({
    posts: [post("p9", 1)],
    dels: [del("p9", 100)],
    cards: [],
  });
  const noWant = sync.computeWants({ posts: [[await sync.shortHash("p9"), 50]], dels: [], cards: [] }, withTomb);
  assert.deepEqual(noWant.posts, []);
});

test("peer-sync - computeWants pede cartão quando o hash de conteúdo difere", async () => {
  const local = await sync.buildInventory({ posts: [], dels: [], cards: [card("vx_1", "Ana")] });
  const remoteHash = await sync.shortHash("vx_1");
  const remoteVer = await sync.shortHash(JSON.stringify(["Beto", "", "", "", true]));
  const wants = sync.computeWants({ posts: [], dels: [], cards: [[remoteHash, remoteVer]] }, local);
  assert.deepEqual(wants.cards, [remoteHash]);
});

test("peer-sync - inventoryMessage e messagesForWant: remoções antes de posts e cartões", async () => {
  const inv = await sync.buildInventory({
    posts: [post("p1", 1)],
    dels: [del("d1", 2)],
    cards: [card("vx_1", "Nome")],
  });
  const msg = sync.inventoryMessage(inv, "abcdefgh12", "peer_a");
  assert.equal(msg.type, sync.SYNC_INV);
  assert.equal(msg.fromPeer, "peer_a");
  assert.ok(sync.parseInventory(msg));

  const want = {
    posts: [await sync.shortHash("p1")],
    dels: [await sync.shortHash("d1")],
    cards: [await sync.shortHash("vx_1")],
  };
  const out = sync.messagesForWant(want, inv);
  assert.deepEqual(
    out.map((m) => m.type),
    ["GOSSIP_DELETE", "GOSSIP", "PROFILE_CARD"]
  );
  assert.equal(out[0].item.id, "d1");
  assert.equal(out[1].item.id, "p1");
  assert.equal(out[2].card.routeId, "vx_1");
});