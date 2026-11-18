/**
 * @file DM — testes adversariais do fluxo de entrada: o que acontece quando quem manda (ou o relay no meio) age
 * de má-fé. Cobre o caminho real `relay → cryptoDm.open → ingestDecryptedEnvelope → IndexedDB → renderização`,
 * com criptografia de verdade e `fetch` trocado por um relay em memória (nenhum tráfego sai da máquina).
 *
 * Os testes em `skip` marcam defeitos que não têm correção pequena e local; o motivo está em cada um e no PR.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as contacts from "../client/js/contacts.js";
import * as dmMsg from "../client/js/dm-messenger.js";
import * as guardians from "../client/js/identity/guardians.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import { ingestDecryptedEnvelope } from "../client/js/app/dm-wire.js";
import { pollInboxMessages } from "../client/js/app/screens-dm.js";
import { renderDmThread } from "../client/js/render/dm.js";
import { person } from "./signer.js";

let me = "";
let myPub = null;
let counter = 0;
const nextId = () => `dm_adv_${++counter}`;
const nextPeer = () => `vx_adv_peer_${++counter}`;
const realFetch = globalThis.fetch;

before(async () => {
  localStorage.clear();
  await localAccount.wipeLocalAccount();
  me = (await localAccount.ensureLocalAccount()).routeId;
  myPub = (await cryptoDm.ensureDmKeys()).publicJwk;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  contacts.__resetContactsForTests();
  [guardians.HELD_STORAGE, mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.NOTICES_STORAGE].forEach((k) => localStorage.removeItem(k));
});

/** Relay em memória: serve `envelopes` na caixa de `me` e anota o que foi apagado. Qualquer outra rota dá 404. */
function mockRelay(envelopes) {
  const deleted = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (init.method === "DELETE") {
      deleted.push(decodeURIComponent(u.split("/").pop()));
      return { ok: true };
    }
    if (u.includes(`/inbox/${encodeURIComponent(me)}`)) return { ok: true, json: async () => ({ envelopes }) };
    return { ok: false, status: 404, text: async () => "" };
  };
  return { deleted };
}

/** Envelope de DM selado de verdade para a chave de DM deste aparelho. */
const sealToMe = (text, meta) => cryptoDm.seal(myPub, text, meta);
const envOf = (from, over = {}) => ({ id: nextId(), from, to: me, ts: Date.now(), ...over });
const textsOf = async (peer) => (await cacheNode.getDmMessages(peer)).map((m) => m.text);

function renderedHtml(peer, messages) {
  const main = { innerHTML: "" };
  renderDmThread(main, peer, messages, me, {});
  return main.innerHTML;
}

const cardPayload = (url) => JSON.stringify({ __vox_dm_v2: 1, kind: "message", text: "veja", contextCard: { type: "topic", title: "Tópico", url } });

// ---- caminho feliz (controle) ----

test("dm adversarial - controle: DM válida pelo relay vira mensagem e sai da caixa", async () => {
  const peer = nextPeer();
  const env = await sealToMe("oi, tudo bem?", { from: peer, to: me });
  const relay = mockRelay([env]);
  assert.equal(await pollInboxMessages(me), 1);
  assert.deepEqual(await textsOf(peer), ["oi, tudo bem?"]);
  assert.deepEqual(relay.deleted, [env.id]);
});

// ---- envelope adulterado, cortado ou malformado ----

test("dm adversarial - relay não troca from nem to: o AAD derruba o envelope", async () => {
  const mallory = nextPeer();
  const alice = nextPeer();
  const original = await sealToMe("quem manda sou eu", { from: mallory, to: me });
  const relay = mockRelay([{ ...original, from: alice }, { ...(await sealToMe("x", { from: mallory, to: me })), to: "vx_outro" }]);
  assert.equal(await pollInboxMessages(me), 0);
  assert.deepEqual(await textsOf(alice), []);
  assert.deepEqual(await textsOf(mallory), []);
  assert.deepEqual(relay.deleted, []);
});

test("dm adversarial - envelope cortado, sem campos ou lixo não derruba o poll nem vira mensagem", async () => {
  const peer = nextPeer();
  const good = await sealToMe("inteira", { from: peer, to: me });
  const cut = { ...good, id: nextId(), ct: good.ct.slice(0, Math.floor(good.ct.length / 2)) };
  const noIv = { ...good, id: nextId(), iv: undefined };
  const badEph = { ...good, id: nextId(), ephPub: { kty: "EC", crv: "P-256", x: "x", y: "y" } };
  mockRelay([null, "texto solto", 42, [], {}, { v: 2 }, cut, noIv, badEph, good]);
  assert.equal(await pollInboxMessages(me), 1, "só a inteira conta");
  assert.deepEqual(await textsOf(peer), ["inteira"]);
});

