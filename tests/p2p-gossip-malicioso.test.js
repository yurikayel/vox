/**
 * S20 — mensagens de par malicioso que chegam em `handleVoxMessage` (peers.js): assinatura inválida, campos
 * faltando, replay, payload gigante, lápide de outro autor e tipos inesperados. Só observa o que o aparelho
 * guarda (cache local) e o que ele repassa (ouvintes); nenhum teste depende de rede.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as peers from "../client/js/peers.js";
import * as cacheNode from "../client/js/cache-node.js";
import { person } from "./signer.js";

const MESSAGE_CAP_BYTES = 1024 * 1024;

function liga() {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false });
}

let seq = 0;
const novoId = () => `p2pmal_${Date.now()}_${++seq}`;

/** Post assinado válido, datado de agora (depois da gênese). */
async function postAssinado(autor, extra = {}) {
  return autor.sign({ id: novoId(), type: "post", body: "olá malha", ts: Date.now(), ...extra });
}

/** Entrega via "rtc" e devolve o que os ouvintes viram e o que o aparelho respondeu. */
async function entrega(msg, source = "rtc") {
  const vistos = [];
  const respostas = [];
  const off = peers.onGossipPost((item) => vistos.push(item));
  try {
    await peers.handleVoxMessage(msg, (r) => respostas.push(r), source);
  } finally {
    off();
  }
  return { vistos, respostas };
}

/** Contador de descarte; 0 se o módulo ainda não o exporta (a asserção, não um TypeError, é que deve falhar). */
const conta = (k) => peers.getGossipDropCounts?.()[k] ?? 0;

const trocaPrimeiroChar = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);

test("p2p-malicioso - controle: post assinado e novo é guardado e anunciado uma vez", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice);
  const { vistos } = await entrega({ type: "GOSSIP", item: post, fromPeer: "peer_x" });
  assert.equal(vistos.length, 1);
  assert.equal((await cacheNode.getLocalPost(post.id)).id, post.id);
});

test("p2p-malicioso - assinatura adulterada não é guardada nem anunciada", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice);
  const ruim = { ...post, sig: trocaPrimeiroChar(post.sig) };
  const { vistos } = await entrega({ type: "GOSSIP", item: ruim });
  assert.equal(vistos.length, 0);
  assert.equal(await cacheNode.getLocalPost(post.id), null);
});

test("p2p-malicioso - texto trocado depois de assinar não passa", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice);
  const { vistos } = await entrega({ type: "GOSSIP", item: { ...post, body: "golpe: mande pix" } });
  assert.equal(vistos.length, 0);
  assert.equal(await cacheNode.getLocalPost(post.id), null);
});

test("p2p-malicioso - chave de outra pessoa com o autor de Alice é recusada", async () => {
  liga();
  const alice = await person();
  const mallory = await person();
  const post = await postAssinado(alice);
  const { pubKey } = await mallory.sign({ x: 1 });
  const { vistos } = await entrega({ type: "GOSSIP", item: { ...post, pubKey } });
  assert.equal(vistos.length, 0);
});

test("p2p-malicioso - Mallory assina como ela mesma mas declara o autor Alice", async () => {
  liga();
  const alice = await person();
  const mallory = await person();
  const forjado = await mallory.sign({ id: novoId(), type: "post", body: "x", ts: Date.now() });
  const { vistos } = await entrega({ type: "GOSSIP", item: { ...forjado, author: alice.routeId } });
  assert.equal(vistos.length, 0);
});

test("p2p-malicioso - sigv desconhecido não verifica, mesmo com o resto intacto", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice, { sigv: 3 });
  const { vistos } = await entrega({ type: "GOSSIP", item: post });
  assert.equal(vistos.length, 0);
});

test("p2p-malicioso - campos faltando em GOSSIP: nada lança e nada é guardado", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice);
  const semCampo = (campo) => {
    const { [campo]: _tirado, ...resto } = post;
    return resto;
  };
  for (const campo of ["id", "sig", "pubKey", "author", "type"]) {
    const { vistos } = await entrega({ type: "GOSSIP", item: semCampo(campo) });
    assert.equal(vistos.length, 0, `sem ${campo}`);
  }
  assert.equal(await cacheNode.getLocalPost(post.id), null);
});

