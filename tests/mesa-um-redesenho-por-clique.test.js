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
function acaoLenta(t, { rejeita = false, muda = false, nome = "acao-teste-lenta" } = {}) {
  let libera;
  const portao = new Promise((r) => { libera = r; });
  const original = ACTION_HANDLERS[nome];
  ACTION_HANDLERS[nome] = async (state) => { state.campaignNotice = ""; await portao; if (rejeita) throw new Error("Falha simulada ao gravar"); if (muda) state.campaignNotice = "Gravado"; };
  t.after(() => { if (original) ACTION_HANDLERS[nome] = original; else delete ACTION_HANDLERS[nome]; });
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

test("gravação lenta que muda o estado ao assentar: o quadro mostra o resultado e o settle desenha de novo", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t, { muda: true });
  const { handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  assert.equal(log.redesenhos, 0, "nada desenhado dentro do clique");
  frames.quadro();
  assert.equal(log.redesenhos, 1, "o quadro mostrou o estado antes de a gravação assentar");
  libera();
  await job;
  assert.equal(log.redesenhos, 2, "o settle desenhou o estado final");
});

test("gravação lenta sem mudança no assentar: um desenho só (o do quadro)", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t);
  const { handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  frames.quadro();
  assert.equal(log.redesenhos, 1);
  libera();
  await job;
  assert.equal(log.redesenhos, 1, "o estado é o mesmo do quadro: nada a redesenhar");
});

test("gravação lenta que só muda o estado de uma subestrutura reatribuída (campo novo) desenha de novo", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t);
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  frames.quadro();
  state.sheet = { ...state.sheet };
  libera();
  await job;
  assert.equal(log.redesenhos, 2, "campo reatribuído entre o quadro e o assentar conta como mudança");
});

test("gravação lenta que rejeita: desenha de novo mesmo sem mudança de campo", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t, { rejeita: true });
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  state.campaignNotice = "Falha simulada ao gravar";
  frames.quadro();
  libera();
  await job;
  assert.equal(log.redesenhos, 2);
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

test("campo do estado removido entre o quadro e o assentar conta como mudança", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t);
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  frames.quadro();
  delete state[Object.keys(state).at(-1)];
  libera();
  await job;
  assert.equal(log.redesenhos, 2);
});

test("a marca vale depois do desenho: o que o próprio desenho muda no estado não força outro", async (t) => {
  const frames = instalaQuadros(t);
  const libera = acaoLenta(t);
  const { state, handlers, log } = await mesaContada();
  const job = handlers.click(clique("acao-teste-lenta"));
  state.hudPanelFocus = "[data-hud-x]";
  frames.quadro();
  libera();
  await job;
  assert.equal(log.redesenhos, 1, "o desenho consumiu o foco do painel; nada mudou depois dele");
});

for (const nome of ["wizard-open", "roll-d20"]) {
  test(`ação ${nome} (foco ou dados 3D depois do desenho) desenha ao assentar mesmo sem mudança`, async (t) => {
    const frames = instalaQuadros(t);
    const libera = acaoLenta(t, { nome });
    const { handlers, log } = await mesaContada();
    const job = handlers.click(clique(nome));
    frames.quadro();
    libera();
    await job;
    assert.equal(log.redesenhos, 2);
  });
}