test("dm adversarial - resposta do relay que não é lista de envelopes é ignorada", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ envelopes: { 0: "não é array" } }) });
  assert.equal(await pollInboxMessages(me), 0);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError("JSON cortado"); } });
  assert.equal(await pollInboxMessages(me), 0);
});

test("dm adversarial - texto decifrado com JSON cortado aparece como texto, sem virar cartão nem derrubar", async () => {
  const peer = nextPeer();
  const cutJson = '{"__vox_dm_v2":1,"kind":"message","text":"oi","contextCard":{"type":"topic","title":"T';
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), cutJson), true);
  const [msg] = await cacheNode.getDmMessages(peer);
  assert.equal(msg.text, cutJson);
  assert.equal(msg.contextCard, null);
});

// ---- destinatário ----

test("dm adversarial - DM selada para outra conta, largada na minha caixa, não entra nos meus fios", async () => {
  const peer = nextPeer();
  const stray = await sealToMe("era para outra pessoa", { from: peer, to: "vx_outra_conta" });
  mockRelay([stray]);
  assert.equal(await pollInboxMessages(me), 0);
  assert.deepEqual(await textsOf(peer), []);
});

// ---- replay e colisão de id ----

test("dm adversarial - replay do mesmo envelope não duplica a mensagem", async () => {
  const peer = nextPeer();
  const env = envOf(peer);
  await ingestDecryptedEnvelope(env, "uma vez só");
  await ingestDecryptedEnvelope(env, "uma vez só");
  assert.deepEqual(await textsOf(peer), ["uma vez só"]);
});

test("dm adversarial - replay não apaga a reação que já pus na mensagem", async () => {
  const peer = nextPeer();
  const env = envOf(peer);
  await ingestDecryptedEnvelope(env, "boa notícia");
  await cacheNode.saveDmMessage({ ...(await cacheNode.getDmMessages(peer))[0], reactions: { "👍": [me] } });
  await ingestDecryptedEnvelope(env, "boa notícia");
  const [msg] = await cacheNode.getDmMessages(peer);
  assert.deepEqual(msg.reactions, { "👍": [me] });
});

test("dm adversarial - segundo envelope com o mesmo id não reescreve a mensagem guardada", async () => {
  const peer = nextPeer();
  const env = envOf(peer);
  await ingestDecryptedEnvelope(env, "texto original");
  await ingestDecryptedEnvelope({ ...env, ts: env.ts + 1 }, "texto trocado depois");
  assert.deepEqual(await textsOf(peer), ["texto original"]);
});

test("dm adversarial - id de mensagem de outra conversa não é sequestrado por outro remetente", async () => {
  const alice = nextPeer();
  const mallory = nextPeer();
  const env = envOf(alice);
  await ingestDecryptedEnvelope(env, "mensagem da Alice");
  await ingestDecryptedEnvelope(envOf(mallory, { id: env.id }), "Mallory tomando o id");
  assert.deepEqual(await textsOf(alice), ["mensagem da Alice"]);
  assert.deepEqual(await textsOf(mallory), []);
});

test("dm adversarial - envelope sem id não grava nada e não derruba", async () => {
  const peer = nextPeer();
  await ingestDecryptedEnvelope(envOf(peer, { id: "" }), "sem id");
  assert.deepEqual(await textsOf(peer), []);
});

test("dm adversarial - replay de reação liga e desliga a reação", { skip: "sem fix pequeno: exige guardar os ids de envelope já vistos (estado persistente novo); anotado no PR" }, async () => {
  const peer = nextPeer();
  await ingestDecryptedEnvelope(envOf(peer), "alvo");
  const [target] = await cacheNode.getDmMessages(peer);
  const react = envOf(peer);
  const wire = dmMsg.serializeDmReaction({ targetId: target.id, emoji: "👍" });
  await ingestDecryptedEnvelope(react, wire);
  await ingestDecryptedEnvelope(react, wire);
  assert.deepEqual((await cacheNode.getDmMessages(peer))[0].reactions, { "👍": [peer] });
});

// ---- remetente forjado ----

