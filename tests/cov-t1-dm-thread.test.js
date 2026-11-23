/**
 * @file Cobertura de `app/screens-dm.js` (lote T1), parte 2: fio de conversa — envio, resposta, cartão,
 * foto, Pix, reações, chave manual, painel dividido e ouvinte de DM direta.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import { installRelay, installClipboard, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as gql from "../client/js/graphql.js";
import * as dmMsg from "../client/js/dm-messenger.js";
import { OUTBOX_KEY } from "../client/js/dm-outbox.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { handleSendDmSubmit, showDmThread } from "../client/js/app/screens-dm.js";

const dom = installFakeDom();
let me = "";
let myPub = null;
let seq = 0;

const freshLocation = () => ({ hash: "#/dm", origin: "https://vox.test", pathname: "/app/", search: "" });
const nextPeer = () => `vx_cov_thread_${++seq}`;

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
  myPub = (await cryptoDm.ensureDmKeys()).publicJwk;
});

afterEach(() => {
  restoreEnv();
  localStorage.removeItem(OUTBOX_KEY);
  dom.reset();
  delete globalThis.matchMedia;
  globalThis.location = freshLocation();
});

/** Peer com chave de DM conhecida (a nossa, só para selar de verdade) e relay em memória. */
function setupPeer(relayOpts = {}) {
  const peer = nextPeer();
  gql.cacheUserDmPub(peer, myPub);
  return { peer, relay: installRelay(me, relayOpts) };
}

/** Elementos do formulário de envio, já registrados no DOM falso. */
function addSendForm() {
  return {
    form: dom.add("form-send-dm"),
    input: dom.add("dm-message-input"),
    btn: dom.add("btn-send-dm"),
    container: Object.assign(dom.add("dm-thread-container"), { scrollHeight: 777, scrollTop: 0 }),
  };
}

const lastSaved = async (peer) => (await cacheNode.getDmMessages(peer)).at(-1);
const saveMsg = (peer, over = {}) =>
  cacheNode.saveDmMessage({ id: `cov_t1_thr_${++seq}`, peerAddress: peer, from: peer, to: me, text: "oi", status: "received", ts: 9000 + seq, ...over });

test("dm fio — showDmThread monta o fio, rola até o fim e marca como lido", async () => {
  const { peer } = setupPeer();
  await saveMsg(peer, { text: "mensagem-do-fio-abc" });
  const { container } = addSendForm();
  await showDmThread(peer);
  assert.match(dom.main.innerHTML, /mensagem-do-fio-abc/);
  assert.equal(container.scrollTop, 777);
  assert.ok(dmMsg.getLastReadTs(peer) > 0);
});

test("dm fio — enviar cifra, entrega ao relay, grava a mensagem e limpa o campo", async () => {
  const { peer, relay } = setupPeer();
  const f = addSendForm();
  await showDmThread(peer);
  f.input.value = "  olá, tudo bem?  ";
  const ev = f.form.fire("submit");
  assert.equal(ev.defaultPrevented, true);
  await settle(120);
  assert.equal(relay.pushed.length, 1);
  assert.equal(relay.pushed[0].to, peer);
  const saved = await lastSaved(peer);
  assert.equal(saved.text, "olá, tudo bem?");
  assert.equal(saved.status, "queued-relay");
  assert.equal(saved.id, relay.pushed[0].env.id);
  assert.equal(f.input.value, "");
  assert.equal(f.btn.disabled, true);
});

test("dm fio — campo vazio sem rascunho não envia nada", async () => {
  const { peer, relay } = setupPeer();
  const f = addSendForm();
  f.input.value = "   ";
  await handleSendDmSubmit(me, peer, myPub);
  assert.equal(relay.pushed.length, 0);
  assert.equal(f.btn.disabled, false);
  assert.equal((await cacheNode.getDmMessages(peer)).length, 0);
});

test("dm fio — relay recusa: a mensagem fica na caixa de saída como pending-retry", async () => {
  const { peer } = setupPeer({ failPush: true });
  const f = addSendForm();
  f.input.value = "vai tentar de novo";
  await handleSendDmSubmit(me, peer, myPub);
  await settle(60);
  assert.equal((await lastSaved(peer)).status, "pending-retry");
  const queued = JSON.parse(localStorage.getItem(OUTBOX_KEY));
  assert.deepEqual(queued.map((e) => e.to), [peer]);
});

test("dm fio — caixa de saída sem espaço grava a mensagem como failed", async () => {
  const { peer } = setupPeer({ failPush: true });
  const f = addSendForm();
  f.input.value = "sem espaço";
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => {
    if (/outbox/i.test(k)) throw new Error("QuotaExceeded");
    return realSet(k, v);
  };
  try {
    await handleSendDmSubmit(me, peer, myPub);
    await settle(60);
  } finally {
    localStorage.setItem = realSet;
  }
  assert.equal((await lastSaved(peer)).status, "failed");
});

test("dm fio — chave de DM inválida mostra erro e reabilita o botão", async () => {
  const { peer, relay } = setupPeer();
  const f = addSendForm();
  f.input.value = "não vai cifrar";
  await handleSendDmSubmit(me, peer, { kty: "EC", crv: "P-256", x: "x", y: "y" });
  assert.equal(f.btn.disabled, false);
  assert.equal(relay.pushed.length, 0);
  assert.equal((await cacheNode.getDmMessages(peer)).length, 0);
  assert.equal(f.input.value, "não vai cifrar", "o texto digitado não se perde");
});

