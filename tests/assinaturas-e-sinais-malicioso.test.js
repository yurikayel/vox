/**
 * S20 — verificação de assinatura (`signed-verify.js`, `nostr-event.js`) e sinalização Nostr
 * (`nostr-transport.js`, contrato do stub `nostr-signaling.js`) diante de entrada hostil: assinatura
 * adulterada, campos faltando, versão desconhecida, replay e evento forjado. Sem rede: o transporte recebe
 * eventos direto por `_handleEvent`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { verifyPayload, computeRouteId, bytesToB64Url, b64UrlToBytes } from "../client/js/signed-verify.js";
import { canonicalString } from "../client/js/sig-format.js";
import * as nostrSignaling from "../client/js/nostr-signaling.js";
import {
  finalizeEvent, verifyEvent, computeEventId, generateSecretKey, getPublicKey, getSharedSecret, schnorrSign,
  schnorrVerify, hexToBytes, bytesToHex, isEphemeralKind,
} from "../client/js/nostr-event.js";
import { createNostrTransport, encryptFor, SIGNAL_KIND, DEFAULT_ROOM } from "../client/js/nostr-transport.js";
import { person } from "./signer.js";
import { waitUntil } from "./helpers/wait-until.js";

const troca = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);

/** Pessoa que assina na versão pedida (a do tests/signer.js só faz v1). */
async function pessoa() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const routeId = await computeRouteId(pubKey);
  const sign = async (payload) => {
    const body = { ...payload, author: routeId };
    const bytes = new TextEncoder().encode(canonicalString(body));
    const sig = bytesToB64Url(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, bytes));
    return { ...body, pubKey, sig };
  };
  return { routeId, sign, pubKey };
}

// ---------------------------------------------------------------- signed-verify

test("signed-verify - controle: v1 e v2 assinados pela própria pessoa verificam", async () => {
  const alice = await pessoa();
  assert.equal(await verifyPayload(await alice.sign({ id: "a", body: "oi", ts: 1 })), true);
  assert.equal(await verifyPayload(await alice.sign({ id: "a", body: "oi", ts: 1, sigv: 2, extra: { b: 2, a: 1 } })), true);
});

test("signed-verify - texto, id ou data trocados depois de assinar não verificam", async () => {
  const alice = await pessoa();
  const s = await alice.sign({ id: "a", body: "oi", ts: 1 });
  for (const campo of [{ body: "tchau" }, { id: "b" }, { ts: 2 }, { extra: "novo" }]) {
    assert.equal(await verifyPayload({ ...s, ...campo }), false, JSON.stringify(campo));
  }
});

test("signed-verify - assinatura trocada, truncada, vazia ou que não é base64 não verifica nem lança", async () => {
  const alice = await pessoa();
  const s = await alice.sign({ id: "a", body: "oi", ts: 1 });
  for (const sig of [troca(s.sig), s.sig.slice(0, -4), s.sig + "AAAA", "", "@@@@", "%%%", "A".repeat(10000), 42, {}, [], null]) {
    assert.equal(await verifyPayload({ ...s, sig }), false, String(sig).slice(0, 20));
  }
});

test("signed-verify - campos faltando ou de tipo errado: sempre false", async () => {
  const alice = await pessoa();
  const s = await alice.sign({ id: "a", body: "oi", ts: 1 });
  for (const campo of ["sig", "pubKey", "author"]) {
    const { [campo]: _x, ...resto } = s;
    assert.equal(await verifyPayload(resto), false, `sem ${campo}`);
  }
  for (const entrada of [null, undefined, "x", 0, 42, true, [], {}, () => {}]) {
    assert.equal(await verifyPayload(entrada), false, String(entrada));
  }
  for (const pubKey of ["x", 5, [], {}, { kty: "EC" }, { x: "a", y: "b" }, { ...s.pubKey, x: "AAAA" }, { ...s.pubKey, kty: "RSA" }, { ...s.pubKey, crv: "P-384" }]) {
    assert.equal(await verifyPayload({ ...s, pubKey }), false, JSON.stringify(pubKey).slice(0, 40));
  }
});