test("dm adversarial - quem sabe só a chave pública de DM não deve se passar por outra pessoa", { skip: "sem fix pequeno: o envelope de DM comum não é assinado (só o `from`/`to` entram no AAD); assinar a DM é a RFC 0002 / revisão externa LAN-18; anotado no PR" }, async () => {
  const alice = nextPeer();
  const forged = await sealToMe("Alice aqui, manda o Pix", { from: alice, to: me });
  mockRelay([forged]);
  await pollInboxMessages(me);
  assert.deepEqual(await textsOf(alice), [], "mensagem forjada não pode entrar no fio da Alice");
});

test("dm adversarial - reação e leitura vindas de outro remetente não mexem no fio alheio", async () => {
  const alice = nextPeer();
  const mallory = nextPeer();
  await ingestDecryptedEnvelope(envOf(alice), "msg da Alice");
  const [target] = await cacheNode.getDmMessages(alice);
  const wire = dmMsg.serializeDmReaction({ targetId: target.id, emoji: "🔥" });
  assert.equal(await ingestDecryptedEnvelope(envOf(mallory), wire), false, "alvo não está no fio de Mallory");
  assert.deepEqual((await cacheNode.getDmMessages(alice))[0].reactions, {});
  assert.deepEqual(await textsOf(mallory), [], "reação não cria fio fantasma");
});

// ---- texto, HTML e cartão de contexto ----

test("dm adversarial - HTML e script no texto, no título e na resposta saem escapados na tela", async () => {
  const peer = nextPeer();
  const evil = '<script>alert(1)</script><img src=x onerror="alert(2)">';
  const wire = JSON.stringify({
    __vox_dm_v2: 1,
    kind: "message",
    text: evil,
    replyTo: { id: "r1", author: evil, snippet: evil },
    contextCard: { type: "pix", title: evil, pixKey: '"><script>alert(3)</script>' },
  });
  await ingestDecryptedEnvelope(envOf(peer), wire);
  const html = renderedHtml(peer, await cacheNode.getDmMessages(peer));
  assert.ok(!/<script/i.test(html), "nenhum <script> cru");
  assert.ok(!/<img[^>]*onerror/i.test(html), "nenhum <img onerror> cru");
  assert.ok(html.includes("&lt;script&gt;alert(1)"));
});

test("dm adversarial - href do cartão com esquema perigoso é descartado", async () => {
  const evil = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "https://evil.example/phish",
    "//evil.example/phish",
  ];
  for (const url of evil) {
    const card = dmMsg.parseDmPayload(cardPayload(url)).contextCard;
    assert.equal(card?.url, "", `url ${JSON.stringify(url)} deve cair`);
    assert.equal(card?.href, "", `href ${JSON.stringify(url)} deve cair`);
  }
});

