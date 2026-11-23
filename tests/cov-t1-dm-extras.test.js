/**
 * @file Cobertura de `app/screens-dm.js` (lote T1), parte 3: foto anexada, chave manual, painel dividido
 * em tela larga, ouvinte de DM direta e telas sem conta local.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import { installRelay, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as gql from "../client/js/graphql.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { OUTBOX_KEY } from "../client/js/dm-outbox.js";
import { dispatchDirectMessage } from "../client/js/peers-events.js";
import { handleSendDmSubmit, showDmThread, initDmListeners } from "../client/js/app/screens-dm.js";

const dom = installFakeDom();
let me = "";
let myPub = null;
let seq = 0;

const freshLocation = () => ({ hash: "#/dm", origin: "https://vox.test", pathname: "/app/", search: "" });
const nextPeer = () => `vx_cov_extra_${++seq}`;

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

function setupPeer() {
  const peer = nextPeer();
  gql.cacheUserDmPub(peer, myPub);
  return { peer, relay: installRelay(me) };
}

function addSendForm() {
  return {
    form: dom.add("form-send-dm"),
    input: dom.add("dm-message-input"),
    container: Object.assign(dom.add("dm-thread-container"), { scrollHeight: 777, scrollTop: 0 }),
  };
}

/** FileReader, Image e canvas mínimos: no navegador a compressão da foto usa o canvas. */
function installImagePipeline(dataUrl) {
  globalThis.FileReader = class {
    readAsDataURL() {
      queueMicrotask(() => {
        this.result = "data:image/png;base64,AAAA";
        this.onload();
      });
    }
  };
  globalThis.Image = class {
    set src(_v) {
      queueMicrotask(() => {
        this.width = 800;
        this.height = 400;
        this.onload();
      });
    }
  };
  dom.document.createElement = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => dataUrl });
}

function removeImagePipeline() {
  delete globalThis.FileReader;
  delete globalThis.Image;
  dom.document.createElement = () => makeEl();
}

function mediaFixture() {
  return {
    input: dom.add("dm-media-input"),
    bar: Object.assign(dom.add("dm-media-draft-bar"), { hidden: true }),
    cancel: dom.add("btn-cancel-dm-media"),
  };
}

const lastSaved = async (peer) => (await cacheNode.getDmMessages(peer)).at(-1);

test("dm extras — foto anexada é comprimida, mostra a barra e vai como texto de reserva", async () => {
  const { peer, relay } = setupPeer();
  const f = addSendForm();
  const m = mediaFixture();
  installImagePipeline("data:image/jpeg;base64,QUJD");
  try {
    await showDmThread(peer);
    m.input.files = [{ type: "image/png" }];
    m.input.fire("change");
    await settle(30);
    assert.equal(m.bar.hidden, false);
    f.input.value = "";
    await handleSendDmSubmit(me, peer, myPub);
    await settle(80);
  } finally {
    removeImagePipeline();
  }
  const saved = await lastSaved(peer);
  assert.equal(saved.text, "📷 Foto");
  assert.equal(saved.mediaDataUrl, "data:image/jpeg;base64,QUJD");
  assert.equal(relay.pushed.length, 1);
});

test("dm extras — foto fora do formato aceito não vira rascunho; sem arquivo nada acontece", async () => {
  const { peer } = setupPeer();
  const m = mediaFixture();
  installImagePipeline("data:text/plain;base64,QUJD");
  try {
    await showDmThread(peer);
    m.input.files = [];
    m.input.fire("change");
    m.input.files = [{ type: "image/png" }];
    m.input.fire("change");
    await settle(30);
    assert.equal(m.bar.hidden, true, "dataURL que não é imagem é recusado");
    m.input.files = [{ type: "application/pdf" }];
    m.input.fire("change");
    await settle(30);
    assert.equal(m.bar.hidden, true);
  } finally {
    removeImagePipeline();
  }
});

