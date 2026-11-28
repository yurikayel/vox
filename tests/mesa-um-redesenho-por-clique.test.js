/**
 * @file Mesa (sanctum): um clique redesenha o contêiner uma vez só. Ação que devolve promessa (gravar no store, copiar
 * o convite) redesenhava na hora e de novo ao assentar: dois `innerHTML` completos, dois instantâneos de foco e dois
 * recálculos de selos por clique. Agora a promessa redesenha ao assentar; ação síncrona redesenha na hora.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { drainMicrotasks } from "./helpers/wait-until.js";

const quieto = () => drainMicrotasks(300);

/** Mesa montada de verdade; o contêiner falso conta quantas vezes o HTML foi escrito. */
async function mesaContada() {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  state.inviteHref = "#/dungeon/entrar/abc";
  const handlers = {};
  const log = { redesenhos: 0, html: "" };
  const container = {
    dataset: {},
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  Object.defineProperty(container, "innerHTML", {
    get: () => log.html,
    set: (v) => { log.html = v; log.redesenhos += 1; },
  });
  wireDungeonView(container, { screen: "mesa", state, store: createVttStore(createMemoryVttBackend()) });
  await quieto();
  log.redesenhos = 0;
  return { state, handlers, log };
}

const clique = (action, dataset = {}) => {
  const target = { dataset: { dungeon: action, ...dataset } };
  target.closest = () => target;
  return { target };
};

test("ação que devolve promessa (copiar convite) redesenha uma vez, ao assentar", async () => {
  const { handlers, log } = await mesaContada();
  const job = handlers.click(clique("copy-invite"));
  assert.ok(job && typeof job.then === "function", "a ação devolve a promessa do settle");
  await job;
  await quieto();
  assert.equal(log.redesenhos, 1);
});

test("ação síncrona (selecionar token) redesenha uma vez, na hora", async () => {
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("select-token", { tokenId: "t1" }));
  assert.equal(job, undefined, "sem promessa, nada a assentar");
  assert.equal(state.selectedTokenId, "t1");
  assert.equal(log.redesenhos, 1, "redesenhou na hora");
  await quieto();
  assert.equal(log.redesenhos, 1);
});

test("ação que devolve promessa e grava no store também redesenha uma vez", async () => {
  const { handlers, log } = await mesaContada();
  await handlers.click(clique("add-floor"));
  await quieto();
  assert.equal(log.redesenhos, 1);
});

test("ação desconhecida não redesenha nada", async () => {
  const { handlers, log } = await mesaContada();
  assert.equal(handlers.click(clique("nao-existe")), undefined);
  await quieto();
  assert.equal(log.redesenhos, 0);
});