test("signed-verify - autor de outra chave, mesmo com assinatura boa da chave anexada, é recusado", async () => {
  const alice = await pessoa();
  const mallory = await pessoa();
  const s = await mallory.sign({ id: "a", body: "oi", ts: 1 });
  assert.equal(await verifyPayload({ ...s, author: alice.routeId }), false);
  assert.equal(await verifyPayload({ ...s, author: "vx_" + "A".repeat(20) }), false);
  assert.equal(await verifyPayload({ ...s, author: s.author.toUpperCase() }), false);
});

test("signed-verify - assinatura de Mallory com a chave de Alice anexada não passa", async () => {
  const alice = await pessoa();
  const mallory = await pessoa();
  const s = await mallory.sign({ id: "a", body: "oi", ts: 1 });
  assert.equal(await verifyPayload({ ...s, pubKey: alice.pubKey, author: alice.routeId }), false);
});

test("signed-verify - sigv desconhecido é recusado; trocar a versão invalida a assinatura (sem downgrade)", async () => {
  const alice = await pessoa();
  const v2 = await alice.sign({ id: "a", body: "oi", ts: 1, sigv: 2 });
  const { sigv: _v, ...semVersao } = v2;
  assert.equal(await verifyPayload(semVersao), false, "tirar o sigv de um v2 não o faz passar como v1");
  const v1 = await alice.sign({ id: "a", body: "oi", ts: 1 });
  assert.equal(await verifyPayload({ ...v1, sigv: 2 }), false, "pôr sigv 2 num v1 também não");
  for (const sigv of [1, 3, "2", null, 0, 2.5, true, [], {}]) {
    assert.equal(await verifyPayload(await alice.sign({ id: "a", sigv })), false, String(sigv));
  }
});

test("signed-verify - v2 cobre campos aninhados: adulterar o interior de um objeto invalida", async () => {
  const alice = await pessoa();
  const s = await alice.sign({ id: "a", sigv: 2, mediaRef: { hash: "h1", tipo: "foto" } });
  assert.equal(await verifyPayload(s), true);
  assert.equal(await verifyPayload({ ...s, mediaRef: { hash: "h2", tipo: "foto" } }), false);
  assert.equal(await verifyPayload({ ...s, mediaRef: { hash: "h1", tipo: "foto", extra: 1 } }), false);
});

test("signed-verify - ADR-021 §2.6: v1 não cobre interior aninhado (adulteração ainda verifica; posts com objeto devem usar sigv 2)", async () => {
  const alice = await pessoa();
  const s = await alice.sign({ id: "a", mediaRef: { hash: "h1" } });
  assert.equal(await verifyPayload({ ...s, mediaRef: { hash: "h-do-golpe" } }), true);
});

test("signed-verify - payload de vários MB assinado verifica sem estourar", async () => {
  const alice = await pessoa();
  const s = await alice.sign({ id: "a", body: "x".repeat(3 * 1024 * 1024) });
  assert.equal(await verifyPayload(s), true);
  assert.equal(await verifyPayload({ ...s, body: s.body + "y" }), false);
});

test("signed-verify - computeRouteId: formato fixo, determinístico e vazio sem x/y", async () => {
  const alice = await pessoa();
  const rota = await computeRouteId(alice.pubKey);
  assert.match(rota, /^vx_[A-Za-z0-9_-]{20}$/);
  assert.equal(rota, await computeRouteId({ ...alice.pubKey, d: "ignorado", key_ops: ["verify"] }));
  for (const jwk of [null, undefined, {}, { x: "a" }, { y: "b" }, { x: "", y: "" }, "x", 5]) assert.equal(await computeRouteId(jwk), "");
});

test("signed-verify - base64url: ida e volta com todos os bytes; texto inválido lança como documentado", () => {
  const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
  const texto = bytesToB64Url(todos);
  assert.match(texto, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...b64UrlToBytes(texto)], [...todos]);
  assert.equal(bytesToB64Url([]), "");
  assert.throws(() => b64UrlToBytes("***"));
  assert.throws(() => b64UrlToBytes("A"));
});

// ---------------------------------------------------------------- nostr-event

test("nostr-event - verifyEvent recusa evento sem id, sem sig, sem pubkey ou de tipo errado, sem lançar", async () => {
  const sk = generateSecretKey();
  const ev = await finalizeEvent({ kind: 1, content: "oi" }, sk);
  assert.equal(await verifyEvent(ev), true);
  for (const campo of ["id", "sig", "pubkey", "kind", "created_at"]) {
    const { [campo]: _x, ...resto } = ev;
    assert.equal(await verifyEvent(resto), false, `sem ${campo}`);
  }
  for (const entrada of [null, undefined, "x", 0, [], {}, { id: 1, sig: 2 }]) assert.equal(await verifyEvent(entrada), false);
  assert.equal(await verifyEvent({ ...ev, pubkey: 5 }), false);
  assert.equal(await verifyEvent({ ...ev, tags: "x" }), false);
});

