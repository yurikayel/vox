/**
 * @file Mesa pela rede: aperto de mão autenticado no canal. Mestre e jogador provam a posse da chave da mesa,
 * amarrada às impressões das duas pontas; até lá nada da mesa passa, e quem não prova é desconectado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createRtcVttTransport } from "../client/js/dungeon/vtt-rtc-transport.js";
import { createFakeRtcNetwork, createFakeSignalingHub } from "./helpers/fake-rtc.js";
import { waitUntil } from "./helpers/wait-until.js";

/** Esvazia as microtarefas pendentes (a entrega do RTC falso é por microtarefa). */
async function drain() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

/** Barreira: o jogador viu `auth_failed` do Mestre (na base nunca acontece, e a espera curta só adia o assert). */
const anaSawFailure = (w) => waitUntil(
  () => w.env.events.some(([me, id, st]) => me === w.anaKey.routeId && id === w.gmKey.routeId && st === "auth_failed"),
  2000,
);

/**
 * Monta um transporte ligado ao hub e ao RTC falsos, registrando mensagens e estados.
 * @param {object} env Rede, hub e registros.
 * @param {object} key Par de chaves da ponta.
 * @param {object} [extra] Opções extras (`initiate`, `auth`).
 * @returns {{ tr: object, got: object[] }} Transporte e mensagens recebidas.
 */
function endpoint(env, key, extra = {}) {
  const got = [];
  const tr = createRtcVttTransport({
    peerId: key.routeId, signaling: env.hub.connect(key.routeId), createPeerConnection: env.rtc.createPeerConnection,
    onStatus: (id, s) => env.events.push([key.routeId, id, s]), ...extra,
  });
  tr.onMessage((m) => got.push(m));
  return { tr, got };
}

async function world() {
  const env = { rtc: createFakeRtcNetwork(), hub: createFakeSignalingHub(), events: [] };
  const [gmKey, anaKey, evilKey, bobKey] = await Promise.all([1, 2, 3, 4].map(() => generateVttKeypair()));
  return { env, gmKey, anaKey, evilKey, bobKey, roomKey: generateRoomKey(), closers: [] };
}

test("a) honesto: os dois provam, o HELLO_SYNC chega e o quadro de prova não sobe", async () => {
  const w = await world();
  const gm = endpoint(w.env, w.gmKey, { auth: { keypair: w.gmKey } });
  const ana = endpoint(w.env, w.anaKey, { initiate: true, auth: { keypair: w.anaKey } });
  ana.tr.send(w.gmKey.routeId, { type: "HELLO_SYNC", roomKey: w.roomKey });
  await waitUntil(() => gm.got.some((m) => m.type === "HELLO_SYNC"));
  assert.equal(gm.got.some((m) => m.kind === "VTT_AUTH"), false);
  assert.equal(ana.got.some((m) => m.kind === "VTT_AUTH"), false);
  gm.tr.close();
  ana.tr.close();
});

test("b) intruso com a rota do Mestre: não recebe a chave da sala e o jogador vê auth_failed", async () => {
  const w = await world();
  const gm = endpoint(w.env, w.gmKey, { auth: { keypair: w.gmKey } });
  const evil = endpoint(w.env, { ...w.evilKey, routeId: w.gmKey.routeId }, { auth: { keypair: w.evilKey } });
  const ana = endpoint(w.env, w.anaKey, { initiate: true, auth: { keypair: w.anaKey } });
  ana.tr.send(w.gmKey.routeId, { type: "HELLO_SYNC", roomKey: w.roomKey });
  await anaSawFailure(w);
  const leaked = [...evil.got, ...gm.got].some((m) => JSON.stringify(m).includes(w.roomKey))
    || w.env.rtc.log.sent.some((t) => t.includes(w.roomKey));
  assert.equal(leaked, false, "nada com a chave da sala sai para o intruso");
  assert.ok(w.env.events.some(([me, id, s]) => me === w.anaKey.routeId && id === w.gmKey.routeId && s === "auth_failed"));
  [gm, evil, ana].forEach((e) => e.tr.close());
});

test("c) intruso sem prova que manda SNAPSHOT_FILTERED: nada chega à mesa do jogador", async () => {
  const w = await world();
  const evil = endpoint(w.env, { ...w.evilKey, routeId: w.gmKey.routeId });
  const ana = endpoint(w.env, w.anaKey, { initiate: true, auth: { keypair: w.anaKey } });
  ana.tr.send(w.gmKey.routeId, { type: "HELLO_SYNC" });
  await waitUntil(() => evil.tr.stats().links === 1);
  evil.tr.send(w.anaKey.routeId, { type: "SNAPSHOT_FILTERED", snapshot: { falso: true } });
  await waitUntil(() => w.env.rtc.log.sent.some((t) => t.includes("SNAPSHOT_FILTERED")));
  await drain();
  assert.deepEqual(ana.got, []);
  [evil, ana].forEach((e) => e.tr.close());
});

test("d) prova válida de outro elo (impressões de outro par) é recusada e nada mais entra", async () => {
  const w = await world();
  const gm = endpoint(w.env, w.gmKey, { auth: { keypair: w.gmKey } });
  const bob = endpoint(w.env, w.bobKey, { initiate: true, auth: { keypair: w.bobKey } });
  bob.tr.send(w.gmKey.routeId, { type: "HELLO_SYNC" });
  await waitUntil(() => gm.got.some((m) => m.type === "HELLO_SYNC"));
  const frame = w.env.rtc.log.sent.map((t) => JSON.parse(t)).find((m) => m.kind === "VTT_AUTH" && m.pub?.x === w.gmKey.publicJwk.x);
  const evil = endpoint(w.env, { ...w.evilKey, routeId: w.gmKey.routeId });
  const ana = endpoint(w.env, w.anaKey, { initiate: true, auth: { keypair: w.anaKey } });
  ana.tr.send(w.gmKey.routeId, { type: "HELLO_SYNC" });
  await waitUntil(() => evil.tr.stats().links === 1);
  evil.tr.send(w.anaKey.routeId, { kind: "VTT_AUTH", v: 1, pub: frame?.pub, sig: frame?.sig });
  evil.tr.send(w.anaKey.routeId, { type: "SNAPSHOT_FILTERED", snapshot: { falso: true } });
  await anaSawFailure(w);
  await drain();
  assert.equal(ana.got.some((m) => m.type === "SNAPSHOT_FILTERED"), false);
  assert.ok(frame, "o Mestre mandou a prova dele ao Bob (a prova reaproveitada é genuína)");
  [gm, bob, evil, ana].forEach((e) => e.tr.close());
});

test("texto leigo: o jogador é avisado quando não dá para confirmar o Mestre", async () => {
  const { summarizeConnection, connectionText } = await import("../client/js/dungeon/vtt-rede-escolha.js");
  const parts = { signaling: "open", links: { gm: "closed" }, initiate: true, authFailed: true };
  assert.equal(summarizeConnection(parts), "auth_failed");
  assert.equal(summarizeConnection({ ...parts, initiate: false }), "open", "o Mestre não perde o estado por causa de um intruso");
  assert.match(connectionText({ transport: "rede", status: "auth_failed" }), /confirmar que este é o Mestre/);
});
