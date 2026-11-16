/**
 * Guardiões, parte 3d (spec dos guardiões v0 §8 e §11): trocar guardiões é uma divisão nova que revoga a anterior,
 * e os pedaços antigos não se juntam com os novos; tirar todos manda a revogação a cada guardião e tira a saída.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as guardians from "../client/js/guardians.js";
import * as flow from "../client/js/app/guardians-flow.js";
import * as localAccount from "../client/js/local-account.js";
import { getAccountExits } from "../client/js/account-exit.js";
import { combineShares } from "../client/js/shamir-gf256.js";
import { identityFromSeed } from "../client/js/recovery-phrase.js";
import * as screen from "../client/js/render/guardians.js";
import { deliverToGuardians, deliverToOwner, makeDeps, onDevice, setup } from "./guardians-harness.js";

const asPoint = (p) => ({ splitId: p.splitId, x: p.x, y: Uint8Array.from(Buffer.from(p.y, "base64url")) });
const isRevoke = (env) => env.text.includes(guardians.REVOKE_TYPE);

async function splitAndConfirm(owner, chosen, m) {
  const sent = [];
  const res = await flow.sendGuardianShares({ guardians: chosen, m }, makeDeps(owner, sent));
  const receipts = await deliverToGuardians(owner, sent.filter((env) => !isRevoke(env)));
  await deliverToOwner(owner, receipts);
  return { res, sent, receipts };
}

test("guardiões 3d - trocar um guardião: quem saiu apaga, quem ficou guarda o novo, e o antigo não junta com o novo", async () => {
  const { owner, ids } = await setup(4);
  const first = await splitAndConfirm(owner, ids.slice(0, 3), 2);
  const oldShare = await onDevice(ids[2], () => guardians.openHeldShare(owner));
  const swapped = [ids[0], ids[1], ids[3]];
  const second = await splitAndConfirm(owner, swapped, 2);
  assert.ok(getAccountExits(owner).guardioes > 0, "a divisão nova vale com o mínimo de recibos");
  const revokes = second.sent.filter(isRevoke);
  assert.deepEqual(revokes.map((env) => env.to).sort(), ids.slice(0, 3).sort(), "revoga a anterior para quem a tinha");
  await deliverToGuardians(owner, revokes);
  assert.deepEqual(await onDevice(ids[2], () => guardians.listHeld()), [], "quem saiu apaga o pedaço");
  const kept = await onDevice(ids[0], () => guardians.openHeldShare(owner));
  assert.equal(kept.splitId, second.res.splitId, "a revogação da antiga não apaga o pedaço novo");
  assert.notEqual(kept.splitId, first.res.splitId);
  assert.throws(() => combineShares([asPoint(oldShare), asPoint(kept)], 2), /divisões diferentes/);
  const fresh = await onDevice(ids[3], () => guardians.openHeldShare(owner));
  const back = await identityFromSeed(combineShares([asPoint(kept), asPoint(fresh)], 2));
  assert.equal(await localAccount.computeRouteId(back.signing.publicJwk), owner);
});

test("guardiões 3d - revogação que chega antes do pedaço novo não apaga o novo", async () => {
  const { owner, ids } = await setup(3);
  await splitAndConfirm(owner, ids, 2);
  const sent = [];
  const res = await flow.sendGuardianShares({ guardians: ids, m: 3 }, makeDeps(owner, sent));
  const late = [...sent.filter(isRevoke), ...sent.filter((env) => !isRevoke(env))];
  await deliverToGuardians(owner, late);
  const held = await onDevice(ids[1], () => guardians.listHeld());
  assert.deepEqual(held.map((h) => h.splitId), [res.splitId]);
});

test("guardiões 3d - tirar todos: revoga para cada um, esquece a divisão e tira a saída", async () => {
  const { owner, ids } = await setup(3);
  const { receipts } = await splitAndConfirm(owner, ids, 2);
  assert.ok(getAccountExits(owner).guardioes > 0);
  const out = [];
  assert.equal(await flow.removeAllGuardians(makeDeps(owner, out)), true);
  assert.equal(guardians.getOwnerSplit(owner), null);
  assert.equal(getAccountExits(owner).guardioes, undefined, "remover tudo tira a saída");
  assert.equal(out.length, 3);
  assert.ok(out.every(isRevoke));
  await deliverToGuardians(owner, out);
  for (const id of ids) assert.deepEqual(await onDevice(id, () => guardians.listHeld()), [], `${id} apagou`);
  await deliverToOwner(owner, receipts);
  assert.equal(getAccountExits(owner).guardioes, undefined, "recibo atrasado não devolve a saída");
  assert.equal(await flow.removeAllGuardians(makeDeps(owner, [])), false, "sem divisão, nada a tirar");
});

test("guardiões 3d - tirar todos com guardião sem chave de DM ainda tira a saída", async () => {
  const { owner, ids } = await setup(3);
  await splitAndConfirm(owner, ids, 2);
  const out = [];
  const offline = makeDeps(owner, out, { getDmPub: async (id) => (id === ids[0] ? null : { kty: "EC" }) });
  assert.equal(await flow.removeAllGuardians(offline), true);
  assert.equal(out.length, 2, "manda para quem dá");
  assert.equal(getAccountExits(owner).guardioes, undefined);
});

test("guardiões 3d - a tela oferece trocar e tirar todos quando há divisão", () => {
  const status = screen.renderGuardianStatusHtml({ confirmed: 2, m: 2, n: 3, names: ["A", "B", "C"] });
  assert.match(status, /id="btn-guardians-remove"/);
  assert.match(status, /não se juntam com os novos/);
  const candidates = [{ routeId: "vx_a", name: "A" }];
  assert.match(screen.renderGuardianChooserHtml({ candidates, m: 2, needsPassphrase: false, hasSplit: true }), /Trocar: dividir de novo/);
  assert.match(screen.renderGuardianChooserHtml({ candidates, m: 3, needsPassphrase: false }), />Dividir e enviar</);
  assert.equal(screen.renderGuardianStatusHtml(null), "");
});
