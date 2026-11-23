/**
 * @file Cobertura de `app/screens-dm.js` (lote T1), parte 1: caixa de entrada e lista de conversas.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import { installRelay, installClipboard, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as dmMsg from "../client/js/dm-messenger.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { pollInboxMessages, showDmList } from "../client/js/app/screens-dm.js";

const dom = installFakeDom();
let me = "";
let myPub = null;
let seq = 0;

const freshLocation = () => ({ hash: "#/dm", origin: "https://vox.test", pathname: "/app/", search: "" });

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
  myPub = (await cryptoDm.ensureDmKeys()).publicJwk;
  globalThis.location = freshLocation();
});

afterEach(() => {
  restoreEnv();
  dom.reset();
  globalThis.location = freshLocation();
});

const sealToMe = (text, from) => cryptoDm.seal(myPub, text, { from, to: me });
const saveMsg = (peer, over = {}) =>
  cacheNode.saveDmMessage({ id: `cov_t1_list_${++seq}`, peerAddress: peer, from: peer, to: me, text: "oi", status: "received", ts: 5000 + seq, ...over });

test("dm lista — pollInboxMessages sem usuário devolve 0 sem falar com o relay", async () => {
  const relay = installRelay(me);
  assert.equal(await pollInboxMessages(""), 0);
  assert.equal(relay.deleted.length, 0);
});

test("dm lista — relay fora do ar devolve 0", async () => {
  installRelay(me, { failPull: true });
  assert.equal(await pollInboxMessages(me), 0);
});

test("dm lista — ignora selada para outra conta e envelope que não abre; só conta o que entrou", async () => {
  const good = await sealToMe("mensagem boa", "vx_cov_list_a");
  const other = { ...(await sealToMe("x", "vx_cov_list_b")), to: "vx_outra_conta" };
  const broken = { id: "cov_broken", from: "vx_cov_list_c", to: me, ct: "lixo" };
  const relay = installRelay(me, { inbox: [other, broken, good] });
  assert.equal(await pollInboxMessages(me), 1);
  assert.deepEqual(relay.deleted, [good.id]);
  assert.deepEqual((await cacheNode.getDmMessages("vx_cov_list_a")).map((m) => m.text), ["mensagem boa"]);
});

test("dm lista — showDmList monta a lista com as conversas do aparelho", async () => {
  await saveMsg("vx_cov_list_show", { text: "texto-da-conversa-xyz" });
  installRelay(me);
  await showDmList();
  assert.match(dom.main.innerHTML, /texto-da-conversa-xyz/);
});

test("dm lista — copiar meu link grava o link do fio", async () => {
  installRelay(me);
  const clip = installClipboard();
  const btn = dom.add("btn-copy-my-dm-link");
  await showDmList();
  btn.fire("click");
  assert.deepEqual(clip.copied, [`https://vox.test/app/#/dm/${encodeURIComponent(me)}`]);
});

test("dm lista — formulário de nova conversa vai para o fio do endereço digitado", async () => {
  installRelay(me);
  const form = dom.add("form-new-dm");
  const input = dom.add("dm-peer-input");
  await showDmList();
  input.value = "  vx_cov_dest ";
  const ev = form.fire("submit");
  assert.equal(ev.defaultPrevented, true);
  assert.equal(location.hash, "#/dm/vx_cov_dest");
  input.value = "https://x/#/connect/vx_via_link";
  form.fire("submit");
  assert.equal(location.hash, "#/dm/vx_via_link");
});

test("dm lista — formulário com campo vazio não muda a rota", async () => {
  installRelay(me);
  const form = dom.add("form-new-dm");
  dom.add("dm-peer-input").value = "   ";
  await showDmList();
  form.fire("submit");
  assert.equal(location.hash, "#/dm");
});

test("dm lista — botão de buscar caixa puxa o que há no relay e remonta a lista", async () => {
  const relay = installRelay(me);
  const btn = dom.add("btn-pull-inbox");
  await showDmList();
  relay.inbox.push(await sealToMe("chegou-pelo-botao-q", "vx_cov_list_pull"));
  dom.main.innerHTML = "";
  btn.fire("click");
  await settle(150);
  assert.equal((await cacheNode.getDmMessages("vx_cov_list_pull")).length, 1);
  assert.match(dom.main.innerHTML, /chegou-pelo-botao-q/);
});

test("dm lista — busca refaz a lista filtrada e devolve o foco com o cursor onde estava", async () => {
  await saveMsg("vx_cov_list_busca1", { text: "alpha-unico" });
  installRelay(me);
  const search = dom.add("dm-search-input");
  await showDmList();
  search.value = "zzz-sem-resultado";
  search.selectionStart = 4;
  dom.main.innerHTML = "SENTINELA";
  search.fire("input");
  assert.notEqual(dom.main.innerHTML, "SENTINELA", "lista foi renderizada de novo");
  assert.doesNotMatch(dom.main.innerHTML, /alpha-unico/);
  assert.equal(search.focused, 1);
  assert.deepEqual(search.selection, [4, 4]);
});

test("dm lista — fixar conversa grava o pin e remonta; passar do limite mantém a tela", async () => {
  installRelay(me);
  localStorage.removeItem(dmMsg.DM_PINS_STORAGE_KEY);
  let current = [];
  // Cada remontagem entrega botões novos, como o DOM real depois de `renderDmList`.
  dom.main.querySelectorAll = (sel) => {
    if (sel !== ".btn-dm-pin") return [];
    current = ["vx_p1", "vx_p2", "vx_p3", "vx_p4"].map((peer) => Object.assign(makeEl(), { dataset: { peer } }));
    return current;
  };
  await showDmList();
  for (const peer of ["vx_p1", "vx_p2", "vx_p3"]) {
    const ev = current.find((b) => b.dataset.peer === peer).fire("click");
    assert.equal(ev.defaultPrevented && ev.stopped, true);
  }
  assert.deepEqual(dmMsg.getPinnedPeers().sort(), ["vx_p1", "vx_p2", "vx_p3"]);
  dom.main.innerHTML = "SENTINELA";
  current.find((b) => b.dataset.peer === "vx_p4").fire("click");
  assert.equal(dom.main.innerHTML, "SENTINELA", "no limite não remonta");
  assert.equal(dmMsg.isPeerPinned("vx_p4"), false);
  localStorage.removeItem(dmMsg.DM_PINS_STORAGE_KEY);
});
