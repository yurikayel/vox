/**
 * LT-02: cofre na malha com relay falso que falha (503, JSON inválido, duplicado, fora de ordem).
 * Só comportamento já oferecido por mesh-vault-flow.js; rede e relógio injetados como em mesh-vault-flow.test.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as flow from "../client/js/app/mesh-vault-flow.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import * as keystore from "../client/js/identity/keystore.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import { restoreFromPassphraseVault, savePassphraseVault } from "../client/js/vault/passphrase-vault.js";

const HOUR = 60 * 60 * 1000;
const EMAIL = "ana@exemplo.com";
const PASS = "minha senha bem longa";
const DEVICE_KEYS = [mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.NOTICES_STORAGE, mesh.PENDING_STORAGE];
const err503 = () => {
  const e = new Error("Service Unavailable");
  e.status = 503;
  throw e;
};

function makeWorld() {
  return { now: Date.now(), relay: new Map(), dms: [], storage: new Map(), mutual: new Set(), guardians: [], pool: [], fault: {} };
}

async function as(w, who, fn) {
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

const isRelayAddr = (to) => /^vxcofr?_/.test(String(to || ""));

function baseDeps(w, me) {
  return {
    getMe: () => me,
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: (pub, text, meta) => (isRelayAddr(meta.to) ? cryptoDm.seal(pub, text, meta) : { ...meta, text }),
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

/** Encapsula push/pull do relay com falhas programáveis (contadores em w.fault). */
function deps(w, me) {
  const base = baseDeps(w, me);
  const f = w.fault;
  return {
    ...base,
    push: async (addr, env) => {
      f.pushN = (f.pushN || 0) + 1;
      if (f.rejectPush?.(addr, f.pushN)) err503();
      return base.push(addr, env);
    },
    pull: async (addr) => {
      f.pullN = (f.pullN || 0) + 1;
      if (f.rejectPull?.(addr, f.pullN)) err503();
      let list = await base.pull(addr);
      if (f.garbage?.(addr)) list = [...f.garbage(addr), ...list];
      if (f.duplicateLast?.(addr) && list.length) list = [...list, list[list.length - 1]];
      if (f.reverse?.(addr) && list.length > 1) list = [...list].reverse();
      return list;
    },
  };
}

async function deliver(w) {
  const queue = w.dms.splice(0);
  for (const { to, env } of queue) {
    await as(w, to, () => flow.receiveMeshDm({ from: env.from }, env.text, deps(w, to)));
  }
}

async function ownerWithHolders(n = 3) {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  const w = makeWorld();
  const owner = (await localAccount.ensureLocalAccount()).routeId;
  const holders = [];
  for (let i = 0; i < n; i++) holders.push((await localAccount.createAdditionalAccount({ displayName: `H${i}` })).routeId);
  holders.forEach((h) => w.mutual.add(h));
  w.mutual.add(owner);
  w.pool = [...holders];
  await as(w, owner, async () => {
    const saved = await savePassphraseVault(PASS, EMAIL);
    assert.equal(saved.ok, true, saved.reason);
    await flow.shareMyVault(deps(w, owner));
  });
  await deliver(w);
  return { w, owner, holders };
}

async function newDevice(w, fault = {}) {
  Object.assign(w.fault, fault);
  const device = (await localAccount.createAdditionalAccount({ displayName: "Novo" })).routeId;
  const res = await as(w, device, () => flow.requestFromMesh(EMAIL, PASS, deps(w, device)));
  assert.equal(res.ok, true);
  return { device, res };
}

const tickAll = async (w, holders) => {
  let released = 0;
  for (const h of holders) released += (await as(w, h, () => flow.holderTick(deps(w, h)))).released;
  return released;
};

const collect = (w, device) => as(w, device, () => flow.collectMeshReply(deps(w, device)));

async function restoreOn(w, device, record) {
  return as(w, device, () => restoreFromPassphraseVault(PASS, { email: EMAIL, directRecord: record }));
}