test("nostr-event - conteúdo, tags, kind ou data trocados invalidam o id e a assinatura", async () => {
  const ev = await finalizeEvent({ kind: 25050, tags: [["t", "sala"]], content: "oi" }, generateSecretKey());
  for (const mut of [{ content: "tchau" }, { tags: [["t", "outra"]] }, { kind: 25051 }, { created_at: ev.created_at + 1 }]) {
    assert.equal(await verifyEvent({ ...ev, ...mut }), false, JSON.stringify(mut));
  }
});

test("nostr-event - id refeito sobre conteúdo forjado ainda falha porque a assinatura é da outra mensagem", async () => {
  const ev = await finalizeEvent({ kind: 1, content: "original" }, generateSecretKey());
  const forjado = { ...ev, content: "forjado" };
  forjado.id = await computeEventId(forjado);
  assert.equal(await verifyEvent(forjado), false);
});

test("nostr-event - assinatura de outra chave, hex inválido, tamanho errado e id em maiúsculas são recusados", async () => {
  const ev = await finalizeEvent({ kind: 1, content: "oi" }, generateSecretKey());
  const outra = await finalizeEvent({ kind: 1, content: "oi", created_at: ev.created_at }, generateSecretKey());
  const ruins = [
    { sig: outra.sig }, { pubkey: outra.pubkey }, { sig: ev.sig.slice(2) }, { sig: ev.sig + "00" }, { sig: "zz".repeat(64) },
    { sig: ev.sig.toUpperCase().replace(/^/, "") === ev.sig ? "" : ev.sig.slice(0, 126) + "G0" }, { id: ev.id.toUpperCase() },
    { pubkey: "00".repeat(32) }, { pubkey: "ff".repeat(32) }, { sig: "00".repeat(64) }, { sig: "ff".repeat(64) },
  ];
  for (const mut of ruins) assert.equal(await verifyEvent({ ...ev, ...mut }), false, JSON.stringify(mut).slice(0, 50));
});

test("nostr-event - schnorrVerify recusa tamanhos errados e r ou s fora do corpo da curva", async () => {
  const sk = generateSecretKey();
  const pub = getPublicKey(sk);
  const msg = new Uint8Array(32).fill(7);
  const sig = await schnorrSign(msg, sk);
  assert.equal(await schnorrVerify(sig, msg, pub), true);
  assert.equal(await schnorrVerify(sig.slice(0, 63), msg, pub), false);
  assert.equal(await schnorrVerify(sig, msg.slice(0, 31), pub), false);
  assert.equal(await schnorrVerify(sig, msg, pub.slice(0, 31)), false);
  const sMax = Uint8Array.from([...sig.slice(0, 32), ...new Uint8Array(32).fill(255)]);
  const rMax = Uint8Array.from([...new Uint8Array(32).fill(255), ...sig.slice(32)]);
  assert.equal(await schnorrVerify(sMax, msg, pub), false);
  assert.equal(await schnorrVerify(rMax, msg, pub), false);
  for (const lixo of [null, undefined, "x", [], {}]) assert.equal(await schnorrVerify(lixo, msg, pub), false);
});

test("nostr-event - chaves e segredos inválidos lançam em vez de produzir resultado", async () => {
  assert.throws(() => getPublicKey(new Uint8Array(32)));
  assert.throws(() => getPublicKey(new Uint8Array(31)));
  assert.throws(() => getPublicKey(new Uint8Array(32).fill(255)));
  assert.throws(() => getSharedSecret(generateSecretKey(), "00".repeat(32)));
  assert.throws(() => getSharedSecret(generateSecretKey(), "xyz"));
  assert.throws(() => hexToBytes("abc"));
  assert.throws(() => hexToBytes("zz"));
  await assert.rejects(() => finalizeEvent({ kind: 1 }, new Uint8Array(32)));
  assert.equal(bytesToHex(hexToBytes("00ff10")), "00ff10");
});

