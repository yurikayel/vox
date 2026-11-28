/**
 * @file Mesa (sanctum): um clique redesenha o contêiner uma vez só quando a gravação é rápida, e mostra o resultado no
 * próximo quadro quando é lenta. Ação que devolve promessa redesenhava na hora e de novo ao assentar (dois `innerHTML`
 * completos); agora o desenho imediato vai para o próximo quadro e o `settleAndRedraw` o cancela se assentar antes.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { drainMicrotasks } from "./helpers/wait-until.js";

const quieto = () => drainMicrotasks(300);

/** `requestAnimationFrame` falso: guarda os quadros e só roda quando o teste manda (`quadro()`). */
function instalaQuadros(t, { semCancelar = false } = {}) {
  const antes = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  const fila = new Map();
  let seq = 0;
  globalThis.requestAnimationFrame = (fn) => { fila.set(++seq, fn); return seq; };
  globalThis.cancelAnimationFrame = semCancelar ? undefined : (id) => { fila.delete(id); };
  t.after(() => { globalThis.requestAnimationFrame = antes.raf; globalThis.cancelAnimationFrame = antes.caf; });
  return { quadro: () => { const fns = [...fila.values()]; fila.clear(); fns.forEach((fn) => fn()); }, pendentes: () => fila.size };
}

/** Mesa montada de verdade; o contêiner falso conta quantas vezes o HTML foi escrito. */
async function mesaContada(store = createVttStore(createMemoryVttBackend())) {
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
  wireDungeonView(container, { screen: "mesa", state, store });
  await quieto();
  log.redesenhos = 0;
  return { state, handlers, log };
}

const clique = (action, dataset = {}) => {
  const target = { dataset: { dungeon: action, ...dataset } };
  target.closest = () => target;
  return { target };
};

/** Ação de teste cuja promessa só assenta quando `libera()` roda, ou rejeita. */
function acaoLenta(t, { rejeita = false } = {}) {
  let libera;
  const portao = new Promise((r) => { libera = r; });
  ACTION_HANDLERS["acao-teste-lenta"] = async (state) => { state.campaignNotice = ""; await portao; if (rejeita) throw new Error("Falha simulada ao gravar"); };
  t.after(() => { delete ACTION_HANDLERS["acao-teste-lenta"]; });
  return libera;
}

test("gravação rápida (assenta antes do quadro): um desenho só, e o quadro agendado é cancelado", async (t) => {
  const frames = instalaQuadros(t);
  const { handlers, log } = await mesaContada();
  await handlers.click(clique("copy-invite"));
  frames.quadro();
  await quieto();
  assert.equal(log.redesenhos, 1);
  assert.equal(frames.pendentes(), 0);
});

test("sem cancelAnimationFrame o quadro agendado não desenha de novo depois que a gravação assentou", async (t) => {
  const frames = instalaQuadros(t, { semCancelar: true });
  const { handlers, log } = await mesaContada();
  await handlers.click(clique("copy-invite"));
  frames.quadro();
  assert.equal(log.redesenhos, 1);
});

test("gravação lenta: o resultado aparece no próximo quadro, sem esperar a gravação, e o settle desenha depois", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t);
  const { handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  assert.equal(log.redesenhos, 0, "nada desenhado dentro do clique");
  frames.quadro();
  assert.equal(log.redesenhos, 1, "o quadro mostrou o estado antes de a gravação assentar");
  libera();
  await job;
  assert.equal(log.redesenhos, 2, "o settle desenhou o estado final");
});

test("ação síncrona (selecionar token) redesenha uma vez, na hora, sem agendar quadro", async (t) => {
  const frames = instalaQuadros(t);
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("select-token", { tokenId: "t1" }));
  assert.equal(job, undefined, "sem promessa, nada a assentar");
  assert.equal(state.selectedTokenId, "t1");
  assert.equal(log.redesenhos, 1, "redesenhou na hora");
  assert.equal(frames.pendentes(), 0);
  frames.quadro();
  await quieto();
  assert.equal(log.redesenhos, 1);
});

test("ação que grava no store (adicionar andar) com gravação rápida redesenha uma vez", async (t) => {
  const frames = instalaQuadros(t);
  const { handlers, log } = await mesaContada();
  await handlers.click(clique("add-floor"));
  frames.quadro();
  await quieto();
  assert.equal(log.redesenhos, 1);
});

test("promessa que rejeita pelo clique: um redesenho e o aviso com a mensagem", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t, { rejeita: true });
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  libera();
  await job;
  frames.quadro();
  await quieto();
  assert.equal(log.redesenhos, 1, "a rejeição também desenha, uma vez");
  assert.equal(state.campaignNotice, "Falha simulada ao gravar");
});

test("ação desconhecida não redesenha nada", async (t) => {
  const frames = instalaQuadros(t);
  const { handlers, log } = await mesaContada();
  assert.equal(handlers.click(clique("nao-existe")), undefined);
  frames.quadro();
  await quieto();
  assert.equal(log.redesenhos, 0);
});

test("sem requestAnimationFrame (ambiente sem quadros) a promessa ainda redesenha ao assentar", async (t) => {
  const antes = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = undefined;
  t.after(() => { globalThis.requestAnimationFrame = antes; });
  const { handlers, log } = await mesaContada();
  await handlers.click(clique("copy-invite"));
  assert.equal(log.redesenhos, 1);
});
