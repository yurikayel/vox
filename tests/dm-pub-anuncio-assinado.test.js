/**
 * @file Anúncio da chave de DM só vale com a prova da conta: sem prova, prova de outra rota,
 * de outro par ou de outra chave não registram nada; o envio das partes de guardião recusa.
 */
import "./setup.js";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import * as msg from "../client/js/webrtc-messaging.js";
import * as state from "../client/js/webrtc-peer-state.js";
import * as flow from "../client/js/app/guardians-flow.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { makeDeps, setup } from "./guardians-harness.js";

const KEY = Object.freeze({ kty: "EC", crv: "P-256", x: "xAAA", y: "yBBB" });

afterEach(() => {
  state.addressToPeer.clear();
  state.dmPubByAddress.clear();
  msg.onPeerIdentity(null);
});

/**
 * Assina, como a conta ativa, o anúncio da chave neste par.
 * @param {string} peerId Par que anuncia.
 * @param {object} [key=KEY] Chave assinada.
 * @param {number} [ts=Date.now()] Marca de tempo da prova.
 * @returns {Promise<object>} Prova assinada.
 */
function proofFor(peerId, key = KEY, ts = Date.now()) {
  return localAccount.signPayload({
    type: "vox-dm-pub-v1", dmKty: key.kty, dmCrv: key.crv, dmX: key.x, dmY: key.y, peerId, ts,
  });
}

test("anúncio sem prova não registra chave nem rota", async () => {
  const { ids } = await setup(1);
  await msg.registerAddressMapping(ids[0], "peer_evil", { ...KEY });
  assert.equal(msg.getPeerDmPub(ids[0]), null);
  assert.equal(state.addressToPeer.has(ids[0]), false);
});

test("prova de outra rota não registra a chave", async () => {
  const { owner, ids } = await setup(1);
  const proof = await proofFor("peer_evil");
  await msg.registerAddressMapping(ids[0], "peer_evil", { ...KEY, proof });
  assert.equal(proof.author, owner);
  assert.equal(msg.getPeerDmPub(ids[0]), null);
});

test("prova da própria rota, do mesmo par e da mesma chave é aceita", async () => {
  const { owner } = await setup(1);
  const proof = await proofFor("peer_ok");
  await msg.registerAddressMapping(owner, "peer_ok", { ...KEY, proof });
  assert.equal(msg.getPeerDmPub(owner)?.x, KEY.x);
  assert.equal(state.addressToPeer.get(owner), "peer_ok");
});

test("prova reaproveitada por outro par ou com outra chave é recusada", async () => {
  const { owner } = await setup(1);
  const proof = await proofFor("peer_ok");
  await msg.registerAddressMapping(owner, "peer_evil", { ...KEY, proof });
  await msg.registerAddressMapping(owner, "peer_ok", { ...KEY, x: "xTROCADA", proof });
  assert.equal(msg.getPeerDmPub(owner), null);
  assert.equal(state.addressToPeer.has(owner), false);
});

test("prova mais velha que a última aceita é recusada", async () => {
  const { owner } = await setup(1);
  const now = Date.now();
  const velha = await proofFor("peer_ok", KEY, now - 5000);
  const nova = await proofFor("peer_ok", { ...KEY, x: "xNOVA" }, now);
  await msg.registerAddressMapping(owner, "peer_ok", { ...KEY, x: "xNOVA", proof: nova });
  await msg.registerAddressMapping(owner, "peer_ok", { ...KEY, proof: velha });
  assert.equal(msg.getPeerDmPub(owner).x, "xNOVA");
});

test("sendGuardianShares com só anúncio falso devolve no-key", async () => {
  const { owner, ids } = await setup(2);
  for (const id of ids) await msg.registerAddressMapping(id, "peer_evil", { ...KEY });
  const sent = [];
  const deps = makeDeps(owner, sent, { getDmPub: async (addr) => msg.getPeerDmPub(addr) });
  const res = await flow.sendGuardianShares({ guardians: ids, m: 2 }, deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "no-key");
  assert.equal(sent.length, 0);
});

test("prova com autor da rota alvo mas chave e assinatura de outra conta não registra", async () => {
  const { ids } = await setup(1);
  const alheia = await proofFor("peer_x");
  const forjada = { ...alheia, author: ids[0] };
  await msg.registerAddressMapping(ids[0], "peer_x", { ...KEY, proof: forjada });
  assert.equal(msg.getPeerDmPub(ids[0]), null);
  assert.equal(state.addressToPeer.has(ids[0]), false);
});

test("prova própria com a chave adulterada depois de assinada não registra", async () => {
  const { owner } = await setup(1);
  const proof = await proofFor("peer_ok");
  const trocada = { ...KEY, x: "xOUTRA", y: "yOUTRA" };
  const adulterada = { ...proof, dmX: trocada.x, dmY: trocada.y };
  await msg.registerAddressMapping(owner, "peer_ok", { ...trocada, proof: adulterada });
  assert.equal(msg.getPeerDmPub(owner), null);
});
