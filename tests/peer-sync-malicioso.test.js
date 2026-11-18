/**
 * S20 — peer-sync.js com um par malicioso do outro lado: inventário e pedido forjados, versões absurdas, hashes
 * fora do recorte, replay de SYNC_WANT, blobs que mentem e `loadBlob` que falha. Complementa `peer-sync.test.js`
 * (caminho feliz e validações básicas) sem repetir os mesmos casos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as sync from "../client/js/peer-sync.js";

const HASH = "AAAAAAAAAAA";
const post = (id, ts, extra = {}) => ({ id, ts, sig: "s", pubKey: {}, author: "vx_a", body: "x", ...extra });
const del = (id, ts) => ({ id, ts, sig: "s", pubKey: {}, author: "vx_a" });
const goodInv = { v: 1, nonce: "abcdefgh12", posts: [], dels: [], cards: [] };

function timers() {
  const map = new Map();
  let next = 1;
  return {
    setTimer: (fn, ms) => (map.set(next, { fn, ms }), next++),
    clearTimer: (id) => map.delete(id),
    count: () => map.size,
    fire: () => Promise.all([...map.values()].map((t) => t.fn())),
  };
}

function aparelho(state, extra = {}) {
  const t = timers();
  const shared = () => sync.selectShared({ posts: state.posts || [], tombstones: state.dels || [], cards: state.cards || [] });
  const peer = sync.createPeerSync({
    fromPeer: "peer_a",
    loadShared: async () => shared(),
    loadAll: async () => ({ posts: state.posts || [], dels: state.dels || [], cards: state.cards || [] }),
    setTimer: t.setTimer,
    clearTimer: t.clearTimer,
    ...extra,
  });
  return { peer, t };
}

test("peer-sync-malicioso - parseInventory recusa nonce fora do padrão e versão que não é 1", () => {
  for (const nonce of ["", "curto", "a".repeat(33), "abc def ghij", "abcdefgh1\n", "ação-ação-1", null, {}]) {
    assert.equal(sync.parseInventory({ ...goodInv, nonce }), null, JSON.stringify(nonce));
  }
  for (const v of [0, 2, "1", null, undefined, 1.5]) assert.equal(sync.parseInventory({ ...goodInv, v }), null, String(v));
});

test("peer-sync-malicioso - parseInventory recusa entradas de forma errada ou com versão absurda", () => {
  const ruins = [
    ["curto", 1], [HASH], [HASH, 1, "extra"], [`${HASH}A`, 1], ["AAAAAAAAAA\n", 1], [HASH, NaN], [HASH, Infinity], [HASH, -0.5],
    [HASH, null], [HASH, {}], [HASH, []], [HASH, "texto longo demais"], [HASH, true], null, "AAAAAAAAAAA", 7, {},
  ];
  for (const entrada of ruins) {
    assert.equal(sync.parseInventory({ ...goodInv, posts: [entrada] }), null, JSON.stringify(entrada));
  }
});

test("peer-sync-malicioso - listas fora do teto, de outro tipo ou ausentes não passam; o teto exato passa", () => {
  const n = (len) => Array.from({ length: len }, () => [HASH, 1]);
  assert.ok(sync.parseInventory({ ...goodInv, posts: n(128), dels: n(64), cards: n(256) }));
  assert.equal(sync.parseInventory({ ...goodInv, dels: n(65) }), null);
  assert.equal(sync.parseInventory({ ...goodInv, cards: n(257) }), null);
  for (const campo of ["posts", "dels", "cards"]) {
    for (const valor of [undefined, null, "x", {}, 5]) assert.equal(sync.parseInventory({ ...goodInv, [campo]: valor }), null, `${campo}=${valor}`);
  }
  for (const msg of [null, undefined, "x", 1, []]) assert.equal(sync.parseInventory(msg), null);
});

test("peer-sync-malicioso - parseWant recusa hash de tamanho errado, objeto, lista gigante e mensagem vazia", () => {
  const ok = { ackOf: "n", posts: [HASH], dels: [], cards: [] };
  assert.ok(sync.parseWant(ok));
  for (const ruim of [`${HASH}A`, "curto", "AAAAAAAAAA\n", "AAAAAAAAAA/", {}, null]) {
    assert.equal(sync.parseWant({ ...ok, posts: [ruim] }), null, JSON.stringify(ruim));
  }
  assert.equal(sync.parseWant({ ...ok, posts: Array.from({ length: 129 }, () => HASH) }), null);
  assert.equal(sync.parseWant({ ...ok, dels: Array.from({ length: 65 }, () => HASH) }), null);
  assert.equal(sync.parseWant({ ...ok, cards: Array.from({ length: 257 }, () => HASH) }), null);
  for (const msg of [null, undefined, "x", 3, {}, { posts: [] }]) assert.equal(sync.parseWant(msg), null);
});

test("peer-sync-malicioso - parseWant não confia no ackOf: objeto vira texto e ausente vira vazio", () => {
  assert.equal(sync.parseWant({ ackOf: undefined, posts: [], dels: [], cards: [] }).ackOf, "");
  assert.equal(sync.parseWant({ ackOf: { a: 1 }, posts: [], dels: [], cards: [] }).ackOf, "[object Object]");
});

test("peer-sync-malicioso - onInventory malformado não responde nada", async () => {
  const { peer } = aparelho({ posts: [post("p1", 1)] });
  const out = [];
  for (const msg of [null, {}, { ...goodInv, v: 9 }, { ...goodInv, posts: [["x", 1]] }, { ...goodInv, nonce: "!" }]) {
    assert.equal(await peer.onInventory(msg, (m) => out.push(m)), null);
  }
  assert.deepEqual(out, []);
});

test("peer-sync-malicioso - inventário com posts que o par diz ter só gera pedido do que falta", async () => {
  const { peer } = aparelho({ posts: [post("p1", 100)] });
  const tenho = await sync.shortHash("p1");
  const naoTenho = await sync.shortHash("p-novo");
  const out = [];
  const wants = await peer.onInventory({ ...goodInv, posts: [[tenho, 100], [naoTenho, 5]] }, (m) => out.push(m));
  assert.deepEqual(wants.posts, [naoTenho]);
  assert.equal(out[0].ackOf, goodInv.nonce);
  assert.ok(out[0].posts.length <= sync.SYNC_LIMITS.posts);
});

test("peer-sync-malicioso - versão enorme anunciada só pede de novo, dentro do teto do inventário", async () => {
  const { peer } = aparelho({ posts: [post("p1", 100)] });
  const tenho = await sync.shortHash("p1");
  const wants = await peer.onInventory({ ...goodInv, posts: [[tenho, Number.MAX_SAFE_INTEGER]] }, () => {});
  assert.deepEqual(wants.posts, [tenho]);
  assert.ok(wants.posts.length <= sync.SYNC_LIMITS.posts);
});

test("peer-sync-malicioso - post que o par anuncia mais velho que a minha lápide não é pedido (replay)", async () => {
  const { peer } = aparelho({ posts: [], dels: [del("p1", 500)] });
  const h = await sync.shortHash("p1");
  const wants = await peer.onInventory({ ...goodInv, posts: [[h, 100]] }, () => {});
  assert.deepEqual(wants.posts, []);
});

test("peer-sync-malicioso - selectShared tira itens sem assinatura e respeita o recorte de cada lista", () => {
  const posts = [post("a", 1), { id: "b", ts: 1 }, null, post("c", 1, { sig: "" }), post("d", 1, { pubKey: undefined })];
  const shared = sync.selectShared({ posts, tombstones: [del("t", 1), { id: "u" }], cards: [{ routeId: "r" }, { name: "sem rota" }, null] });
  assert.deepEqual(shared.posts.map((p) => p.id), ["a"]);
  assert.deepEqual(shared.dels.map((p) => p.id), ["t"]);
  assert.deepEqual(shared.cards.map((c) => c.routeId), ["r"]);
  const muitos = Array.from({ length: 500 }, (_, i) => post(`m${i}`, i));
  assert.equal(sync.selectShared({ posts: muitos }).posts.length, sync.SYNC_LIMITS.posts);
});

test("peer-sync-malicioso - hash chutado de post privado (fora do recorte) não é servido", async () => {
  const privados = Array.from({ length: 130 }, (_, i) => post(`priv${i}`, 1000 - i));
  const { peer } = aparelho({ posts: privados });
  await peer.onConnect(() => {});
  const fora = await sync.shortHash("priv129");
  const out = [];
  const enviados = await peer.onWant({ ackOf: "x", posts: [fora], dels: [], cards: [] }, (m) => out.push(m));
  assert.equal(enviados, 0);
  assert.deepEqual(out, []);
});

test("peer-sync-malicioso - pedido com hash duplicado ou inexistente só devolve o que existe, no máximo uma vez por hash do recorte", async () => {
  const { peer } = aparelho({ posts: [post("p1", 1)] });
  await peer.onConnect(() => {});
  const h = await sync.shortHash("p1");
  const out = [];
  await peer.onWant({ ackOf: "x", posts: [h, h, await sync.shortHash("nao-existe")], dels: [], cards: [] }, (m) => out.push(m));
  assert.ok(out.every((m) => m.item?.id === "p1"));
  assert.ok(out.length <= 2, "duplicata do mesmo hash não pode multiplicar além do que foi pedido");
});

test("peer-sync-malicioso - nonce errado não cancela o prazo; o certo cancela uma única vez", async () => {
  const { peer, t } = aparelho({ posts: [post("p1", 1)] });
  const enviados = [];
  const nonce = await peer.onConnect((m) => enviados.push(m));
  assert.equal(t.count(), 1);
  const want = { posts: [], dels: [], cards: [] };
  await peer.onWant({ ...want, ackOf: "falso" }, () => {});
  assert.equal(t.count(), 1);
  await peer.onWant({ ...want, ackOf: nonce }, () => {});
  assert.equal(t.count(), 0);
  assert.equal(enviados[0].nonce, nonce);
});

test("peer-sync-malicioso - cada conexão usa um nonce novo, com o formato que parseInventory aceita", async () => {
  const { peer } = aparelho({});
  const msgs = [];
  for (let i = 0; i < 20; i++) await peer.onConnect((m) => msgs.push(m));
  assert.equal(new Set(msgs.map((m) => m.nonce)).size, 20);
  assert.ok(msgs.every((m) => sync.parseInventory(m) !== null));
});

test("peer-sync-malicioso - sem resposta no prazo vai o envio completo, uma vez, e o prazo some", async () => {
  const { peer, t } = aparelho({ posts: [post("p1", 1)], cards: [{ routeId: "vx_r", name: "N" }] });
  const out = [];
  await peer.onConnect((m) => out.push(m));
  await t.fire();
  const tipos = out.map((m) => m.type);
  assert.deepEqual(tipos.filter((x) => x !== sync.SYNC_INV).sort(), ["GOSSIP", "PROFILE_CARD"]);
});

test("peer-sync-malicioso - attachBlobs descarta blob de hash trocado, e blob acima do teto", async () => {
  const dado = (kb) => "A".repeat(Math.ceil((kb * 1024) / 0.75));
  const blobs = {
    ok: { hash: "ok", data: dado(10) },
    troca: { hash: "outro", data: dado(1) },
    gigante: { hash: "gigante", data: dado(129) },
    sem: null,
  };
  const msgs = Object.keys(blobs).map((h, i) => ({ type: "GOSSIP", item: post(`b${i}`, i, { mediaHash: h }) }));
  const out = await sync.attachBlobs(msgs, async (p) => blobs[p.mediaHash]);
  assert.deepEqual(out.map((m) => "blob" in m), [true, false, false, false]);
});

test("peer-sync-malicioso - blob só vai em GOSSIP: GOSSIP_DELETE e PROFILE_CARD nunca levam", async () => {
  const msgs = [{ type: "GOSSIP_DELETE", item: del("x", 1) }, { type: "PROFILE_CARD", card: { routeId: "r", mediaHash: "h" } }];
  const out = await sync.attachBlobs(msgs, async () => ({ hash: "h", data: "AAAA" }));
  assert.equal(out.some((m) => "blob" in m), false);
});

test("peer-sync-malicioso - shortHash é estável para entradas estranhas e sempre tem 11 caracteres", async () => {
  for (const x of ["", "\u0000", "ação", "💥".repeat(1000), undefined, null, 42, "a".repeat(100000)]) {
    assert.match(await sync.shortHash(x), /^[A-Za-z0-9_-]{11}$/);
  }
  assert.equal(await sync.shortHash(42), await sync.shortHash("42"));
});

test.todo("peer-sync-malicioso - BUG: nonce e hash numéricos passam na validação (o regex coage número para texto)", () => {
  assert.equal(sync.parseInventory({ ...goodInv, nonce: 12345678 }), null, "nonce deve ser texto");
  assert.equal(sync.parseWant({ ackOf: "n", posts: [12345678901], dels: [], cards: [] }), null, "hash deve ser texto");
  assert.equal(sync.parseWant({ ackOf: "n", posts: [[HASH]], dels: [], cards: [] }), null, "lista aninhada vira texto no regex");
});

test.todo("peer-sync-malicioso - BUG: SYNC_WANT repetido é servido toda vez (sem consumir o nonce): amplificação de banda", async () => {
  const { peer } = aparelho({ posts: [post("p1", 1)] });
  const nonce = await peer.onConnect(() => {});
  const h = await sync.shortHash("p1");
  const want = { ackOf: nonce, posts: [h], dels: [], cards: [] };
  const primeira = await peer.onWant(want, () => {});
  const repeticao = await peer.onWant(want, () => {});
  assert.equal(primeira, 1);
  assert.equal(repeticao, 0, "o mesmo pedido da mesma conexão não deveria ser servido de novo");
});

test.todo("peer-sync-malicioso - BUG: SYNC_WANT com nonce desconhecido ainda recebe os itens do recorte", async () => {
  const { peer } = aparelho({ posts: [post("p1", 1)] });
  await peer.onConnect(() => {});
  const enviados = await peer.onWant({ ackOf: "nonce-que-nunca-existiu", posts: [await sync.shortHash("p1")], dels: [], cards: [] }, () => {});
  assert.equal(enviados, 0, "sem inventário anunciado nesta conexão, não há o que servir");
});

test.todo("peer-sync-malicioso - BUG: um loadBlob que lança impede o envio de todos os outros posts do pedido", async () => {
  const { peer } = aparelho(
    { posts: [post("p1", 2, { mediaHash: "ruim" }), post("p2", 1)] },
    { loadBlob: async (p) => { if (p.mediaHash === "ruim") throw new Error("registro corrompido"); return null; } },
  );
  await peer.onConnect(() => {});
  const out = [];
  const want = { ackOf: "x", posts: [await sync.shortHash("p1"), await sync.shortHash("p2")], dels: [], cards: [] };
  await peer.onWant(want, (m) => out.push(m)).catch(() => {});
  assert.ok(out.some((m) => m.item?.id === "p2"), "o post sem foto deveria ir mesmo assim");
});
