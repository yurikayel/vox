/**
 * @file LT-10 — criação/volta por malha (setup multi-aparelho) e guardiões (Shamir). Ver `login-roundtrip-harness.js`.
 */
import assert from "node:assert/strict";
import * as localAccount from "../client/js/identity/local-account.js";
import * as accountPhrase from "../client/js/identity/account-phrase.js";
import * as vaultCrypto from "../client/js/vault/vault-crypto.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as meshFlow from "../client/js/app/mesh-vault-flow.js";
import { savePassphraseVault } from "../client/js/vault/passphrase-vault.js";
import * as guardians from "../client/js/identity/guardians.js";
import * as sendFlow from "../client/js/app/guardians-flow.js";
import * as gFlow from "../client/js/app/guardian-return-flow.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as keystore from "../client/js/identity/keystore.js";

const DEVICE_KEYS = [mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.NOTICES_STORAGE, mesh.PENDING_STORAGE];

/**
 * Malha + guardiões: criadores extras e retorno `guardians_two`.
 * @param {object} creators Mapa de criadores LT-10
 * @param {{ wipeAll: () => Promise<void>, ensureSessionStorage: () => void, PASS: string, EMAIL: string }} ctx
 * @returns {object} Mesmo mapa, estendido
 */
export function extendMeshGuardCreators(creators, ctx) {
  creators.vault_mesh = async () => {
    await ctx.wipeAll();
    const w = { now: Date.now(), relay: new Map(), dms: [], storage: new Map(), mutual: new Set(), guardians: [], pool: [] };
    const owner = (await localAccount.ensureLocalAccount()).routeId;
    const holders = [];
    for (let i = 0; i < 2; i++) {
      holders.push((await localAccount.createAdditionalAccount({ displayName: `H${i}` })).routeId);
      w.mutual.add(holders[i]);
    }
    w.mutual.add(owner);
    w.pool = [...holders];
    await switchMeshDevice(w, owner, async () => {
      assert.equal((await savePassphraseVault(ctx.PASS, ctx.EMAIL)).ok, true);
      assert.equal((await meshFlow.shareMyVault(meshDeps(w, owner))).length, 2);
    });
    await meshDeliver(w);
    const encoded = await switchMeshDevice(w, owner, async () => {
      const addr = await vaultCrypto.deriveVaultAddress(ctx.PASS, ctx.EMAIL);
      return vaultCrypto.encodeVaultBundleForUrl(JSON.parse(localStorage.getItem(`vox-vault-v2:${addr}`)));
    });
    return { w, owner, holders, email: ctx.EMAIL, encoded };
  };
  creators.guardians = async () => {
    await ctx.wipeAll();
    ctx.ensureSessionStorage();
    sessionStorage.clear();
    const owner = (await localAccount.ensureLocalAccount()).routeId;
    const ids = [];
    const sent = [];
    for (let i = 0; i < 3; i++) ids.push((await localAccount.createAdditionalAccount({ displayName: `G${i}` })).routeId);
    await localAccount.switchActiveAccount(owner);
    await sendFlow.sendGuardianShares({ guardians: ids, m: 2 }, guardianSendDeps(owner, sent));
    for (const env of sent) {
      await localAccount.switchActiveAccount(env.to);
      await onGuardianDevice(env.to, () => sendFlow.receiveGuardianDm({ from: env.from }, env.text, guardianSendDeps(env.to, [])));
    }
    await localAccount.switchActiveAccount(owner);
    return { owner, ids };
  };
  return creators;
}

/** @param {object} returns Mapa de voltas LT-10 */
export function guardiansTwoReturn(returns) {
  returns.guardians_two = async (art) => {
    const { owner, ids } = art;
    const device = (await localAccount.createAdditionalAccount({ displayName: "Volta" })).routeId;
    await localAccount.switchActiveAccount(device);
    const req = await gFlow.startRecovery(owner);
    assert.equal(req.ok, true);
    const pushed = [];
    const q = new URLSearchParams(req.link.split("?")[1]);
    const first = await guardianGiveBack(ids[0], q, pushed);
    await guardianGiveBack(ids[1], q, pushed);
    await localAccount.switchActiveAccount(device);
    assert.deepEqual(await gFlow.addPastedReply(first.pasteText), { ok: true });
    assert.equal(await gFlow.collectRelayReplies({ ...(await guardianFlowDeps()), pull: async () => [pushed[1].env] }), 1);
    const done = await gFlow.finishRecovery();
    assert.equal(done.ok, true);
    assert.equal(await localAccount.getRouteId(), owner);
    return owner;
  };
  return returns;
}