test("p2p-malicioso - mensagem e item de formato errado são ignorados sem lançar", async () => {
  liga();
  const antes = (await cacheNode.getWirePosts()).length;
  const lixo = [null, undefined, 0, "GOSSIP", [], { type: 7 }, { type: "GOSSIP" }, { type: "GOSSIP", item: "x" },
    { type: "GOSSIP", item: 42 }, { type: "GOSSIP", item: [] }, { type: "GOSSIP_DELETE" }, { type: "GOSSIP_UPDATE", item: {} },
    { type: "CACHE_MANIFEST", item: "x" }, { type: "PROFILE_CARD", card: "x" }, { type: "DM" }, { type: "WANT" }];
  for (const msg of lixo) await peers.handleVoxMessage(msg, () => {}, "rtc");
  assert.equal((await cacheNode.getWirePosts()).length, antes);
});

test("p2p-malicioso - replay do mesmo post não é anunciado nem repassado de novo", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice);
  const primeira = await entrega({ type: "GOSSIP", item: post });
  const repeticao = await entrega({ type: "GOSSIP", item: post });
  assert.equal(primeira.vistos.length, 1);
  assert.equal(repeticao.vistos.length, 0);
});

test("p2p-malicioso - post antigo (versão menor) do mesmo id não sobrescreve a edição", async () => {
  liga();
  const alice = await person();
  const id = novoId();
  const v1 = await alice.sign({ id, type: "post", body: "v1", ts: Date.now() - 5000 });
  const v2 = await alice.sign({ id, type: "post", body: "v2", ts: Date.now() - 5000, editedAt: Date.now() });
  await entrega({ type: "GOSSIP_UPDATE", item: v2 });
  const { vistos } = await entrega({ type: "GOSSIP", item: v1 });
  assert.equal(vistos.length, 0);
  assert.equal((await cacheNode.getLocalPost(id)).body, "v2");
});

test("p2p-malicioso - outro autor não toma um id que já existe", async () => {
  liga();
  const alice = await person();
  const mallory = await person();
  const original = await postAssinado(alice, { ts: Date.now() - 1000 });
  await entrega({ type: "GOSSIP", item: original });
  const roubo = await mallory.sign({ id: original.id, type: "post", body: "meu agora", ts: Date.now() });
  const { vistos } = await entrega({ type: "GOSSIP", item: roubo });
  assert.equal(vistos.length, 0);
  assert.equal((await cacheNode.getLocalPost(original.id)).author, alice.routeId);
});

test("p2p-malicioso - edição de outro autor não altera o post de Alice", async () => {
  liga();
  const alice = await person();
  const mallory = await person();
  const original = await postAssinado(alice, { ts: Date.now() - 1000 });
  await entrega({ type: "GOSSIP", item: original });
  const edicao = await mallory.sign({ id: original.id, type: "post", body: "adulterado", ts: original.ts, editedAt: Date.now() });
  await entrega({ type: "GOSSIP_UPDATE", item: edicao });
  assert.equal((await cacheNode.getLocalPost(original.id)).body, "olá malha");
});

test("p2p-malicioso - edição sem editedAt ou com assinatura ruim é descartada", async () => {
  liga();
  const alice = await person();
  const original = await postAssinado(alice, { ts: Date.now() - 1000 });
  await entrega({ type: "GOSSIP", item: original });
  const semData = await alice.sign({ id: original.id, type: "post", body: "sem data", ts: original.ts });
  const assinaturaRuim = { ...(await alice.sign({ id: original.id, type: "post", body: "ruim", ts: original.ts, editedAt: Date.now() })) };
  assinaturaRuim.sig = trocaPrimeiroChar(assinaturaRuim.sig);
  await entrega({ type: "GOSSIP_UPDATE", item: semData });
  await entrega({ type: "GOSSIP_UPDATE", item: assinaturaRuim });
  assert.equal((await cacheNode.getLocalPost(original.id)).body, "olá malha");
});