test("dm adversarial - cartão com `href` (alias de `url`) perigoso também é descartado e a tela não cria link", async () => {
  const peer = nextPeer();
  const wire = JSON.stringify({ __vox_dm_v2: 1, kind: "message", text: "x", contextCard: { type: "listing", title: "Bike", href: "javascript:alert(1)" } });
  await ingestDecryptedEnvelope(envOf(peer), wire);
  const html = renderedHtml(peer, await cacheNode.getDmMessages(peer));
  assert.ok(!/href="\s*javascript:/i.test(html), "sem href javascript:");
  assert.ok(!html.includes("dm-context-link"), "sem botão Abrir quando a rota é inválida");
});

test("dm adversarial - rotas internas legítimas do cartão continuam valendo", () => {
  for (const url of ["#/t/abc123", "#/c/horta?tab=listings", "#/dm/vx_abc"]) {
    assert.equal(dmMsg.parseDmPayload(cardPayload(url)).contextCard.url, url);
  }
});

test("dm adversarial - texto com #/t/ ou #/c/ gera só rota interna, mesmo com lixo em volta", () => {
  const card = dmMsg.extractInlineVoxCard('javascript:alert(1)//#/t/abc"onmouseover="x');
  assert.equal(card.url, "#/t/abc");
  assert.equal(dmMsg.extractInlineVoxCard("#/c/<img src=x onerror=1>")?.url ?? "", "");
});

// ---- tamanho ----

test("dm adversarial - foto grande demais, fora do formato ou não-imagem não vira anexo", () => {
  const big = `data:image/png;base64,${"A".repeat(dmMsg.MAX_DM_MEDIA_CHARS)}`;
  const html = "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";
  const svg = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+";
  for (const raw of [big, html, svg, 'data:image/png;base64,AAAA" onerror="x']) {
    const wire = JSON.stringify({ __vox_dm_v2: 1, kind: "message", text: "foto", mediaDataUrl: raw });
    assert.equal(dmMsg.parseDmPayload(wire).mediaDataUrl, "");
  }
});

test("dm adversarial - título, preço e citação gigantes são cortados no tamanho de tela", () => {
  const huge = "Z".repeat(1_000_000);
  const wire = JSON.stringify({
    __vox_dm_v2: 1,
    kind: "message",
    text: "ok",
    replyTo: { id: "r", snippet: huge },
    contextCard: { type: "listing", title: huge, price: huge },
  });
  const parsed = dmMsg.parseDmPayload(wire);
  assert.ok(parsed.replyTo.snippet.length <= 90);
  assert.ok(parsed.contextCard.title.length <= 100);
  assert.ok(parsed.contextCard.price.length <= 32);
});

test("dm adversarial - texto gigante de uma única DM é guardado inteiro, sem teto", { skip: "decisão de produto pendente: não há limite de texto no compositor nem na entrada; precisa fixar o teto (e o que fazer acima dele) antes de cortar. Anotado no PR" }, async () => {
  const peer = nextPeer();
  await ingestDecryptedEnvelope(envOf(peer), "A".repeat(5_000_000));
  const [msg] = await cacheNode.getDmMessages(peer);
  assert.ok(!msg || msg.text.length <= 100_000, "texto acima do teto não pode ser guardado inteiro");
});

test("dm adversarial - mensagem sem texto, sem cartão e sem foto (tipo desconhecido) não vira balão vazio", async () => {
  const peer = nextPeer();
  const future = JSON.stringify({ __vox_dm_v2: 1, kind: "algo-do-futuro", payload: { x: 1 } });
  await ingestDecryptedEnvelope(envOf(peer), future);
  assert.deepEqual(await cacheNode.getDmMessages(peer), []);
});

// ---- ordem e relógio ----

test("dm adversarial - mensagens fora de sequência aparecem em ordem de horário", async () => {
  const peer = nextPeer();
  const base = Date.now() - 60_000;
  for (const [i, text] of [[3, "terceira"], [1, "primeira"], [2, "segunda"]]) {
    await ingestDecryptedEnvelope(envOf(peer, { ts: base + i * 1000 }), text);
  }
  assert.deepEqual(await textsOf(peer), ["primeira", "segunda", "terceira"]);
});

test("dm adversarial - reação que chega antes da mensagem se perde sem criar fantasma", async () => {
  const peer = nextPeer();
  const wire = dmMsg.serializeDmReaction({ targetId: "dm_ainda_nao_chegou", emoji: "❤️" });
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), wire), false);
  assert.deepEqual(await cacheNode.getDmMessages(peer), []);
});

test("dm adversarial - horário no futuro (campo do envelope, que ninguém assina) não prende a mensagem no topo", async () => {
  const peer = nextPeer();
  const year3000 = 32_503_680_000_000;
  await ingestDecryptedEnvelope(envOf(peer, { ts: year3000 }), "vim do futuro");
  const [msg] = await cacheNode.getDmMessages(peer);
  assert.ok(msg.ts <= Date.now() + 10 * 60 * 1000, `ts ${msg.ts} deve cair para a hora de chegada`);
});

test("dm adversarial - horário inválido (texto, negativo, NaN) vira a hora de chegada", async () => {
  const peer = nextPeer();
  for (const ts of ["amanhã", -5, NaN, {}, [1]]) await ingestDecryptedEnvelope(envOf(peer, { id: nextId(), ts }), `ts ${typeof ts}`);
  const msgs = await cacheNode.getDmMessages(peer);
  assert.equal(msgs.length, 5);
  assert.ok(msgs.every((m) => Number.isFinite(m.ts) && m.ts > 0), "todo ts é número positivo");
});

// ---- DM de guardião e de malha forjada ----

async function signedShareText(author, to) {
  const secret = crypto.getRandomValues(new Uint8Array(16));
  const split = guardians.buildShareBodies({ secret, kind: "semente", guardians: [to, "vx_g2", "vx_g3"], m: 2 });
  const body = split.bodies.find((b) => b.to === to).body;
  return { signed: await author.sign(body), body };
}

