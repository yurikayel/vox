/**
 * Guardiões, parte 3b (spec dos guardiões v0 §4–§6, §12): dividir e mandar, guardar em caixa preta, recibos que
 * fazem a saída valer com M, revogação por divisão nova, parar de guardar e recusas (assinatura, remetente,
 * laço, limites). Dona e guardiões são contas reais neste mesmo navegador; cada guardião tem a própria guarda.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as guardians from "../client/js/guardians.js";
import * as flow from "../client/js/app/guardians-flow.js";
import * as localAccount from "../client/js/local-account.js";
import * as keyLock from "../client/js/key-lock.js";
import * as keystore from "../client/js/keystore.js";
import { getAccountExits } from "../client/js/account-exit.js";
import { openRecoverySecret } from "../client/js/account-phrase.js";
import { combineShares } from "../client/js/shamir-gf256.js";
import { identityFromSeed } from "../client/js/recovery-phrase.js";
import { parseRoute } from "../client/js/app/route-parse.js";
import * as screen from "../client/js/render/guardians.js";

const fromB64url = (s) => Uint8Array.from(Buffer.from(s, "base64url"));
const heldByDevice = new Map();

/** Troca a guarda de pedaços para a do aparelho `who` enquanto `fn` roda. */
async function onDevice(who, fn) {
  const saved = localStorage.getItem(guardians.HELD_STORAGE);
  if (heldByDevice.has(who)) localStorage.setItem(guardians.HELD_STORAGE, heldByDevice.get(who));
  else localStorage.removeItem(guardians.HELD_STORAGE);
  try {
    return await fn();
  } finally {
    heldByDevice.set(who, localStorage.getItem(guardians.HELD_STORAGE) || "{}");
    if (saved == null) localStorage.removeItem(guardians.HELD_STORAGE);
    else localStorage.setItem(guardians.HELD_STORAGE, saved);
  }
}

function makeDeps(me, outbox, overrides = {}) {
  return {
    getMe: () => me,
    getOwnerName: () => "Ana",
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: async (_pub, text, meta) => ({ ...meta, text }),
    dispatch: async (to, env) => {
      outbox.push(env);
      return "delivered";
    },
    openSecret: (pass) => openRecoverySecret(pass),
    follows: () => true,
    addedMe: () => true,
    alert: () => {},
    ...overrides,
  };
}

async function setup(count = 3) {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  heldByDevice.clear();
  keyLock.__resetKeyLockForTests();
  const owner = (await localAccount.ensureLocalAccount()).routeId;
  const ids = [];
  for (let i = 0; i < count; i++) ids.push((await localAccount.createAdditionalAccount({ displayName: `G${i}` })).routeId);
  await localAccount.switchActiveAccount(owner);
  return { owner, ids };
}

/** Entrega no aparelho de cada guardião as mensagens para ele; devolve o que eles mandaram de volta. */
async function deliverToGuardians(owner, messages, overrides = {}) {
  const replies = [];
  for (const env of messages) {
    await localAccount.switchActiveAccount(env.to);
    await onDevice(env.to, () => flow.receiveGuardianDm({ from: env.from }, env.text, makeDeps(env.to, replies, overrides)));
  }
  await localAccount.switchActiveAccount(owner);
  return replies;
}

async function deliverToOwner(owner, replies) {
  for (const env of replies) await flow.receiveGuardianDm({ from: env.from }, env.text, makeDeps(owner, []));
}

test("guardiões - corpo, envelope e forma do pedaço", () => {
  const secret = crypto.getRandomValues(new Uint8Array(16));
  const split = guardians.buildShareBodies({ secret, kind: "semente", guardians: ["vx_a", "vx_b", "vx_c"], m: 2 });
  assert.equal(split.bodies.length, 3);
  assert.ok(split.bodies.every((b) => guardians.isWellFormedShare(b.body)));
  const ys = split.bodies.slice(1).map((b) => ({ splitId: split.splitId, x: b.x, y: fromB64url(b.body.y) }));
  assert.deepEqual(combineShares(ys, 2), secret);
  const signed = { ...split.bodies[0].body, author: "vx_dona", sig: "s", pubKey: {} };
  assert.deepEqual(guardians.parseGuardianDm(guardians.serializeGuardianDm(signed)), signed);
  assert.equal(guardians.parseGuardianDm('{"__vox_dm_v2":1,"kind":"contact_added","payload":{}}'), null);
  assert.equal(guardians.isWellFormedShare({ ...split.bodies[0].body, m: 1 }), false);
  assert.equal(guardians.isWellFormedShare({ ...split.bodies[0].body, kind: "chave" }), false, "16 bytes não é chave");
  assert.throws(() => guardians.buildShareBodies({ secret, kind: "semente", guardians: ["vx_a", "vx_a", "vx_b"], m: 2 }), /repetido/);
});