test("p2p-malicioso - lápide de outro autor não apaga o post de Alice", async () => {
  liga();
  const alice = await person();
  const mallory = await person();
  const post = await postAssinado(alice, { ts: Date.now() - 1000 });
  await entrega({ type: "GOSSIP", item: post });
  const lapide = await mallory.sign({ id: post.id, type: "tombstone", ts: Date.now() });
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: lapide }, () => {}, "rtc");
  assert.ok(await cacheNode.getLocalPost(post.id));
  assert.equal(await cacheNode.getTombstone(post.id), null);
});

test("p2p-malicioso - lápide sem data, sem assinatura ou adulterada é descartada", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice, { ts: Date.now() - 1000 });
  await entrega({ type: "GOSSIP", item: post });
  const valida = await alice.sign({ id: post.id, type: "tombstone", ts: Date.now() });
  const { sig: _s, ...semSig } = valida;
  const semData = await alice.sign({ id: post.id, type: "tombstone" });
  const adulterada = { ...valida, sig: trocaPrimeiroChar(valida.sig) };
  for (const t of [semSig, semData, adulterada]) {
    await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: t }, () => {}, "rtc");
  }
  assert.equal(await cacheNode.getTombstone(post.id), null);
  assert.ok(await cacheNode.getLocalPost(post.id));
});

test("p2p-malicioso - lápide válida do autor apaga; replay de lápide velha não desfaz a nova", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice, { ts: Date.now() - 3000 });
  await entrega({ type: "GOSSIP", item: post });
  const velha = await alice.sign({ id: post.id, type: "tombstone", ts: Date.now() - 2000 });
  const nova = await alice.sign({ id: post.id, type: "tombstone", ts: Date.now() - 1000 });
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: nova }, () => {}, "rtc");
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: velha }, () => {}, "rtc");
  assert.equal((await cacheNode.getTombstone(post.id)).sig, nova.sig);
  assert.equal(await cacheNode.getLocalPost(post.id), null);
});

test("p2p-malicioso - post velho com assinatura válida não ressuscita depois da lápide", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice, { ts: Date.now() - 3000 });
  const lapide = await alice.sign({ id: post.id, type: "tombstone", kind: "post-tombstone", ts: post.ts, editedAt: Date.now() - 1000 });
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: lapide }, () => {}, "rtc");
  const { vistos } = await entrega({ type: "GOSSIP", item: post });
  assert.equal(vistos.length, 0);
  assert.equal(await cacheNode.getLocalPost(post.id), null);
});

test("p2p-malicioso - post anterior à gênese não entra, mesmo assinado", async () => {
  liga();
  const alice = await person();
  const antigo = await postAssinado(alice, { ts: Date.UTC(2026, 9, 1) });
  const { vistos } = await entrega({ type: "GOSSIP", item: antigo });
  assert.equal(vistos.length, 0);
  assert.equal(await cacheNode.getLocalPost(antigo.id), null);
});

test("p2p-malicioso - SYNC_INV e SYNC_WANT vindos de outra aba (broadcast) são ignorados", async () => {
  liga();
  const respostas = [];
  const inv = { type: "SYNC_INV", v: 1, nonce: "abcdefgh1234", posts: [], dels: [], cards: [] };
  await peers.handleVoxMessage(inv, (r) => respostas.push(r), "broadcast");
  await peers.handleVoxMessage({ type: "SYNC_WANT", v: 1, ackOf: "x", posts: [], dels: [], cards: [] }, (r) => respostas.push(r), "broadcast");
  assert.deepEqual(respostas, []);
});

test("p2p-malicioso - BLOB que ninguém pediu é ignorado e não vira métrica", async () => {
  liga();
  const antes = peers.getPeerMetrics().blobsReceived;
  await peers.handleVoxMessage({ type: "BLOB", txId: "A".repeat(43), data: { body: "x" }, fromPeer: "peer_x" }, () => {}, "rtc");
  assert.equal(peers.getPeerMetrics().blobsReceived, antes);
});

test("p2p-malicioso - com a ajuda desligada nenhuma mensagem faz efeito", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: false });
  const alice = await person();
  const post = await postAssinado(alice);
  const { vistos } = await entrega({ type: "GOSSIP", item: post });
  assert.equal(vistos.length, 0);
  assert.equal(await cacheNode.getLocalPost(post.id), null);
});

