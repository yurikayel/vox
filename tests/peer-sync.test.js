import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const sync = await import("../client/js/peer-sync.js");

const post = (id, ts, extra = {}) => ({ id, ts, sig: "s", pubKey: {}, author: "vx_a", body: "x".repeat(400), ...extra });
const del = (id, ts) => ({ id, ts, sig: "s", pubKey: {}, author: "vx_a" });
const card = (routeId, name) => ({ routeId, name, avatarUrl: "", bio: "", handle: "" });

function fakeTimers() {
  const timers = new Map();
  let next = 1;
  return {
    setTimer: (fn, ms) => (timers.set(next, { fn, ms }), next++),
    clearTimer: (id) => timers.delete(id),
    fire: () => Promise.all([...timers.values()].map((t) => t.fn())),
    count: () => timers.size,
  };
}

function device(state, fromPeer) {
  const timers = fakeTimers();
  const shared = () => sync.selectShared({ posts: state.posts, tombstones: state.dels, cards: state.cards });
  const peer = sync.createPeerSync({
    fromPeer,
    loadShared: async () => shared(),
    loadAll: async () => ({ posts: state.posts, dels: state.dels, cards: state.cards }),
    ...timers,
  });
  return { peer, timers };
}

/** Liga dois aparelhos: o que um manda chega ao outro, como no canal WebRTC. */
async function connect(a, b) {
  const log = { aToB: [], bToA: [] };
  const deliver = (to, from, outLog) => async (msg) => {
    outLog.push(msg);
    if (msg.type === sync.SYNC_INV) await to.peer.onInventory(msg, deliver(from, to, outLog === log.aToB ? log.bToA : log.aToB));
    if (msg.type === sync.SYNC_WANT) await to.peer.onWant(msg, deliver(from, to, outLog === log.aToB ? log.bToA : log.aToB));
  };
  await a.peer.onConnect(deliver(b, a, log.aToB));
  await b.peer.onConnect(deliver(a, b, log.bToA));
  await new Promise((r) => setTimeout(r, 50));
  return log;
}

const bytes = (msgs) => msgs.reduce((n, m) => n + JSON.stringify(m).length, 0);
const ofType = (msgs, type) => msgs.filter((m) => m.type === type);

test("peer-sync - hash curto estável de 11 caracteres e recorte igual ao envio de antes", async () => {
  const h = await sync.shortHash("p1");
  assert.match(h, /^[A-Za-z0-9_-]{11}$/);
  assert.equal(await sync.shortHash("p1"), h);
  assert.notEqual(await sync.shortHash("p2"), h);
  const many = Array.from({ length: 200 }, (_, i) => post(`p${i}`, i));
  const shared = sync.selectShared({ posts: [...many, { id: "sem-assinatura" }], tombstones: [], cards: [card("vx_1", "Ana"), {}] });
  assert.equal(shared.posts.length, 128);
  assert.equal(shared.cards.length, 1);
});

test("peer-sync - aparelhos já sincronizados trocam só o inventário, sem nenhum post", async () => {
  const state = { posts: Array.from({ length: 128 }, (_, i) => post(`p${i}`, 1000 + i)), dels: [del("d1", 5)], cards: [card("vx_1", "Ana")] };
  const a = device(structuredClone(state), "peer_a");
  const b = device(structuredClone(state), "peer_b");
  const log = await connect(a, b);
  assert.equal(ofType(log.aToB, "GOSSIP").length + ofType(log.bToA, "GOSSIP").length, 0);
  assert.equal(a.timers.count() + b.timers.count(), 0, "a resposta cancela o envio completo");
  const full = [];
  await sync.sendFullState((m) => full.push(m), sync.selectShared({ posts: state.posts, tombstones: state.dels, cards: state.cards }), "peer_a");
  assert.ok(bytes(log.aToB) * 10 < bytes(full), `inventário ${bytes(log.aToB)} B contra envio completo ${bytes(full)} B`);
});