test("guardiões - 2 de 3: guardam, recibos fazem a saída valer no mínimo, e os pedaços devolvem a conta", async () => {
  const { owner, ids } = await setup(3);
  const sent = [];
  const res = await flow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, sent));
  assert.equal(res.ok, true);
  assert.equal(sent.length, 3);
  const whole = Buffer.from((await openRecoverySecret()).secret).toString("base64url");
  assert.ok(sent.every((env) => !env.text.includes(whole)), "o segredo inteiro não sai em mensagem nenhuma");
  const replies = await deliverToGuardians(owner, sent);
  assert.equal(replies.length, 3, "cada guardião manda recibo");
  await deliverToOwner(owner, replies.slice(0, 1));
  assert.deepEqual(guardians.countConfirmed(owner), { confirmed: 1, m: 2, n: 3 });
  assert.equal(getAccountExits(owner).guardioes, undefined);
  await deliverToOwner(owner, replies.slice(1));
  assert.ok(getAccountExits(owner).guardioes > 0);
  const opened = [];
  for (const id of ids.slice(0, 2)) opened.push(await onDevice(id, () => guardians.openHeldShare(owner)));
  const secret = combineShares(opened.map((p) => ({ splitId: p.splitId, x: p.x, y: fromB64url(p.y) })), 2);
  const back = await identityFromSeed(secret);
  assert.equal(await localAccount.computeRouteId(back.signing.publicJwk), owner);
});