test("p2p-malicioso - MEMORY_BEACON com esquema perigoso não é aceito como servidor", async () => {
  liga();
  await peers.handleVoxMessage({ type: "MEMORY_BEACON", memoryUrl: "javascript:alert(1)" }, () => {}, "rtc");
  await peers.handleVoxMessage({ type: "MEMORY_BEACON", memoryUrl: "file:///etc/passwd" }, () => {}, "rtc");
  assert.ok(!/javascript:|file:/i.test(localStorage.getItem("vox-memory-server") || ""));
  assert.ok(![...localStorage.store.values()].some((v) => /javascript:|file:\/\//i.test(v)));
});

test("p2p-malicioso - WANT com txId de objeto ou gigante não responde", async () => {
  liga();
  const respostas = [];
  for (const txId of [{ toString: () => "A".repeat(43) }, "A".repeat(100000), ["A".repeat(43)], "../../etc/passwd"]) {
    await peers.handleVoxMessage({ type: "WANT", txId, fromPeer: "peer_x" }, (r) => respostas.push(r), "rtc");
  }
  assert.deepEqual(respostas, []);
});

test("p2p-malicioso - lápide só com ts (sem editedAt) não impede o post velho de voltar", async () => {
  liga();
  const alice = await person();
  const post = await postAssinado(alice, { ts: Date.now() - 3000 });
  const lapide = await alice.sign({ id: post.id, type: "tombstone", ts: Date.now() - 1000 });
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: lapide }, () => {}, "rtc");
  const { vistos } = await entrega({ type: "GOSSIP", item: post });
  assert.equal(vistos.length, 0, "handleGossipDeleteMessage usa editedAt||ts; isSupersededLocally só editedAt");
});

test("p2p-malicioso - type '__proto__' derruba handleVoxMessage (handler vira Object.prototype)", async () => {
  liga();
  const antes = conta("unknownType");
  for (const type of ["__proto__", "constructor", "toString", "hasOwnProperty", 7, null, ["WANT"]]) {
    const msg = JSON.parse(JSON.stringify({ type }));
    await assert.doesNotReject(() => peers.handleVoxMessage(msg, () => {}, "rtc"));
  }
  assert.equal(conta("unknownType") - antes, 7, "cada tipo fora da lista é contado");
});

test("p2p-malicioso - post assinado de 5 MB é aceito e guardado (GOSSIP não tem teto de tamanho)", async () => {
  liga();
  const alice = await person();
  const gigante = await postAssinado(alice, { body: "x".repeat(5 * MESSAGE_CAP_BYTES) });
  const antes = conta("oversizedMessage");
  const { vistos } = await entrega({ type: "GOSSIP", item: gigante });
  assert.equal(vistos.length, 0, "payload acima do teto deve ser descartado antes de guardar e repassar");
  assert.equal(await cacheNode.getLocalPost(gigante.id), null);
  assert.equal(conta("oversizedMessage"), antes + 1);
});

test("p2p-malicioso - lápide assinada de 5 MB é aceita e guardada (sem teto de tamanho)", async () => {
  liga();
  const alice = await person();
  const lapide = await alice.sign({ id: novoId(), type: "tombstone", ts: Date.now(), nota: "x".repeat(5 * MESSAGE_CAP_BYTES) });
  await peers.handleVoxMessage({ type: "GOSSIP_DELETE", tombstone: lapide }, () => {}, "rtc");
  assert.equal(await cacheNode.getTombstone(lapide.id), null);
});

test("p2p-malicioso - post entre o teto do item e o da mensagem é descartado e contado como item", async () => {
  liga();
  const alice = await person();
  const medio = await postAssinado(alice, { body: "x".repeat(peers.MAX_GOSSIP_ITEM_BYTES + 10) });
  const antes = conta("oversizedItem");
  const { vistos } = await entrega({ type: "GOSSIP", item: medio });
  assert.equal(vistos.length, 0);
  assert.equal(conta("oversizedItem"), antes + 1);
});

test("p2p-malicioso - post logo abaixo do teto do item continua aceito (formato legítimo intacto)", async () => {
  liga();
  const alice = await person();
  const justo = await postAssinado(alice, { body: "x".repeat(peers.MAX_GOSSIP_ITEM_BYTES - 2048) });
  const { vistos } = await entrega({ type: "GOSSIP", item: justo });
  assert.equal(vistos.length, 1);
});