/** Troca de aparelho na malha de teste; exportado para captura de assinatura. */
export async function switchMeshDevice(w, who, fn) {
  await localAccount.switchActiveAccount(who);
  const mine = w.storage.get(who) || {};
  for (const k of DEVICE_KEYS) {
    if (mine[k] == null) localStorage.removeItem(k);
    else localStorage.setItem(k, mine[k]);
  }
  try {
    return await fn();
  } finally {
    w.storage.set(who, Object.fromEntries(DEVICE_KEYS.map((k) => [k, localStorage.getItem(k)])));
  }
}

function meshDeps(w, me) {
  return {
    getMe: () => me,
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: (_pub, text, meta) => ({ ...meta, text }),
    open: (env, priv) => cryptoDm.open(env, priv),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    sealKey: (v) => keystore.sealJsonStrict(v),
    openKey: (v) => keystore.openSealed(v),
    dispatch: async (to, env) => w.dms.push({ to, env }),
    push: async (addr, env) => w.relay.set(addr, [...(w.relay.get(addr) || []), env]),
    pull: async (addr) => [...(w.relay.get(addr) || [])],
    guardiansOf: () => w.guardians,
    pool: () => w.pool,
    mutual: async (ids) => ids.filter((id) => w.mutual.has(id)),
    alert: () => {},
    now: () => w.now,
  };
}

async function meshDeliver(w) {
  const queue = w.dms.splice(0);
  for (const { to, env } of queue) {
    await switchMeshDevice(w, to, () => meshFlow.receiveMeshDm({ from: env.from }, env.text, meshDeps(w, to)));
  }
  return queue.length;
}

const heldByDevice = new Map();
async function onGuardianDevice(who, fn) {
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

function guardianSendDeps(me, outbox) {
  return {
    getMe: () => me,
    getOwnerName: () => "Ana",
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (s) => localAccount.verifyPayload(s),
    seal: async (_pub, text, meta) => ({ ...meta, text }),
    dispatch: async (_to, env) => {
      outbox.push(env);
      return "delivered";
    },
    openSecret: (pass) => accountPhrase.openRecoverySecret(pass),
    follows: () => true,
    addedMe: () => true,
    alert: () => {},
  };
}

function guardianReturnDeps(me, pushed) {
  return {
    getMe: () => me,
    openHeld: (owner) => onGuardianDevice(me, () => guardians.openHeldShare(owner)),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    push: async (addr, env) => {
      pushed.push({ addr, env });
    },
    now: () => Date.now(),
  };
}

async function guardianGiveBack(guardian, q, pushed) {
  await localAccount.switchActiveAccount(guardian);
  const prep = await gFlow.prepareGuardianReturn(q, guardianReturnDeps(guardian, pushed));
  assert.equal(prep.ok, true);
  return gFlow.sendGuardianReturn(prep.request, { confirmed: true }, guardianReturnDeps(guardian, pushed));
}

async function guardianFlowDeps() {
  const [inbox, phrase] = [await import("../client/js/inbox.js"), await import("../client/js/identity/account-phrase.js")];
  return {
    getMe: () => localAccount.getRouteId(),
    openHeld: (o) => guardians.openHeldShare(o),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    seal: (p, t, m) => cryptoDm.seal(p, t, m),
    open: (e, k) => cryptoDm.open(e, k),
    sealKey: (v) => keystore.sealJsonStrict(v),
    openKey: (v) => keystore.openSealed(v),
    push: (a, e) => inbox.pushSealed(a, e),
    pull: (a) => inbox.pullMine(a),
    verify: (s) => localAccount.verifyPayload(s),
    restore: (j, o) => phrase.restoreFromSecret(j, o),
    now: () => Date.now(),
  };
}