test("dm extras — cancelar a foto esconde a barra e o envio vazio deixa de levar imagem", async () => {
  const { peer, relay } = setupPeer();
  const f = addSendForm();
  const m = mediaFixture();
  installImagePipeline("data:image/jpeg;base64,QUJD");
  try {
    await showDmThread(peer);
    m.input.files = [{ type: "image/png" }];
    m.input.fire("change");
    await settle(30);
    m.cancel.fire("click");
    assert.equal(m.bar.hidden, true);
    f.input.value = "";
    await handleSendDmSubmit(me, peer, myPub);
  } finally {
    removeImagePipeline();
  }
  assert.equal(relay.pushed.length, 0, "sem texto e sem foto não há o que enviar");
});

test("dm extras — sem chave de DM conhecida o envio não é ligado e a chave manual é salva", async () => {
  const peer = nextPeer();
  installRelay(me);
  const f = addSendForm();
  const save = dom.add("btn-save-manual-dmpub");
  const field = dom.add("input-manual-dmpub");
  await showDmThread(peer);
  assert.equal(f.form.listeners.size, 0);
  field.value = "{ não é json";
  save.fire("click");
  assert.equal(gql.getCachedUserDmPub(peer), null);
  field.value = JSON.stringify(myPub);
  save.fire("click");
  assert.deepEqual(gql.getCachedUserDmPub(peer), myPub);
  await settle(80);
});

test("dm extras — em tela larga a lista compacta aparece ao lado e a busca filtra de novo", async () => {
  const { peer } = setupPeer();
  await cacheNode.saveDmMessage({ id: `cov_t1_x_${++seq}`, peerAddress: peer, from: peer, to: me, text: "conversa-no-painel-lateral", status: "received", ts: 9100 });
  globalThis.matchMedia = () => ({ matches: true });
  const listPane = dom.add("dm-list-pane");
  const threadPane = dom.add("dm-thread-pane");
  const search = makeEl();
  listPane.querySelector = (sel) => (sel === "#dm-search-input" ? search : null);
  dom.main.querySelector = (sel) => ({ "#dm-list-pane": listPane, "#dm-thread-pane": threadPane })[sel] || null;
  await showDmThread(peer);
  assert.match(dom.main.innerHTML, /agora-dm-split/);
  assert.match(listPane.innerHTML, /conversa-no-painel-lateral/);
  search.value = "inexistente-zzz";
  search.fire("input");
  assert.doesNotMatch(listPane.innerHTML, /conversa-no-painel-lateral/);
  assert.equal(search.focused, 1);
  assert.deepEqual(search.selection, [15, 15]);
});

test("dm extras — DM direta chega: ignora a de outra conta, grava a minha e remonta o fio aberto", async () => {
  const peer = nextPeer();
  setupPeer();
  initDmListeners();
  const f = addSendForm();
  const foreign = { ...(await cryptoDm.seal(myPub, "alheia", { from: peer, to: "vx_outra" })), to: "vx_outra" };
  dispatchDirectMessage(foreign);
  await settle(80);
  assert.equal((await cacheNode.getDmMessages(peer)).length, 0);
  const mine = await cryptoDm.seal(myPub, "direta-para-mim", { from: peer, to: me });
  globalThis.location = { ...freshLocation(), hash: `#/dm/${encodeURIComponent(peer)}` };
  dom.main.innerHTML = "SENTINELA";
  dispatchDirectMessage(mine);
  await settle(300);
  assert.deepEqual((await cacheNode.getDmMessages(peer)).map((m) => m.text), ["direta-para-mim"]);
  assert.match(dom.main.innerHTML, /direta-para-mim/, "fio aberto foi remontado");
  assert.equal(f.container.scrollTop, 777);
});

test("dm extras — DM direta de outro fio é gravada sem remontar a tela; ilegível não grava nada", async () => {
  const peer = nextPeer();
  const mine = await cryptoDm.seal(myPub, "outro-fio", { from: peer, to: me });
  globalThis.location = { ...freshLocation(), hash: "#/dm/vx_alguem_diferente" };
  dom.main.innerHTML = "SENTINELA";
  dispatchDirectMessage(mine);
  await settle(120);
  assert.equal((await cacheNode.getDmMessages(peer)).length, 1);
  assert.equal(dom.main.innerHTML, "SENTINELA");
  dispatchDirectMessage({ id: "cov_t1_broken", from: peer, to: me, ct: "lixo" });
  await settle(120);
  assert.equal((await cacheNode.getDmMessages(peer)).length, 1);
});