test("dm fio — responder a uma mensagem monta a citação, envia com replyTo e o cancelar limpa", async () => {
  const { peer } = setupPeer();
  const f = addSendForm();
  const replyBtn = makeEl();
  Object.assign(replyBtn.dataset, { msgId: "m_alvo", msgAuthor: "Ana", msgSnippet: "trecho" });
  const bar = dom.add("dm-reply-draft-bar");
  bar.hidden = true;
  const txt = dom.add("dm-reply-draft-text");
  const cancel = dom.add("btn-cancel-dm-reply");
  dom.group(".btn-dm-reply-msg", [replyBtn]);
  await showDmThread(peer);
  replyBtn.fire("click");
  assert.equal(bar.hidden, false);
  assert.equal(txt.textContent, 'Ana: "trecho"');
  assert.equal(dom.byId.get("dm-message-input").focused, 1);
  cancel.fire("click");
  assert.equal(bar.hidden, true);
  replyBtn.fire("click");
  f.input.value = "respondendo";
  await handleSendDmSubmit(me, peer, myPub);
  await settle(60);
  const saved = await lastSaved(peer);
  assert.equal(saved.replyTo.id, "m_alvo");
  assert.equal(saved.replyTo.author, "Ana");
});

test("dm fio — cartão vindo do link vira rascunho, entra como texto de reserva e sai ao limpar", async () => {
  const { peer } = setupPeer();
  const f = addSendForm();
  const clear = dom.add("btn-clear-dm-context");
  const bar = dom.add("dm-context-draft-bar");
  globalThis.location = { ...freshLocation(), hash: `#/dm/${peer}?ctxTitle=Bicicleta%20usada&ctxType=listing&listingId=L1` };
  await showDmThread(peer);
  assert.equal(location.hash, `#/dm/${peer}?ctxTitle=Bicicleta%20usada&ctxType=listing&listingId=L1`, "sem history no ambiente, o hash fica");
  clear.fire("click");
  assert.equal(bar.removed, true);
  globalThis.location = { ...freshLocation(), hash: `#/dm/${peer}?ctxTitle=Bicicleta%20usada&ctxType=listing&listingId=L1` };
  await showDmThread(peer);
  f.input.value = "";
  await handleSendDmSubmit(me, peer, myPub);
  await settle(60);
  const saved = await lastSaved(peer);
  assert.equal(saved.text, "💬 Bicicleta usada");
  assert.equal(saved.contextCard.title, "Bicicleta usada");
});

test("dm fio — com history, o hash do cartão é trocado pela rota limpa do fio", async () => {
  const { peer } = setupPeer();
  const calls = [];
  globalThis.history = { replaceState: (...a) => calls.push(a) };
  globalThis.location = { ...freshLocation(), hash: `#/dm/${peer}?ctxTitle=Mesa&ctxType=listing&listingId=L2` };
  try {
    await showDmThread(peer);
  } finally {
    delete globalThis.history;
  }
  assert.deepEqual(calls, [[null, "", `#/dm/${encodeURIComponent(peer)}`]]);
  dom.reset();
});

test("dm fio — copiar Pix grava a chave; botão sem chave não copia", async () => {
  const { peer } = setupPeer();
  const clip = installClipboard();
  const withPix = Object.assign(makeEl(), { dataset: { pix: "chave-pix-123" } });
  const noPix = makeEl();
  dom.group(".btn-dm-copy-pix", [withPix, noPix]);
  await showDmThread(peer);
  withPix.fire("click");
  noPix.fire("click");
  assert.deepEqual(clip.copied, ["chave-pix-123"]);
});

test("dm fio — reagir grava a reação localmente e manda o envelope da reação ao relay", async () => {
  const { peer, relay } = setupPeer();
  await saveMsg(peer, { id: "m_react_1", text: "reaja" });
  const pill = Object.assign(makeEl(), { dataset: { msgId: "m_react_1", emoji: "👍" } });
  const blank = Object.assign(makeEl(), { dataset: { msgId: "", emoji: "👍" } });
  dom.group(".btn-dm-react-pick, .dm-reaction-pill", [pill, blank]);
  await showDmThread(peer);
  blank.fire("click");
  pill.fire("click");
  await settle(150);
  const target = (await cacheNode.getDmMessages(peer)).find((m) => m.id === "m_react_1");
  assert.deepEqual(target.reactions, { "👍": [me] });
  assert.equal(relay.pushed.length, 1);
  assert.equal(relay.pushed[0].to, peer);
});

test("dm fio — reação com chave inválida fica só no aparelho e a tela remonta", async () => {
  const peer = nextPeer();
  installRelay(me);
  gql.cacheUserDmPub(peer, myPub);
  await saveMsg(peer, { id: "m_react_2", text: "reaja" });
  const pill = Object.assign(makeEl(), { dataset: { msgId: "m_react_2", emoji: "🔥" } });
  dom.group(".btn-dm-react-pick, .dm-reaction-pill", [pill]);
  await showDmThread(peer);
  gql.cacheUserDmPub(peer, { kty: "EC", crv: "P-256", x: "x", y: "y" });
  dom.main.innerHTML = "SENTINELA";
  pill.fire("click");
  await settle(150);
  const target = (await cacheNode.getDmMessages(peer)).find((m) => m.id === "m_react_2");
  assert.deepEqual(target.reactions, { "🔥": [me] });
  assert.notEqual(dom.main.innerHTML, "SENTINELA", "o fio foi remontado");
});