test("nostr-event - isEphemeralKind recusa texto, decimal, negativo, NaN e as bordas", () => {
  for (const k of ["25050", 25050.5, -1, NaN, Infinity, null, undefined, 19999, 30000, {}, []]) assert.equal(isEphemeralKind(k), false, String(k));
  assert.equal(isEphemeralKind(20000), true);
  assert.equal(isEphemeralKind(29999), true);
});

// ---------------------------------------------------------------- nostr-transport

/** Transporte sem relays; entrega de eventos feita à mão. */
function transporte(extra = {}) {
  const recebidas = [];
  const t = createNostrTransport({ relays: [], peerId: "peer_eu", getIdentity: () => ({ address: "vx_eu", dmPub: { k: 1 } }), onMessage: (m) => recebidas.push(m), ...extra });
  return { t, recebidas };
}

/** Evento dirigido ao transporte, de um par com chave própria. */
async function dirigido(t, remetente, payload, { room = DEFAULT_ROOM, para = t.publicKey } = {}) {
  const content = await encryptFor(remetente.sk, para, payload);
  return finalizeEvent({ kind: SIGNAL_KIND, tags: [["p", para], ["t", room]], content }, remetente.sk);
}

const novoPar = () => {
  const sk = generateSecretKey();
  return { sk, pub: bytesToHex(getPublicKey(sk)) };
};

test("nostr-transport - controle: offer cifrada de par conhecido chega ao webrtc-peer", async () => {
  const { t, recebidas } = transporte();
  const par = novoPar();
  await t._handleEvent(await dirigido(t, par, { type: "offer", from: "peer_x", sdp: "v=0" }));
  assert.deepEqual(recebidas.map((m) => m.type), ["offer"]);
  assert.equal(t.knows("peer_x"), true);
});

test("nostr-transport - replay do mesmo evento é entregue uma vez só", async () => {
  const { t, recebidas } = transporte();
  const ev = await dirigido(t, novoPar(), { type: "offer", from: "peer_x", sdp: "v=0" });
  await t._handleEvent(ev);
  await t._handleEvent(ev);
  await t._handleEvent({ ...ev });
  assert.equal(recebidas.length, 1);
});

test("nostr-transport - sala errada, destinatário errado e evento do próprio transporte são ignorados", async () => {
  const { t, recebidas } = transporte();
  const par = novoPar();
  await t._handleEvent(await dirigido(t, par, { type: "offer", from: "p1", sdp: "x" }, { room: "outra-sala" }));
  const terceiro = novoPar();
  await t._handleEvent(await dirigido(t, par, { type: "offer", from: "p2", sdp: "x" }, { para: terceiro.pub }));
  assert.deepEqual(recebidas, []);
});

test("nostr-transport - cifra de terceiro com pubkey de Alice no evento: decifrar falha e nada é entregue", async () => {
  const { t, recebidas } = transporte();
  const alice = novoPar();
  const mallory = novoPar();
  const content = await encryptFor(mallory.sk, t.publicKey, { type: "offer", from: "peer_alice", sdp: "x" });
  const ev = await finalizeEvent({ kind: SIGNAL_KIND, tags: [["p", t.publicKey], ["t", DEFAULT_ROOM]], content }, mallory.sk);
  await t._handleEvent({ ...ev, pubkey: alice.pub });
  assert.deepEqual(recebidas, []);
  assert.equal(t.knows("peer_alice"), false);
});

test("nostr-transport - conteúdo lixo, base64 inválido, JSON quebrado e evento malformado não lançam", async () => {
  const { t, recebidas } = transporte();
  const par = novoPar();
  const base = { pubkey: par.pub, kind: SIGNAL_KIND, created_at: 1, sig: "00" };
  const eventos = [
    null, undefined, "x", 7, [], {}, { id: "a" }, { id: "b", tags: "nao-lista" }, { id: "c", tags: [null, 5, "x"] },
    { ...base, id: "d1", tags: [["p", t.publicKey], ["t", DEFAULT_ROOM]], content: "%%%nao-e-base64" },
    { ...base, id: "d2", tags: [["p", t.publicKey], ["t", DEFAULT_ROOM]], content: "" },
    { ...base, id: "d3", tags: [["p", t.publicKey], ["t", DEFAULT_ROOM]], content: btoa("curto") },
    { ...base, id: "d4", tags: [["t", DEFAULT_ROOM]], content: "{quebrado" },
    { ...base, id: "d5", tags: [["t", DEFAULT_ROOM]], content: "null" },
    { ...base, id: "d6", tags: [["t", DEFAULT_ROOM]], content: "42" },
    { ...base, id: "d7", tags: [["p", "nao-hex"], ["t", DEFAULT_ROOM]], content: "x" },
  ];
  for (const ev of eventos) await assert.doesNotReject(() => t._handleEvent(ev));
  assert.deepEqual(recebidas, []);
});

