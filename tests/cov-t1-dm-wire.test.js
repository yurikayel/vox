/**
 * @file Cobertura de `app/dm-wire.js` (lote T1): recibos de leitura, reações, conteúdo vazio, relógio
 * adulterado, tratamentos especiais (denúncia, papel, caso natural), caixa de saída e despacho.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installRelay, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as dmMsg from "../client/js/dm-messenger.js";
import * as outbox from "../client/js/dm-outbox.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as review from "../client/js/report-review.js";
import * as roles from "../client/js/aviso-roles.js";
import * as natural from "../client/js/natural-mod.js";
import { NATURAL_MOD_LAB_KEY } from "../client/js/app/natural-mod-flow.js";
import { CASES_KEY } from "../client/js/app/natural-case-flow.js";
import { RECEIVED_KEY } from "../client/js/app/aviso-roles-dm.js";
import { applyBubbleReaction, ingestDecryptedEnvelope, dispatchSealedEnvelope, flushDmOutbox, startDmOutbox } from "../client/js/app/dm-wire.js";

let me = "";
let myPub = null;
let seq = 0;

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
  myPub = (await cryptoDm.ensureDmKeys()).publicJwk;
});

afterEach(() => {
  restoreEnv();
  localStorage.removeItem(outbox.OUTBOX_KEY);
  localStorage.removeItem(NATURAL_MOD_LAB_KEY);
  localStorage.removeItem(CASES_KEY);
});

const nextPeer = () => `vx_cov_wire_${++seq}`;
const nextId = () => `cov_wire_msg_${++seq}`;
const envOf = (from, over = {}) => ({ id: nextId(), from, to: me, ts: Date.now(), ...over });
const save = (peer, over = {}) => cacheNode.saveDmMessage({ id: nextId(), peerAddress: peer, from: peer, to: me, text: "oi", status: "received", ts: 1000, ...over });
const naturalCases = () => JSON.parse(localStorage.getItem(CASES_KEY) || "[]");
const msgPayload = (text) => dmMsg.serializeDmPayload({ text });

test("dm-wire — reação em mensagem que não está no fio devolve false e não grava nada", async () => {
  const peer = nextPeer();
  assert.equal(await applyBubbleReaction(peer, me, "nao-existe", "👍"), false);
  assert.deepEqual(await cacheNode.getDmMessages(peer), []);
});

test("dm-wire — reação recebida liga na mensagem; o mesmo envelope de novo é 'duplicate'", async () => {
  const peer = nextPeer();
  await save(peer, { id: "w_alvo_1" });
  const env = envOf(peer);
  const raw = dmMsg.serializeDmReaction({ targetId: "w_alvo_1", emoji: "❤️" });
  assert.equal(await ingestDecryptedEnvelope(env, raw), true);
  assert.deepEqual((await cacheNode.getDmMessages(peer))[0].reactions, { "❤️": [peer] });
  assert.equal(await ingestDecryptedEnvelope(env, raw), "duplicate");
  assert.deepEqual((await cacheNode.getDmMessages(peer))[0].reactions, { "❤️": [peer] }, "não desliga a reação por replay");
});

test("dm-wire — reação a mensagem inexistente devolve false e o id não fica marcado como visto", async () => {
  const peer = nextPeer();
  const env = envOf(peer);
  const raw = dmMsg.serializeDmReaction({ targetId: "nada", emoji: "🔥" });
  assert.equal(await ingestDecryptedEnvelope(env, raw), false);
  await save(peer, { id: "nada" });
  assert.equal(await ingestDecryptedEnvelope(env, raw), true, "a mesma reação vale quando a mensagem chega");
});

test("dm-wire — confirmação de leitura marca como lidas só as minhas até o instante; replay é 'duplicate'", async () => {
  const peer = nextPeer();
  await save(peer, { id: "w_min_1", from: me, to: peer, status: "queued-relay", ts: 100 });
  await save(peer, { id: "w_min_2", from: me, to: peer, status: "queued-relay", ts: 900 });
  await save(peer, { id: "w_dela", status: "received", ts: 50 });
  const env = envOf(peer);
  const raw = dmMsg.serializeDmReadReceipt({ upToTs: 500 });
  assert.equal(await ingestDecryptedEnvelope(env, raw), true);
  const by = Object.fromEntries((await cacheNode.getDmMessages(peer)).map((m) => [m.id, m.status]));
  assert.deepEqual(by, { w_min_1: "read", w_min_2: "queued-relay", w_dela: "received" });
  assert.equal(await ingestDecryptedEnvelope(env, raw), "duplicate");
});

test("dm-wire — confirmação de leitura sem nada a atualizar devolve false", async () => {
  const peer = nextPeer();
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), dmMsg.serializeDmReadReceipt({ upToTs: 1 })), false);
});

test("dm-wire — mensagem vazia não é guardada e id já existente em qualquer fio é 'duplicate'", async () => {
  const peer = nextPeer();
  const empty = envOf(peer);
  assert.equal(await ingestDecryptedEnvelope(empty, msgPayload("")), false);
  assert.deepEqual(await cacheNode.getDmMessages(peer), []);
  const other = nextPeer();
  await save(other, { id: "w_id_reusado", text: "original" });
  const replay = envOf(peer, { id: "w_id_reusado" });
  assert.equal(await ingestDecryptedEnvelope(replay, msgPayload("sequestro")), "duplicate");
  assert.deepEqual(await cacheNode.getDmMessages(peer), []);
  assert.equal((await cacheNode.getDmMessages(other))[0].text, "original");
});

test("dm-wire — hora no futuro, negativa ou inválida vira a hora de chegada; hora plausível é mantida", async () => {
  const peer = nextPeer();
  const before = Date.now();
  const cases = [["futuro", Date.now() + 3_600_000], ["negativa", -5], ["texto", "ontem"], ["boa", 1_700_000_000_000]];
  for (const [name, ts] of cases) {
    assert.equal(await ingestDecryptedEnvelope(envOf(peer, { id: `w_ts_${name}`, ts }), msgPayload(name)), true);
  }
  const by = Object.fromEntries((await cacheNode.getDmMessages(peer)).map((m) => [m.id, m.ts]));
  for (const name of ["futuro", "negativa", "texto"]) assert.ok(by[`w_ts_${name}`] >= before && by[`w_ts_${name}`] <= Date.now());
  assert.equal(by.w_ts_boa, 1_700_000_000_000);
});

test("dm-wire — denúncia chega ao fio e o aparelho sem comunidade conhecida não abre caso", async () => {
  const peer = nextPeer();
  const rec = { id: `rep_w_${++seq}`, postId: "p_w", communityId: "comunidade-desconhecida", reason: "spam", detail: "", ts: Date.now() };
  const signed = await localAccount.signPayload(review.buildSignedReportBody(rec));
  const raw = review.serializeReportDm(signed, review.buildReportDmMessage(rec));
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), raw), true);
  assert.match((await cacheNode.getDmMessages(peer))[0].text, /^Denúncia:/);
  assert.equal(review.listCases().some((c) => c.reportId === rec.id), false);
});

test("dm-wire — resposta de papel chega ao fio; sem o aviso neste aparelho nada é guardado como recebido", async () => {
  const peer = nextPeer();
  const aviso = { id: `av_w_${++seq}`, communityId: "c_w", roleSlots: "cozinha:2" };
  const claim = await localAccount.signPayload(roles.buildRoleClaim(aviso, "cozinha"));
  const raw = roles.serializeRoleClaimDm(claim, "Eu topo");
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), raw), true);
  assert.equal((await cacheNode.getDmMessages(peer))[0].text, "Eu topo");
  const stored = JSON.parse(localStorage.getItem(RECEIVED_KEY) || "[]");
  assert.equal(stored.some((c) => c.avisoId === aviso.id), false);
});

test("dm-wire — aviso de caso natural só entra com a flag de laboratório ligada", async () => {
  const peer = nextPeer();
  const notice = natural.buildCaseNotice({ caseId: `case_w_${++seq}`, postId: "p1", communityId: "c1", target: "vx_alvo", reason: "spam", side: "target" });
  const raw = natural.serializeCaseDm(notice, "Denúncia para você decidir");
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), raw), true);
  assert.equal(naturalCases().some((c) => c.caseId === notice.caseId), false, "flag desligada: nenhum caso");
  localStorage.setItem(NATURAL_MOD_LAB_KEY, "1");
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), raw), true);
  assert.equal(naturalCases().filter((c) => c.caseId === notice.caseId).length, 1);
  assert.equal(await ingestDecryptedEnvelope(envOf(peer), raw), true);
  assert.equal(naturalCases().filter((c) => c.caseId === notice.caseId).length, 1, "caso repetido não duplica");
});

test("dm-wire — despacho cai na caixa de saída e, com a caixa cheia, a mais antiga é marcada como falha", async () => {
  const peer = nextPeer();
  installRelay(me, { failPush: true });
  const oldest = await cryptoDm.seal(myPub, "a mais antiga", { from: me, to: peer });
  await cacheNode.saveDmMessage({ id: oldest.id, peerAddress: peer, from: me, to: peer, text: "a mais antiga", status: "pending-retry", ts: 1 });
  outbox.enqueueEnvelope(peer, oldest, { now: 1 });
  const fill = [];
  for (let i = 1; i < outbox.OUTBOX_MAX_ITEMS; i += 1) fill.push({ to: peer, envelope: { id: `fill_${i}`, ct: "x" }, queuedAt: 2 + i, relayAttempts: 1, nextRelayAt: 9e15 });
  const stored = JSON.parse(localStorage.getItem(outbox.OUTBOX_KEY));
  localStorage.setItem(outbox.OUTBOX_KEY, JSON.stringify([...stored, ...fill]));
  const next = await cryptoDm.seal(myPub, "nova", { from: me, to: peer });
  assert.equal(await dispatchSealedEnvelope(peer, next), "pending-retry");
  await settle(80);
  assert.equal((await cacheNode.getDmMessages(peer)).find((m) => m.id === oldest.id).status, "failed");
});

test("dm-wire — despacho com relay no ar entrega à caixa do destinatário", async () => {
  const peer = nextPeer();
  const relay = installRelay(me);
  const env = await cryptoDm.seal(myPub, "ola", { from: me, to: peer });
  assert.equal(await dispatchSealedEnvelope(peer, env), "queued-relay");
  assert.deepEqual(relay.pushed.map((p) => p.to), [peer]);
});

test("dm-wire — flushDmOutbox com a caixa vazia devolve o resumo e com dependências quebradas devolve null", async () => {
  const summary = await flushDmOutbox();
  assert.equal(typeof summary, "object");
  assert.notEqual(summary, null);
  assert.equal(await flushDmOutbox({}), null);
});

test("dm-wire — flushDmOutbox ignora a chamada enquanto outra passada está em curso", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = { storage: { getItem: () => "[]", setItem() {} }, now: () => 1, isConnected: () => false, sendDirect: () => false, pushRelay: () => gate, markStatus: async () => true };
  const first = flushDmOutbox(slow);
  assert.equal(await flushDmOutbox(slow), null);
  release();
  assert.notEqual(await first, undefined);
});

test("dm-wire — startDmOutbox liga o intervalo de 20 s uma vez e repassa ao voltar a internet", async () => {
  assert.equal(startDmOutbox({}), false, "sem setInterval não liga");
  const timers = [];
  const listeners = new Map();
  const win = { setInterval: (fn, ms) => (timers.push([fn, ms]), 1), addEventListener: (t, fn) => listeners.set(t, fn) };
  assert.equal(startDmOutbox(win), true);
  assert.equal(timers[0][1], 20000);
  assert.equal(typeof listeners.get("online"), "function");
  assert.equal(startDmOutbox(win), false, "já estava ligado");
  await settle(20);
});
