/**
 * PR #214 — segue achados LT-04 do PR #208: JSON no storage que não é mapa plano não derruba malha nem conta.
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
const BAD_HELD_ENTRIES = ['{"vx_x":42}', '{"vx_x":null}', '{"vx_x":[1]}'];

test.afterEach(() => {
  localStorage.clear();
});

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

test("holderTick — HELD_STORAGE com JSON que não é objeto (top-level)", async (t) => {
  await localAccount.ensureLocalAccount();
  const me = await localAccount.getRouteId();
  const deps = flowDeps(me);
  for (const raw of NON_OBJECT_JSON) {
    await t.test(`top-level ${raw}`, async () => {
      localStorage.setItem(mesh.HELD_STORAGE, raw);
      await assert.doesNotReject(async () => {
        const r = await flow.holderTick(deps);
        assert.equal(r.released, 0);
      }, `holderTick não deve lançar com top-level ${raw}`);
      assert.deepEqual(mesh.loadHeld(), {}, `loadHeld vazio com top-level ${raw}`);
    });
  }
});

test("holderTick — entrada em HELD_STORAGE que não é objeto", async (t) => {
  await localAccount.ensureLocalAccount();
  const me = await localAccount.getRouteId();
  const deps = flowDeps(me);
  for (const raw of BAD_HELD_ENTRIES) {
    await t.test(`entrada ${raw}`, async () => {
      localStorage.setItem(mesh.HELD_STORAGE, raw);
      await assert.doesNotReject(async () => {
        const r = await flow.holderTick(deps);
        assert.equal(r.released, 0);
      }, `holderTick não deve lançar com entrada ${raw}`);
      assert.deepEqual(mesh.loadHeld(), {}, `loadHeld ignora entrada inválida ${raw}`);
    });
  }
});

test("ensureLocalAccount — SEED_STORAGE com JSON que não é objeto", async (t) => {
  for (const raw of NON_OBJECT_JSON) {
    await t.test(`seed top-level ${raw}`, async () => {
      localStorage.setItem(identitySeed.SEED_STORAGE, raw);
      let acc;
      await assert.doesNotReject(async () => {
        acc = await localAccount.ensureLocalAccount();
      }, `ensureLocalAccount não deve lançar com SEED ${raw}`);
      assert.ok(acc.routeId?.startsWith("vx_"));
      const stored = JSON.parse(localStorage.getItem(identitySeed.SEED_STORAGE));
      assert.equal(typeof stored, "object");
      assert.ok(stored !== null && !Array.isArray(stored));
      assert.ok(stored[acc.routeId]);
    });
  }
});