test("guardiões - recusa remetente trocado, assinatura adulterada, quem o guardião não segue e recibo de estranho", async () => {
  const { owner, ids } = await setup(3);
  const sent = [];
  await flow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, sent));
  const [first, second, third] = sent;
  assert.deepEqual(await deliverToGuardians(owner, [{ ...first, from: ids[1] }]), [], "envelope de outra pessoa");
  const tampered = { ...second, text: second.text.replace(/"y":"(.)/, (_m, c) => `"y":"${c === "A" ? "B" : "A"}`) };
  assert.deepEqual(await deliverToGuardians(owner, [tampered]), [], "assinatura não confere");
  assert.deepEqual(await deliverToGuardians(owner, [third], { follows: () => false }), [], "guardião não segue a dona");
  assert.deepEqual(await onDevice(ids[2], () => guardians.listHeld()), []);
  const replies = await deliverToGuardians(owner, [first]);
  await deliverToOwner(owner, replies.map((env) => ({ ...env, from: ids[2] })));
  assert.equal(guardians.countConfirmed(owner).confirmed, 0, "recibo com remetente trocado não conta");
});

test("guardiões - só laço mútuo e com chave de DM", async () => {
  const { owner, ids } = await setup(3);
  const notMutual = await flow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, [], { addedMe: (id) => id !== ids[0] }));
  assert.deepEqual(notMutual, { ok: false, reason: "not-mutual" });
  const noKey = await flow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, [], { getDmPub: async (id) => (id === ids[1] ? null : { kty: "EC" }) }));
  assert.deepEqual(noKey, { ok: false, reason: "no-key", missing: [ids[1]] });
  assert.equal(guardians.getOwnerSplit(owner), null);
  assert.deepEqual(await flow.filterMutualTies([...ids, owner, ids[0]], makeDeps(owner, [])), ids);
});

test("guardiões - divisão nova revoga a antiga; recibo antigo não conta mais", async () => {
  const { owner, ids } = await setup(3);
  const first = [];
  await flow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, first));
  const oldReplies = await deliverToGuardians(owner, first);
  await deliverToOwner(owner, oldReplies);
  assert.ok(getAccountExits(owner).guardioes > 0);
  const second = [];
  const res = await flow.sendGuardianShares({ guardians: ids.slice(0, 3), m: 3 }, makeDeps(owner, second));
  assert.equal(getAccountExits(owner).guardioes, undefined, "divisão nova começa sem saída");
  const revokes = second.filter((env) => env.text.includes(guardians.REVOKE_TYPE));
  assert.equal(revokes.length, 3);
  await deliverToOwner(owner, oldReplies);
  assert.equal(guardians.countConfirmed(owner).confirmed, 0);
  await deliverToGuardians(owner, revokes.slice(0, 1));
  const held = await onDevice(ids[0], () => guardians.listHeld());
  assert.deepEqual(held, [], "a revogação apaga o pedaço da divisão antiga");
  assert.notEqual(res.splitId, guardians.parseGuardianDm(first[0].text).splitId);
});

test("guardiões - parar de guardar avisa a dona e derruba a saída abaixo do mínimo", async () => {
  const { owner, ids } = await setup(3);
  const sent = [];
  await flow.sendGuardianShares({ guardians: ids, m: 3 }, makeDeps(owner, sent));
  await deliverToOwner(owner, await deliverToGuardians(owner, sent));
  assert.ok(getAccountExits(owner).guardioes > 0);
  const released = [];
  await localAccount.switchActiveAccount(ids[1]);
  const stopped = await onDevice(ids[1], () => flow.stopGuarding(owner, makeDeps(ids[1], released)));
  await localAccount.switchActiveAccount(owner);
  assert.equal(stopped, true);
  await deliverToOwner(owner, released);
  assert.deepEqual(guardians.countConfirmed(owner), { confirmed: 2, m: 3, n: 3 });
  assert.equal(getAccountExits(owner).guardioes, undefined);
});

test("guardiões - limites da guarda: nunca a própria conta, no máximo 20 donas, e a limpeza local leva junto", async () => {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  const share = (author) => ({ type: guardians.SHARE_TYPE, author, ownerName: author, splitId: `s_${author}`, x: 1 });
  assert.equal(await guardians.storeHeldShare(share("vx_eu"), "vx_eu"), false);
  for (let i = 0; i < guardians.MAX_HELD; i++) assert.equal(await guardians.storeHeldShare(share(`vx_${i}`), "vx_eu"), true);
  assert.equal(await guardians.storeHeldShare(share("vx_extra"), "vx_eu"), false);
  assert.equal(await guardians.storeHeldShare({ ...share("vx_3"), splitId: "s_nova" }, "vx_eu"), true, "divisão nova da mesma dona substitui");
  assert.equal(guardians.dropHeldShare("vx_3", "s_vx_3"), null, "revogar a divisão antiga não apaga a nova");
  assert.equal(guardians.listHeld().length, guardians.MAX_HELD);
  await localAccount.wipeLocalAccount();
  assert.equal(localStorage.getItem(guardians.HELD_STORAGE), null);
});

test("guardiões - sem chave do aparelho o pedaço é recusado, nunca fica em claro; o mapa da dona não leva pedaço", async () => {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  const share = { type: guardians.SHARE_TYPE, author: "vx_dona", ownerName: "Dona", splitId: "s_1", x: 1, y: "SEGREDO" };
  const saved = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  keystore.__resetKeystoreForTests();
  try {
    assert.equal(await guardians.storeHeldShare(share, "vx_eu"), false);
    assert.equal(localStorage.getItem(guardians.HELD_STORAGE), null);
  } finally {
    globalThis.indexedDB = saved;
    keystore.__resetKeystoreForTests();
  }
  assert.equal(await guardians.storeHeldShare(share, "vx_eu"), true);
  assert.equal(localStorage.getItem(guardians.HELD_STORAGE).includes("SEGREDO"), false, "guardado cifrado");
  const split = guardians.buildShareBodies({ secret: new Uint8Array(32).fill(7), kind: "chave", guardians: ["vx_a", "vx_b", "vx_c"], m: 2 });
  assert.deepEqual(split.bodies.map((b) => [b.to, b.x, b.body.splitId]), [["vx_a", 1, split.splitId], ["vx_b", 2, split.splitId], ["vx_c", 3, split.splitId]]);
  guardians.recordOwnerSplit("vx_dona", split);
  const map = guardians.getOwnerSplit("vx_dona");
  assert.deepEqual([map.splitId, map.m, map.n, map.guardians.map((g) => [g.routeId, g.x])], [split.splitId, 2, 3, [["vx_a", 1], ["vx_b", 2], ["vx_c", 3]]]);
  assert.equal(JSON.stringify(map).includes(split.bodies[0].body.y), false, "mapa sem pedaço");
});

test("tela dos guardiões - rota, candidatos, efeito de M e N, estado e lista de quem guarda", () => {
  const loc = { hash: "#/guardioes", search: "" };
  const prev = [globalThis.window, globalThis.location];
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    assert.deepEqual(parseRoute(), { name: "guardians" });
  } finally {
    [globalThis.window, globalThis.location] = prev;
  }
  assert.match(screen.renderGuardianChooserHtml({ candidates: [], m: 3, needsPassphrase: false }), /também adicionaram você/);
  const html = screen.renderGuardianChooserHtml({ candidates: [{ routeId: "vx_a", name: "<Bia>" }], m: 3, needsPassphrase: true });
  assert.match(html, /&lt;Bia&gt;/);
  assert.match(html, /id="guardian-pass"/);
  assert.match(html, /<option value="3" selected>/);
  assert.match(screen.describeThreshold(3, 5), /3 de 5: .*2 sozinhas não conseguem/);
  assert.match(screen.describeThreshold(2, 3), /2 de 3: .*1 sozinha não consegue./);
  assert.match(screen.describeThreshold(3, 2), /pelo menos 3/);
  assert.match(screen.renderGuardianStatusHtml({ confirmed: 2, m: 3, n: 5, names: ["A"] }), /quando 3 confirmarem/);
  assert.match(screen.renderGuardianStatusHtml({ confirmed: 3, m: 3, n: 5, names: ["A"] }), /tem saída pelos guardiões/);
  assert.match(screen.renderHeldListHtml([{ owner: "vx_a", name: "Ana" }]), /data-stop-guarding="vx_a"/);
});
