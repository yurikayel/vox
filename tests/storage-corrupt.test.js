/**
 * LT-04 (PR #208): JSON válido no storage que não é objeto plano não derruba malha nem conta.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as flow from "../client/js/app/mesh-vault-flow.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as identitySeed from "../client/js/identity/identity-seed.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as keystore from "../client/js/identity/keystore.js";

const NON_OBJECT_JSON = ["42", "[0.1,0.2]", '"texto"', "true", "null"];

function flowDeps(me) {
  return {
    getMe: () => me,
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    open: (env, priv) => cryptoDm.open(env, priv),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    sealKey: (v) => keystore.sealJsonStrict(v),
    openKey: (v) => keystore.openSealed(v),
    dispatch: async () => {},
    push: async () => {},
    pull: async () => [],
    guardiansOf: () => [],
    pool: () => [],
    mutual: async () => [],
    alert: () => {},
    now: () => Date.now(),
  };
}

test("holderTick — HELD_STORAGE com JSON que não é objeto", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  const me = await localAccount.getRouteId();
  const deps = flowDeps(me);
  for (const raw of NON_OBJECT_JSON) {
    localStorage.setItem(mesh.HELD_STORAGE, raw);
    await assert.doesNotReject(async () => {
      const r = await flow.holderTick(deps);
      assert.equal(r.released, 0);
    });
    assert.deepEqual(mesh.loadHeld(), {});
  }
});

test("ensureLocalAccount — SEED_STORAGE com JSON que não é objeto", async () => {
  for (const raw of NON_OBJECT_JSON) {
    localStorage.clear();
    localStorage.setItem(identitySeed.SEED_STORAGE, raw);
    let acc;
    await assert.doesNotReject(async () => {
      acc = await localAccount.ensureLocalAccount();
    });
    assert.ok(acc.routeId?.startsWith("vx_"));
    const stored = JSON.parse(localStorage.getItem(identitySeed.SEED_STORAGE));
    assert.equal(typeof stored, "object");
    assert.ok(stored !== null && !Array.isArray(stored));
    assert.ok(stored[acc.routeId]);
  }
});