test("rede — push 503 no pedido: sem exceção, viaRelay falso, pedido gravado inteiro", async () => {
  const { w, owner, holders } = await ownerWithHolders(2);
  w.fault.rejectPush = (addr) => addr.startsWith(mesh.BOX_PREFIX);
  const { device, res } = await newDevice(w);
  assert.equal(res.viaRelay, false);
  const pending = await as(w, device, () => mesh.loadPending(w.now));
  assert.ok(pending?.requestId && pending.sealedPrivate, "pedido persistido");
  assert.equal(await tickAll(w, holders), 0, "relay vazio: ninguém vê");
  assert.equal(w.dms.filter((d) => d.to === owner).length, 0);
  assert.equal((await collect(w, device)).reason, "waiting");
});

test("rede — push 503 na entrega: próximo tick do guarda entrega", async () => {
  const { w, holders } = await ownerWithHolders(1);
  const { device } = await newDevice(w);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  let blockReplyPush = true;
  w.fault.rejectPush = (addr) => addr.startsWith(mesh.REPLY_PREFIX) && blockReplyPush;
  assert.equal(await tickAll(w, holders), 0);
  const held = await as(w, holders[0], () => mesh.loadHeld());
  const req = Object.values(held)[0].requests;
  const id = Object.keys(req)[0];
  assert.notEqual(req[id].answered, true);
  blockReplyPush = false;
  assert.equal(await tickAll(w, holders), 1);
  const after = await as(w, holders[0], () => mesh.loadHeld());
  assert.equal(Object.values(after)[0].requests[id].answered, true);
  assert.equal((await collect(w, device)).ok, true);
});

test("rede — pull 503 ao juntar: segunda volta lê a resposta", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const { device } = await newDevice(w);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  await tickAll(w, holders);
  let replyPulls = 0;
  w.fault.rejectPull = (addr) => {
    if (!addr.startsWith(mesh.REPLY_PREFIX)) return false;
    replyPulls += 1;
    return replyPulls === 1;
  };
  assert.equal((await collect(w, device)).reason, "waiting");
  const got = await collect(w, device);
  assert.equal(got.ok, true);
  assert.equal((await restoreOn(w, device, got.record)).routeId, owner);
});

test("rede — lixo na caixa do pedido: holderTick ignora e acha o pedido", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const { device } = await newDevice(w);
  const address = await mesh.meshVaultAddress(PASS, EMAIL);
  const box = await mesh.boxMailbox(address);
  w.fault.garbage = (addr) => (addr === box ? [{ v: 1, ephPub: "x", ct: "not-json" }, { v: 1, ct: "{" }] : []);
  assert.equal(await tickAll(w, holders), 0);
  assert.equal(w.dms.filter((d) => d.to === owner).length, 1);
  assert.equal((await collect(w, device)).reason, "waiting");
});

test("rede — pedido duplicado na pull: um aviso à dona", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const { device } = await newDevice(w);
  assert.ok(await as(w, device, () => flow.hasMeshRequest(deps(w, device))));
  w.fault.duplicateLast = (addr) => addr.startsWith(mesh.BOX_PREFIX);
  await tickAll(w, holders);
  assert.equal(w.dms.filter((d) => d.to === owner).length, 1);
  await deliver(w);
  assert.equal((await as(w, owner, () => flow.pendingNotices())).length, 1);
});

test("rede — resposta duplicada na pull: um cofre, mesma conta", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const { device } = await newDevice(w);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  await tickAll(w, holders);
  const pending = await as(w, device, () => mesh.loadPending(w.now));
  const box = await mesh.replyMailbox(pending.request.k);
  w.fault.duplicateLast = (addr) => addr === box;
  const got = await collect(w, device);
  assert.equal(got.ok, true);
  assert.equal([...w.relay.get(box)].length, 1, "relay real tem uma entrada");
  assert.equal((await restoreOn(w, device, got.record)).routeId, owner);
});

test("rede — três guardas no mesmo tick: uma resposta, mesmo routeId", async () => {
  const { w, owner, holders } = await ownerWithHolders(3);
  const { device } = await newDevice(w);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  assert.equal(await tickAll(w, holders), 3);
  const pending = await as(w, device, () => mesh.loadPending(w.now));
  const replies = w.relay.get(await mesh.replyMailbox(pending.request.k)) || [];
  assert.ok(replies.length >= 1);
  const got = await collect(w, device);
  assert.equal(got.ok, true);
  assert.equal((await restoreOn(w, device, got.record)).routeId, owner);
});