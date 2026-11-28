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
});

/** Botão de reação falso para a mensagem e o emoji, com a classe dada. */
function controle(msgId, emoji, classe) {
  const el = Object.assign(makeEl(), { dataset: { msgId, emoji } });
  el.classes.add(classe);
  return el;
}

/** A cada redesenho da tela (`innerHTML` do `main`), registra e instala uma geração nova de controles. */
function instalarRedesenho(montar) {
  const geracoes = [];
  Object.defineProperty(dom.main, "innerHTML", {
    configurable: true,
    get: () => "",
    set: () => {
      const g = montar();
      geracoes.push(g);
      dom.group(CONTROLES, Object.values(g));
    },
  });
  return geracoes;
}

/** Abre a conversa, clica no controle `qual` da primeira tela e espera o redesenho. */
async function reagir(montar, qual) {
  installRelay(me);
  for (const id of ["m_foco_1", "m_foco_2"]) await cacheNode.saveDmMessage({ id, peerAddress: peer, from: peer, to: me, text: id, status: "received", ts: Date.now() });
  const geracoes = instalarRedesenho(montar);
  await showDmThread(peer);
  const antes = geracoes.length;
  geracoes[antes - 1][qual].fire("click");
  await settle(200);
  assert.ok(geracoes.length > antes, "a tela foi refeita depois do clique");
  return { velha: geracoes[antes - 1], nova: geracoes.at(-1) };
}

test("reagir devolve o foco à pílula da mesma reação na tela refeita", async () => {
  const { velha, nova } = await reagir(() => ({ rapido: controle("m_foco_1", "👍", "btn-dm-react-pick"), pilula: controle("m_foco_1", "👍", "dm-reaction-pill"), outra: controle("m_foco_2", "👍", "dm-reaction-pill") }), "pilula");
  assert.equal(nova.pilula.focused, 1, "a pílula nova recebe o foco");
  assert.equal(nova.rapido.focused + nova.outra.focused, 0, "nem o botão rápido, com a pílula presente, nem a pílula de outra mensagem");
  assert.equal(velha.pilula.focused, 0, "o foco não vai ao elemento da tela antiga");
});

test("se a pílula sumiu, o foco vai ao botão de reação rápida da mesma mensagem e emoji", async () => {
  const { velha, nova } = await reagir(() => ({ outraMsg: controle("m_foco_2", "🔥", "btn-dm-react-pick"), outroEmoji: controle("m_foco_1", "❤️", "btn-dm-react-pick"), rapido: controle("m_foco_1", "🔥", "btn-dm-react-pick") }), "rapido");
  assert.equal(nova.rapido.focused, 1, "o botão novo da mesma mensagem e emoji recebe o foco");
  assert.equal(nova.outroEmoji.focused + nova.outraMsg.focused, 0, "os de outro emoji ou de outra mensagem não");
  assert.equal(velha.rapido.focused, 0, "o foco não vai ao elemento da tela antiga");
});