test("nostr-transport - mensagem decifrada sem `from`, com o meu peerId ou de tipo não previsto não é entregue", async () => {
  const { t, recebidas } = transporte();
  const par = novoPar();
  const casos = [{ type: "offer", sdp: "x" }, { type: "offer", from: "peer_eu", sdp: "x" }, { type: "peer-joined", from: "p9", peerId: "x" },
    { type: "bye", from: "p9" }, { type: "__proto__", from: "p9" }, { type: ["offer"], from: "p9" }, null, "texto", 5];
  for (const c of casos) await t._handleEvent(await dirigido(t, par, c));
  assert.deepEqual(recebidas, []);
});

test("nostr-transport - hello de outro pubkey para um peerId já conhecido não troca a chave (o primeiro vale)", async () => {
  const { t } = transporte();
  const real = novoPar();
  const golpista = novoPar();
  const hello = (par, id) => finalizeEvent({ kind: SIGNAL_KIND, tags: [["t", DEFAULT_ROOM]], content: JSON.stringify({ type: "hello", from: "peer_vitima" }) }, par.sk, id);
  await t._handleEvent(await hello(real));
  await t._handleEvent(await hello(golpista));
  assert.equal(t.knows("peer_vitima"), true);
  const alvo = await dirigido(t, golpista, { type: "offer", from: "peer_vitima", sdp: "x" });
  assert.equal(t.send({ to: "peer_vitima", type: "answer", sdp: "y" }), true);
  assert.ok(alvo, "o evento dirigido do golpista existe, mas o par registrado continua o primeiro");
});

test("nostr-transport - send para par desconhecido, sem `to` ou com mensagem inválida devolve false", () => {
  const { t } = transporte();
  for (const msg of [null, undefined, {}, { to: "ninguem" }, { to: 5 }, "x"]) assert.equal(t.send(msg), false);
});

test("nostr-transport - hello com assinatura inválida não registra o par (verifyEvent antes de qualquer efeito)", async () => {
  const { t } = transporte();
  const par = novoPar();
  const ev = await finalizeEvent({ kind: SIGNAL_KIND, tags: [["t", DEFAULT_ROOM]], content: JSON.stringify({ type: "hello", from: "peer_forjado" }) }, par.sk);
  await t._handleEvent({ ...ev, sig: "00".repeat(64) });
  assert.equal(t.knows("peer_forjado"), false, "evento com sig inválida deveria ser descartado");
});

test("nostr-transport - hello forjado (sem assinatura) com o peerId da vítima não toma o lugar dela", async () => {
  const { t, recebidas } = transporte();
  const golpista = novoPar();
  const forjado = { id: "f".repeat(64), pubkey: golpista.pub, kind: SIGNAL_KIND, created_at: 1, sig: "00".repeat(64),
    tags: [["t", DEFAULT_ROOM]], content: JSON.stringify({ type: "hello", from: "peer_vitima" }) };
  await t._handleEvent(forjado);
  assert.equal(t.knows("peer_vitima"), false);
  assert.deepEqual(recebidas, []);
});

test("nostr-transport - replay de offer continua barrado depois de 2000 eventos distintos sem assinatura (só verificado entra em `seen`)", async () => {
  const { t, recebidas } = transporte();
  const ev = await dirigido(t, novoPar(), { type: "offer", from: "peer_x", sdp: "v=0" });
  await t._handleEvent(ev);
  for (let i = 0; i < 2001; i++) await t._handleEvent({ id: `lixo${i}`, tags: [] });
  await t._handleEvent(ev);
  assert.equal(recebidas.length, 1, "o replay deveria continuar barrado (por created_at ou janela maior)");
});

