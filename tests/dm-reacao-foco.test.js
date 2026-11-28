/**
 * @file Reagir numa mensagem refaz a tela da conversa; o foco volta ao controle da mesma reação (a pílula, ou o botão
 * de reação rápida se a pílula sumiu) e não cai no `body` (WCAG 2.4.3 e 4.1.2). Cada redesenho do DOM falso troca os
 * controles por elementos novos, como o DOM real: o foco só vale se for dado ao controle da tela refeita.
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
import { showDmThread } from "../client/js/app/screens-dm.js";

const dom = installFakeDom();
const CONTROLES = ".btn-dm-react-pick, .dm-reaction-pill";
let me = "";
let peer = "";

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
  const pub = (await cryptoDm.ensureDmKeys()).publicJwk;
  peer = "vx_reacao_foco_1";
  gql.cacheUserDmPub(peer, pub);
});

afterEach(() => {
  restoreEnv();
  dom.reset();
  location.hash = "#/";
});

/** Rota da conversa com o par, como o roteador a escreve. */
const rotaDaConversa = (par) => `#/dm/${encodeURIComponent(par)}`;

/** Botão de reação falso para a mensagem e o emoji, com a classe dada. */
function controle(msgId, emoji, classe) {
  const el = Object.assign(makeEl(), { dataset: { msgId, emoji } });
  el.classes.add(classe);
  return el;
}

/** A cada redesenho da tela (`innerHTML` do `main`), registra e instala uma geração nova de controles. */
function instalarRedesenho(montar, aoRefazer) {
  const geracoes = [];
  Object.defineProperty(dom.main, "innerHTML", {
    configurable: true,
    get: () => "",
    set: () => {
      const g = montar();
      geracoes.push(g);
      dom.group(CONTROLES, Object.values(g));
      aoRefazer?.(geracoes.length);
    },
  });
  return geracoes;
}

/**
 * Abre a conversa, clica no controle `qual` da primeira tela e espera o redesenho. `irPara` muda o hash durante o
 * redesenho que o clique provoca, como a pessoa que sai da conversa enquanto a cifra ainda corre.
 */
async function reagir(montar, qual, irPara, par = peer) {
  installRelay(me);
  location.hash = rotaDaConversa(par);
  for (const id of ["m_foco_1", "m_foco_2"]) await cacheNode.saveDmMessage({ id, peerAddress: par, from: par, to: me, text: id, status: "received", ts: Date.now() });
  let clicou = false;
  const geracoes = instalarRedesenho(montar, () => {
    if (clicou && irPara) location.hash = irPara;
  });
  await showDmThread(par);
  const antes = geracoes.length;
  clicou = true;
  geracoes[antes - 1][qual].fire("click");
  await settle(200);
  assert.ok(geracoes.length > antes, "a tela foi refeita depois do clique");
  return { velha: geracoes[antes - 1], nova: geracoes.at(-1) };
}

test("reagir devolve o foco à pílula da mesma reação na tela refeita", async () => {
  const { velha, nova } = await reagir(() => ({ outra: controle("m_foco_2", "👍", "dm-reaction-pill"), outroEmoji: controle("m_foco_1", "❤️", "dm-reaction-pill"), rapido: controle("m_foco_1", "👍", "btn-dm-react-pick"), pilula: controle("m_foco_1", "👍", "dm-reaction-pill") }), "pilula");
  assert.equal(nova.pilula.focused, 1, "a pílula nova recebe o foco");
  assert.equal(nova.rapido.focused + nova.outra.focused + nova.outroEmoji.focused, 0, "nem o botão rápido, com a pílula presente, nem a pílula de outra mensagem ou de outro emoji");
  assert.equal(velha.pilula.focused, 0, "o foco não vai ao elemento da tela antiga");
});

test("se a pílula sumiu, o foco vai ao botão de reação rápida da mesma mensagem e emoji", async () => {
  const { velha, nova } = await reagir(() => ({ outraMsg: controle("m_foco_2", "🔥", "btn-dm-react-pick"), outroEmoji: controle("m_foco_1", "❤️", "btn-dm-react-pick"), rapido: controle("m_foco_1", "🔥", "btn-dm-react-pick") }), "rapido");
  assert.equal(nova.rapido.focused, 1, "o botão novo da mesma mensagem e emoji recebe o foco");
  assert.equal(nova.outroEmoji.focused + nova.outraMsg.focused, 0, "os de outro emoji ou de outra mensagem não");
  assert.equal(velha.rapido.focused, 0, "o foco não vai ao elemento da tela antiga");
});

/** Soma o foco de todos os controles de todas as gerações. */
const focos = (...gs) => gs.flatMap((g) => Object.values(g)).reduce((n, c) => n + c.focused, 0);
const montarPadrao = () => ({ rapido: controle("m_foco_1", "👍", "btn-dm-react-pick"), pilula: controle("m_foco_1", "👍", "dm-reaction-pill") });

test("se a pessoa foi ao feed durante o redesenho, ninguém recebe o foco", async () => {
  const { velha, nova } = await reagir(montarPadrao, "pilula", "#/");
  assert.equal(focos(velha, nova), 0, "o foco não é roubado da tela em que a pessoa está");
});

test("se a pessoa foi a outra conversa durante o redesenho, ninguém recebe o foco", async () => {
  const { velha, nova } = await reagir(montarPadrao, "pilula", `#/dm/${encodeURIComponent("vx_outro_par")}`);
  assert.equal(focos(velha, nova), 0, "a conversa de outro par não é a desta reação");
});

test("a conversa de um par que é prefixo de outro não conta como aberta (a rota é lida inteira)", async () => {
  const maisLongo = `${peer}0`;
  const { velha, nova } = await reagir(montarPadrao, "pilula", `#/dm/${encodeURIComponent(maisLongo)}`);
  assert.equal(focos(velha, nova), 0, `a conversa com ${maisLongo} não é a conversa com ${peer}`);
});

test("par sem chave de cifra: a reação fica só neste aparelho e o foco volta à pílula do mesmo jeito", async () => {
  const semChave = "vx_reacao_sem_chave_1";
  assert.equal(gql.getCachedUserDmPub(semChave) ?? null, null, "este par não tem chave guardada");
  const { velha, nova } = await reagir(montarPadrao, "pilula", undefined, semChave);
  assert.equal(nova.pilula.focused, 1, "a pílula nova recebe o foco mesmo sem chave do par");
  assert.equal(nova.rapido.focused + velha.pilula.focused, 0);
});

test("sem controle da mesma reação na tela refeita, nada quebra e ninguém recebe o foco", async () => {
  const rejeicoes = [];
  const anota = (e) => rejeicoes.push(e);
  process.on("unhandledRejection", anota);
  try {
    let desenhos = 0;
    const montar = () => (desenhos++ === 0 ? { alvo: controle("m_foco_1", "👍", "dm-reaction-pill") } : { outra: controle("m_foco_2", "🔥", "dm-reaction-pill") });
    const { velha, nova } = await reagir(montar, "alvo");
    await settle(50);
    assert.deepEqual(rejeicoes.map(String), [], "focar o que não existe não pode virar erro solto");
    assert.equal(focos(velha, nova), 0);
  } finally {
    process.off("unhandledRejection", anota);
  }
});