test("dm adversarial - pedaço de guardião: sem laço, de outro remetente ou com assinatura quebrada não é guardado", async () => {
  const mallory = await person();
  const { signed } = await signedShareText(mallory, me);
  const wire = guardians.serializeGuardianDm(signed);
  assert.equal(await ingestDecryptedEnvelope(envOf(mallory.routeId), wire), "guardian");
  assert.equal(guardians.listHeld().length, 0, "quem não é laço mútuo não vira dona de pedaço");

  contacts.addContact(mallory.routeId, "Mallory");
  assert.equal(await ingestDecryptedEnvelope(envOf("vx_alice_forjada"), wire), "guardian");
  assert.equal(guardians.listHeld().length, 0, "`from` diferente do autor assinado é recusado");

  const tampered = guardians.serializeGuardianDm({ ...signed, ownerName: "Outra pessoa" });
  assert.equal(await ingestDecryptedEnvelope(envOf(mallory.routeId), tampered), "guardian");
  assert.equal(guardians.listHeld().length, 0, "assinatura não cobre o corpo adulterado");
});

test("dm adversarial - controle: o mesmo pedaço, de um contato com assinatura boa, é guardado", async () => {
  const friend = await person();
  contacts.addContact(friend.routeId, "Amiga");
  const { signed } = await signedShareText(friend, me);
  const wire = guardians.serializeGuardianDm(signed);
  assert.equal(await ingestDecryptedEnvelope(envOf(friend.routeId), wire), "guardian");
  assert.deepEqual(guardians.listHeld().map((h) => h.owner), [friend.routeId]);
  assert.deepEqual(await cacheNode.getDmMessages(friend.routeId), [], "DM de guardião não vai para o fio");
});

test("dm adversarial - revogação assinada por outra pessoa não apaga o pedaço da dona", async () => {
  const owner = await person();
  const mallory = await person();
  contacts.addContact(owner.routeId, "Dona");
  const { signed, body } = await signedShareText(owner, me);
  await ingestDecryptedEnvelope(envOf(owner.routeId), guardians.serializeGuardianDm(signed));
  assert.equal(guardians.listHeld().length, 1);

  const revoke = await mallory.sign(guardians.buildRevokeBody({ to: me, splitId: body.splitId }));
  await ingestDecryptedEnvelope(envOf(mallory.routeId), guardians.serializeGuardianDm(revoke));
  assert.equal(guardians.listHeld().length, 1, "só a própria dona revoga o próprio pedaço");
});

test("dm adversarial - cofre na malha: guarda forjada por quem não é laço mútuo não é aceita", async () => {
  const mallory = await person();
  const body = mesh.buildGuardBody({ to: me, address: "vxa_fake", record: { v: 2 }, updatedAt: Date.now() });
  const wire = mesh.serializeMeshDm(await mallory.sign(body));
  assert.equal(await ingestDecryptedEnvelope(envOf(mallory.routeId), wire), "guardian");
  assert.deepEqual(Object.keys(mesh.loadHeld()), []);
});

test("dm adversarial - cofre na malha: aviso de pedido forjado por quem não guarda minha cópia não dispara alarme", { skip: "sem fix pequeno: o aviso só é aceito de quem guarda a cópia, mas `mine.sentTo` é por aparelho e o aviso cai no primeiro aparelho que abrir a caixa; exige decidir como os aparelhos da dona sabem quem guarda (ADR-037). Anotado no PR" }, async () => {
  const mallory = await person();
  const notice = mesh.buildNoticeBody({ to: me, requestId: "r_forjado", firstSeen: Date.now() });
  const wire = mesh.serializeMeshDm(await mallory.sign(notice));
  assert.equal(await ingestDecryptedEnvelope(envOf(mallory.routeId), wire), "guardian");
  assert.deepEqual(mesh.loadNotices(), [], "sem aviso de quem nunca guardou nada");
});

test("dm adversarial - cofre na malha: `solta` só vale com `from` igual ao autor assinado", async () => {
  const author = await person();
  const seed = () => mesh.acceptGuard({ author: author.routeId, address: "a".repeat(64), record: { v: 2 }, updatedAt: 1 });
  const wire = mesh.serializeMeshDm(await author.sign(mesh.buildReleaseBody({ to: me })));

  assert.equal(seed(), "ok");
  assert.equal(await ingestDecryptedEnvelope(envOf("vx_alice_forjada"), wire), "guardian");
  assert.deepEqual(Object.keys(mesh.loadHeld()), [author.routeId], "`from` forjado não solta o cofre");

  assert.equal(await ingestDecryptedEnvelope(envOf(author.routeId), wire), "guardian");
  assert.deepEqual(Object.keys(mesh.loadHeld()), [], "controle: com `from` certo a solta vale");
});