test("nostr-transport - peer-info com address e dmPub de tipo errado ou gigante não é repassado", async () => {
  const { t, recebidas } = transporte();
  await t._handleEvent(await dirigido(t, novoPar(), { type: "peer-info", from: "peer_x", address: { toString: "x" }, dmPub: "y".repeat(2 * 1024 * 1024) }));
  assert.deepEqual(recebidas, [], "peer-info inválido não vira peer-joined");
  assert.equal(t.knows("peer_x"), false);
});

/** WebSocket falso que guarda o que o transporte publica (EVENT) e entrega eventos ao handler. */
function transporteComSocket() {
  const enviados = [];
  class WS {
    constructor() {
      this.readyState = 1;
      queueMicrotask(() => this.onopen?.());
    }
    send(frame) {
      enviados.push(JSON.parse(frame));
    }
    close() {}
  }
  const { t, recebidas } = transporte({ relays: ["wss://fake"], WebSocketImpl: WS });
  return { t, recebidas, enviados };
}

const helloDe = (par, from, extra = {}) => finalizeEvent({ kind: SIGNAL_KIND, tags: [["t", DEFAULT_ROOM]], content: JSON.stringify({ type: "hello", from }), ...extra }, par.sk);

test("nostr-transport - hello assinado e fresco registra o par; o primeiro pubkey de um peerId vale, mesmo com assinatura boa do golpista", async () => {
  const { t, enviados } = transporteComSocket();
  t.start();
  try {
    const real = novoPar();
    const golpista = novoPar();
    await t._handleEvent(await helloDe(real, "peer_vitima"));
    await t._handleEvent(await helloDe(golpista, "peer_vitima"));
    await waitUntil(() => t.knows("peer_vitima"));
    assert.equal(t.knows("peer_vitima"), true);
    assert.equal(t.send({ to: "peer_vitima", type: "answer", sdp: "y" }), true);
    await waitUntil(() => enviados.some((f) => f[0] === "EVENT" && f[1].tags.some((x) => x[0] === "p")));
    const dirigidos = enviados.filter((f) => f[0] === "EVENT").map((f) => f[1]).filter((ev) => ev.tags.some((x) => x[0] === "p"));
    assert.ok(dirigidos.length >= 1);
    assert.ok(dirigidos.every((ev) => ev.tags.find((x) => x[0] === "p")[1] === real.pub), "tudo vai para a chave do primeiro, nunca a do golpista");
  } finally {
    t.stop();
  }
});

test("nostr-transport - hello velho ou datado do futuro fora da janela é descartado, mesmo com assinatura válida", async () => {
  const { t } = transporte();
  const agora = Math.floor(Date.now() / 1000);
  const velho = await helloDe(novoPar(), "peer_velho", { created_at: agora - 3600 });
  const futuro = await helloDe(novoPar(), "peer_futuro", { created_at: agora + 3600 });
  await t._handleEvent(velho);
  await t._handleEvent(futuro);
  assert.equal(t.knows("peer_velho"), false);
  assert.equal(t.knows("peer_futuro"), false);
});

test("nostr-transport - offer de outra chave com o `from` de par já conhecido não toma o lugar nem é entregue", async () => {
  const { t, recebidas } = transporte();
  const real = novoPar();
  const golpista = novoPar();
  await t._handleEvent(await helloDe(real, "peer_vitima"));
  await t._handleEvent(await dirigido(t, golpista, { type: "offer", from: "peer_vitima", sdp: "do-golpe" }));
  await t._handleEvent(await dirigido(t, golpista, { type: "peer-info", from: "peer_vitima", address: "vx_golpe", dmPub: null }));
  assert.deepEqual(recebidas, []);
  await t._handleEvent(await dirigido(t, real, { type: "offer", from: "peer_vitima", sdp: "legitima" }));
  assert.deepEqual(recebidas.map((m) => m.sdp), ["legitima"]);
});

test("nostr-transport - evento forjado com id e assinatura de outro conteúdo é recusado", async () => {
  const { t } = transporte();
  const par = novoPar();
  const ev = await helloDe(par, "peer_original");
  await t._handleEvent({ ...ev, content: JSON.stringify({ type: "hello", from: "peer_trocado" }) });
  assert.equal(t.knows("peer_trocado"), false);
  assert.equal(t.knows("peer_original"), false);
});

