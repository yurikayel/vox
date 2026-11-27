/**
 * @file Cobertura T6: aviso "adicionou você aos contatos" (`app/contact-notify-flow.js`): envio, recepção com
 * conferência de remetente, limite de alertas e lista de avisos pendentes, com dependências injetadas.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { waitUntil } from "./helpers/wait-until.js";

const flow = await import("../client/js/app/contact-notify-flow.js");
const notify = await import("../client/js/contact-notify.js");
const contacts = await import("../client/js/contacts.js");
const { WELCOME_ROUTE_ID } = await import("../client/js/vox-welcome-profile.js");

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function sendDeps(overrides = {}) {
  const sent = [];
  return {
    sent,
    getMe: () => "vx_eu",
    getSenderMeta: () => ({ displayName: "Yuri", avatarUrl: "https://ex/y.png" }),
    getDmPub: async () => ({ kty: "EC" }),
    sign: async (body) => ({ ...body, author: "vx_eu", pubKey: {}, sig: "s" }),
    seal: async (_pub, text, meta) => ({ text, meta }),
    dispatch: async (to, env) => { sent.push({ to, env }); return "delivered"; },
    ...overrides,
  };
}

test("envio: pula vazio, sistema e a si mesmo; sem chave devolve no-key; com chave entrega assinado", async () => {
  assert.equal(await flow.notifyContactAdded("  "), "skipped");
  assert.equal(await flow.notifyContactAdded(WELCOME_ROUTE_ID), "skipped");
  assert.equal(await flow.notifyContactAdded("vx_eu", sendDeps()), "skipped");
  assert.equal(await flow.notifyContactAdded("vx_ana", sendDeps({ getMe: async () => { throw new Error("sem conta"); } })), "skipped");
  const semChave = sendDeps({ getDmPub: async () => null });
  assert.equal(await flow.notifyContactAdded("vx_ana", semChave), "no-key");
  assert.equal(semChave.sent.length, 0);
  const ok = sendDeps();
  assert.equal(await flow.notifyContactAdded(" vx_ana ", ok), "delivered");
  assert.equal(ok.sent[0].to, "vx_ana");
  assert.deepEqual(ok.sent[0].env.meta, { from: "vx_eu", to: "vx_ana" });
  const wire = notify.parseContactAddedDm(ok.sent[0].env.text);
  assert.deepEqual([wire.to, wire.displayName, wire.author], ["vx_ana", "Yuri", "vx_eu"]);
});

test("adicionar contato: só o contato novo dispara aviso; repetido ou vazio não", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  assert.equal(flow.addContactAndNotify("   "), false);
  const first = sendDeps();
  assert.equal(flow.addContactAndNotify("vx_bia", "Bia", first), true);
  await waitUntil(()=> first.sent.length === 1);
  assert.equal(first.sent.length, 1);
  assert.equal(contacts.hasContact("vx_bia"), true);
  const again = sendDeps();
  assert.equal(flow.addContactAndNotify("vx_bia", "Bia", again), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(again.sent.length, 0, "já era contato");
});

function recvDeps(overrides = {}) {
  const alerts = [];
  return {
    alerts,
    storage: memStorage(),
    verify: async () => true,
    getSelves: async () => ["", "vx_eu"],
    resolveLabel: (entry) => entry.name || "alguém",
    alertUser: (entry, label) => alerts.push([entry.routeId, label]),
    now: () => 5000,
    ...overrides,
  };
}
const dm = (extra = {}) => notify.serializeContactAddedDm({
  ...notify.buildContactAddedPayload({ to: "vx_eu", displayName: "Ana", now: 1000 }), author: "vx_ana", pubKey: {}, sig: "s", ...extra,
});

test("recepção: texto comum não é aviso; remetente do envelope diferente do autor é descartado", async () => {
  const d = recvDeps();
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_ana" }, "oi", d), false);
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_outro" }, dm(), d), true);
  assert.equal(notify.listIncomingContactNotices(d.storage).length, 0);
  assert.equal(d.alerts.length, 0);
});

test("recepção: destino que não sou eu, autoenvio e assinatura inválida são consumidos sem registrar", async () => {
  const d = recvDeps();
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_ana" }, dm({ to: "vx_terceiro" }), d), true);
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_eu" }, dm({ author: "vx_eu" }), d), true);
  const falsa = recvDeps({ verify: async () => false });
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_ana" }, dm(), falsa), true);
  const quebrada = recvDeps({ verify: async () => { throw new Error("x"); } });
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_ana" }, dm(), quebrada), true);
  for (const x of [d, falsa, quebrada]) assert.equal(notify.listIncomingContactNotices(x.storage).length, 0);
});

test("recepção válida: registra, alerta com o nome; repetido não alerta; passado o limite só avisa a lista", async () => {
  const d = recvDeps();
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_ana" }, dm(), d), true);
  assert.deepEqual(d.alerts, [["vx_ana", "Ana"]]);
  assert.equal(notify.listIncomingContactNotices(d.storage).length, 1);
  await flow.receiveContactAddedDm({ from: "vx_ana" }, dm(), d);
  assert.equal(d.alerts.length, 1, "o mesmo aviso não alerta duas vezes");
  for (const who of ["vx_b", "vx_c", "vx_d"]) await flow.receiveContactAddedDm({ from: who }, dm({ author: who, ts: 2000 }), d);
  assert.equal(d.alerts.length, 3, "no máximo 3 alertas por hora");
  assert.equal(notify.listIncomingContactNotices(d.storage).length, 4, "os demais entram só na lista");
});

test("pendentes: some da lista quando a pessoa passa a ser contato", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  const d = recvDeps({ storage: localStorage });
  await flow.receiveContactAddedDm({ from: "vx_ana" }, dm(), d);
  assert.deepEqual(flow.listPendingAddedYouNotices().map((n) => n.routeId), ["vx_ana"]);
  contacts.addContact("vx_ana", "Ana");
  assert.deepEqual(flow.listPendingAddedYouNotices(), []);
});

const account = await import("../client/js/identity/index.js");
const { canonicalString } = await import("../client/js/sig-format.js");
const { bytesToB64Url, computeRouteId } = await import("../client/js/signed-verify.js");

async function signedFromStranger(to) {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const pubKey = { kty, crv, x, y };
  const body = { ...notify.buildContactAddedPayload({ to, displayName: "Estranha" }), author: await computeRouteId(pubKey), pubKey };
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(canonicalString(body)));
  return { ...body, sig: bytesToB64Url(sig) };
}

test("dependências reais: sem rede nem chave o envio dá no-key; aviso assinado de verdade alerta e dispara o evento", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal(await flow.notifyContactAdded("vx_sem_chave_zzz"), "no-key");
  const me = await account.getRouteId();
  const events = [];
  globalThis.document = { dispatchEvent: (ev) => events.push(ev.type) };
  const signed = await signedFromStranger(me);
  localStorage.removeItem(notify.ADDED_BY_STORAGE_KEY);
  assert.equal(await flow.receiveContactAddedDm({ from: signed.author }, notify.serializeContactAddedDm(signed)), true);
  assert.deepEqual(events, ["vox:contact-added-received"]);
  assert.deepEqual(flow.listPendingAddedYouNotices().map((n) => [n.routeId, n.name]), [[signed.author, "Estranha"]]);
  const forged = { ...signed, displayName: "Outra" };
  localStorage.removeItem(notify.ADDED_BY_STORAGE_KEY);
  await flow.receiveContactAddedDm({ from: signed.author }, notify.serializeContactAddedDm(forged));
  assert.deepEqual(flow.listPendingAddedYouNotices(), [], "assinatura que não confere não registra");
  delete globalThis.document;
});