test("peer-sync - cada lado recebe só o que falta: post novo, versão editada, remoção e cartão mudado", async () => {
  const a = device({ posts: [post("p1", 10), post("p2", 20, { editedAt: 30 }), post("p3", 5)], dels: [del("p4", 50)], cards: [card("vx_1", "Ana Souza")] }, "peer_a");
  const b = device({ posts: [post("p1", 10), post("p2", 20), post("p4", 40)], dels: [], cards: [card("vx_1", "Ana")] }, "peer_b");
  const log = await connect(a, b);
  assert.deepEqual(ofType(log.aToB, "GOSSIP").map((m) => m.item.id).sort(), ["p2", "p3"]);
  assert.deepEqual(ofType(log.aToB, "GOSSIP_DELETE").map((m) => m.item.id), ["p4"]);
  assert.deepEqual(ofType(log.bToA, "GOSSIP").map((m) => m.item.id), [], "B não manda p4: A tem a remoção mais nova");
  assert.equal(ofType(log.aToB, "PROFILE_CARD").length, 1);
  assert.equal(ofType(log.bToA, "PROFILE_CARD").length, 1, "cartão diferente vai nos dois sentidos; quem recebe decide como antes");
});

test("peer-sync - cliente antigo não responde: depois do prazo vai o envio completo de antes", async () => {
  const a = device({ posts: [post("p1", 10), post("p2", 20)], dels: [], cards: [card("vx_1", "Ana")] }, "peer_a");
  const sent = [];
  await a.peer.onConnect((m) => sent.push(m));
  assert.deepEqual(sent.map((m) => m.type), [sync.SYNC_INV]);
  assert.equal(a.timers.count(), 1);
  await a.timers.fire();
  assert.deepEqual(sent.slice(1).map((m) => m.type), ["PROFILE_CARD", "GOSSIP", "GOSSIP"]);
});

test("peer-sync - recusa inventário e pedido malformados, grandes demais ou de nonce desconhecido", async () => {
  const good = { v: 1, nonce: "abcdefgh12", posts: [], dels: [], cards: [] };
  assert.ok(sync.parseInventory(good));
  assert.equal(sync.parseInventory({ ...good, v: 2 }), null);
  assert.equal(sync.parseInventory({ ...good, nonce: "x" }), null);
  assert.equal(sync.parseInventory({ ...good, posts: [["curto", 1]] }), null);
  assert.equal(sync.parseInventory({ ...good, posts: [["AAAAAAAAAAA", -1]] }), null);
  assert.equal(sync.parseInventory({ ...good, posts: Array.from({ length: 129 }, () => ["AAAAAAAAAAA", 1]) }), null);
  assert.equal(sync.parseWant({ posts: ["<script>"], dels: [], cards: [] }), null);
  const a = device({ posts: [post("p1", 10)], dels: [], cards: [] }, "peer_a");
  const out = [];
  await a.peer.onConnect(() => {});
  const stranger = await sync.shortHash("p-que-nao-esta-no-recorte");
  assert.equal(await a.peer.onWant({ ackOf: "outro-nonce", posts: [stranger], dels: [], cards: [] }, (m) => out.push(m)), 0);
  assert.equal(a.timers.count(), 1, "pedido com nonce de outra conexão não cancela o prazo");
});

test("PM-88: post com foto leva o blob ao lado, dentro do teto por blob e por conexão", async () => {
  const blobOf = (hash, kb) => ({ hash, mime: "image/png", byteLength: 1, data: "A".repeat(Math.ceil((kb * 1024) / 0.75)) });
  const blobs = { h1: blobOf("h1", 100), h2: blobOf("h2", 200), h3: blobOf("outro", 10) };
  const msgs = [
    { type: "GOSSIP", item: post("p1", 3, { mediaHash: "h1" }) },
    { type: "GOSSIP", item: post("p2", 2, { mediaHash: "h2" }) },
    { type: "GOSSIP", item: post("p3", 1, { mediaHash: "h3" }) },
    { type: "GOSSIP", item: post("p4", 0) },
  ];
  const out = await sync.attachBlobs(msgs, async (p) => blobs[p.mediaHash] || null);
  assert.equal(out[0].blob, blobs.h1);
  assert.equal("blob" in out[1], false, "blob acima do teto por blob vai sem (o tamanho é o de `data`, não o declarado)");
  assert.equal("blob" in out[2], false, "blob de outro hash não vai");
  assert.equal("blob" in out[3], false);
  const many = Array.from({ length: 30 }, (_, i) => ({ type: "GOSSIP", item: post(`q${i}`, i, { mediaHash: `q${i}` }) }));
  const sent = await sync.attachBlobs(many, async (p) => blobOf(p.mediaHash, 100));
  const total = sent.reduce((n, m) => n + (m.blob ? m.blob.data.length * 0.75 : 0), 0);
  assert.ok(sent[0].blob && !sent[29].blob, "o orçamento vai para os mais novos");
  assert.ok(total <= sync.SYNC_BLOB_LIMITS.perConnection, `${total} bytes de blob numa conexão`);
});