test("nostr-transport - peer-info válido, com address texto curto e dmPub objeto pequeno, é repassado", async () => {
  const { t, recebidas } = transporte();
  await t._handleEvent(await dirigido(t, novoPar(), { type: "peer-info", from: "peer_x", address: "vx_ok", dmPub: { kty: "EC", x: "a" } }));
  assert.deepEqual(recebidas, [{ type: "peer-joined", peerId: "peer_x", address: "vx_ok", dmPub: { kty: "EC", x: "a" } }]);
});

test("nostr-transport - peer-info com address muito longo, dmPub array ou peerId gigante não é repassado", async () => {
  const { t, recebidas } = transporte();
  const par = novoPar();
  const casos = [
    { type: "peer-info", from: "p1", address: "a".repeat(257) },
    { type: "peer-info", from: "p2", dmPub: ["x"] },
    { type: "peer-info", from: "p3", dmPub: { k: "y".repeat(5000) } },
    { type: "peer-info", from: "p".repeat(129), address: "ok" },
    { type: "peer-info", from: "p4", address: 7 },
  ];
  for (const c of casos) await t._handleEvent(await dirigido(t, par, c));
  assert.deepEqual(recebidas, []);
});

// ---------------------------------------------------------------- nostr-signaling (stub: contrato)

test("nostr-signaling - contrato: só expõe a lista padrão e o montador de candidatos", () => {
  assert.deepEqual(Object.keys(nostrSignaling).sort(), ["DEFAULT_NOSTR_RELAYS", "buildNostrSignalingCandidates"]);
});

test("nostr-signaling - a lista padrão tem só wss://, sem repetição e sem espaço", () => {
  const lista = nostrSignaling.DEFAULT_NOSTR_RELAYS;
  assert.ok(lista.length >= 3);
  assert.equal(new Set(lista).size, lista.length);
  for (const url of lista) assert.match(url, /^wss:\/\/[a-z0-9.-]+$/);
});

test("nostr-signaling - candidatos: os da pessoa vêm primeiro, sem repetir, sem lixo e sem mutar a lista padrão", () => {
  const padrao = [...nostrSignaling.DEFAULT_NOSTR_RELAYS];
  const lista = nostrSignaling.buildNostrSignalingCandidates(["  wss://meu.relay  ", "wss://meu.relay", "", null, undefined, 5, {}, "https://x", "javascript:alert(1)", "ftp://x", nostrSignaling.DEFAULT_NOSTR_RELAYS[0]]);
  assert.equal(lista[0], "wss://meu.relay");
  assert.equal(new Set(lista).size, lista.length);
  assert.ok(lista.every((u) => /^wss?:\/\//.test(u)));
  assert.ok(!lista.some((u) => /javascript|ftp|https/.test(u)));
  assert.deepEqual(nostrSignaling.DEFAULT_NOSTR_RELAYS, padrao);
  lista.push("wss://intruso");
  assert.deepEqual(nostrSignaling.DEFAULT_NOSTR_RELAYS, padrao, "o resultado não pode ser a própria lista padrão");
});

test("nostr-signaling - entrada que não é lista (texto, objeto, null) cai na lista padrão", () => {
  for (const entrada of ["wss://x", { 0: "wss://x" }, null, undefined, 5]) {
    assert.deepEqual(nostrSignaling.buildNostrSignalingCandidates(entrada), nostrSignaling.DEFAULT_NOSTR_RELAYS);
  }
});

test("nostr-signaling - candidato sem host ('wss://', 'ws://') é recusado", () => {
  const lista = nostrSignaling.buildNostrSignalingCandidates(["wss://", "ws://", "wss:// "]);
  assert.ok(!lista.includes("wss://") && !lista.includes("ws://") && !lista.includes("wss:// "));
  assert.deepEqual(nostrSignaling.buildNostrSignalingCandidates(["wss://user:senha@relay.exemplo"]), nostrSignaling.DEFAULT_NOSTR_RELAYS);
});

test("nostr-signaling - ws:// em claro é recusado como relay de sinalização (hello e metadados não vão cifrados)", () => {
  const lista = nostrSignaling.buildNostrSignalingCandidates(["ws://relay.exemplo"]);
  assert.ok(!lista.includes("ws://relay.exemplo"));
  assert.ok(lista.every((u) => u.startsWith("wss://")));
});

test("signer - o helper de testes (v1) também é aceito pelo verificador real", async () => {
  const alice = await person();
  assert.equal(await verifyPayload(await alice.sign({ id: "a", ts: 1 })), true);
});
