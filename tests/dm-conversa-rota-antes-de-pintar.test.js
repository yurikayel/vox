/**
 * @file Conversa de DM: depois de cada espera (conta, relay, cifra, lista de conversas) `showDmThread` só desenha se a
 * rota ainda for a conversa com o mesmo par. Quem reage e vai ao feed (ou a outra conversa) enquanto a rede ou a
 * cifra ainda corre não pode ter a conversa velha repintada por cima da tela nova.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import { installRelay, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as gql from "../client/js/graphql.js";
import * as dmMsg from "../client/js/dm-messenger.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { showDmThread } from "../client/js/app/screens-dm.js";

const dom = installFakeDom();
let me = "";
let pub = null;
let seq = 0;

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
  pub = (await cryptoDm.ensureDmKeys()).publicJwk;
});

afterEach(() => {
  restoreEnv();
  dom.reset();
  delete globalThis.matchMedia;
  location.hash = "#/";
});

const rotaDaConversa = (par) => `#/dm/${encodeURIComponent(par)}`;

/** Par novo com chave guardada, rota aberta nele e uma mensagem; devolve o par. */
async function abrirConversa() {
  const par = `vx_rota_pintar_${++seq}`;
  gql.cacheUserDmPub(par, pub);
  installRelay(me);
  location.hash = rotaDaConversa(par);
  await cacheNode.saveDmMessage({ id: `m_rota_${seq}`, peerAddress: par, from: par, to: me, text: `texto-${seq}`, status: "received", ts: Date.now() });
  return par;
}

/** Registra cada HTML escrito na raiz da tela. */
function escritas() {
  const w = [];
  Object.defineProperty(dom.main, "innerHTML", { configurable: true, get: () => w.at(-1) ?? "", set: (v) => w.push(String(v)) });
  return w;
}

/** Segura o `fetch` (relay) até `solta()`: a espera de rede em que a pessoa muda de tela. */
function segurarRede() {
  const real = globalThis.fetch;
  let solta;
  const portao = new Promise((r) => { solta = r; });
  globalThis.fetch = async (...args) => { await portao; return real(...args); };
  return solta;
}

test("rota que continua na conversa: o fio é desenhado com as mensagens", async () => {
  const par = await abrirConversa();
  const w = escritas();
  await showDmThread(par);
  assert.ok(w.some((h) => h.includes(`texto-${seq}`)), "a conversa aparece");
});

test("saiu da conversa enquanto a conta carregava: nada é desenhado", async () => {
  const par = await abrirConversa();
  const w = escritas();
  const job = showDmThread(par);
  location.hash = "#/";
  await job;
  assert.deepEqual(w, [], "nem a casca nem o fio");
  assert.equal(dmMsg.getLastReadTs(par), 0, "a conversa que a pessoa não viu não é marcada como lida");
});

test("foi ao feed enquanto a rede esperava: a conversa velha não é repintada", async () => {
  const par = await abrirConversa();
  const w = escritas();
  const solta = segurarRede();
  const job = showDmThread(par);
  await settle(30);
  const antes = w.length;
  location.hash = "#/";
  solta();
  await job;
  assert.equal(w.length, antes, "nada escrito depois da troca de tela");
  assert.ok(!w.some((h) => h.includes(`texto-${seq}`)), "o fio não chegou à tela");
});

test("foi a outra conversa enquanto a rede esperava: a conversa velha não é repintada", async () => {
  const par = await abrirConversa();
  const w = escritas();
  const solta = segurarRede();
  const job = showDmThread(par);
  await settle(30);
  const antes = w.length;
  location.hash = rotaDaConversa("vx_rota_outro_par");
  solta();
  await job;
  assert.equal(w.length, antes);
});

test("par que é prefixo de outro: a rota é lida inteira", async () => {
  const par = await abrirConversa();
  const w = escritas();
  const solta = segurarRede();
  const job = showDmThread(par);
  await settle(30);
  const antes = w.length;
  location.hash = rotaDaConversa(`${par}0`);
  solta();
  await job;
  assert.equal(w.length, antes);
});

test("tela larga: saiu da conversa enquanto a lista carregava, nem a divisão nem o fio são desenhados", async () => {
  const par = await abrirConversa();
  const w = escritas();
  globalThis.matchMedia = () => {
    location.hash = "#/";
    return { matches: true };
  };
  const erro = await showDmThread(par).then(() => null, (e) => e);
  assert.equal(erro, null, "sem a guarda a lista falha no DOM falso e a promessa rejeita");
  assert.ok(w.every((h) => !h.includes("agora-dm-split") && !h.includes(`texto-${seq}`)), "só a casca, sem a divisão nem o fio");
});

test("reagir e ir ao feed durante a cifra: a conversa velha não volta por cima", async () => {
  const par = await abrirConversa();
  const pilula = Object.assign(makeEl(), { dataset: { msgId: `m_rota_${seq}`, emoji: "👍" } });
  const w = escritas();
  dom.group(".btn-dm-react-pick, .dm-reaction-pill", [pilula]);
  await showDmThread(par);
  const solta = segurarRede();
  pilula.fire("click");
  await settle(30);
  location.hash = "#/";
  const antes = w.length;
  solta();
  await settle(200);
  assert.equal(w.length, antes, "nada escrito depois que a pessoa foi ao feed");
});
