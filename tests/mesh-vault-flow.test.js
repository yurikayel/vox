/**
 * Cofre na malha (ADR-037), fluxo completo entre aparelhos: a dona grava o cofre com e-mail e senha, os laços mútuos
 * guardam, um aparelho limpo pede só com e-mail e senha, e quem guarda avisa, espera, entrega ou respeita o veto.
 * Contas, assinaturas, caixa do cofre, chave temporária e cofre v2 são de verdade; a DM entre aparelhos vai em claro
 * (a cifra da DM tem testes próprios) e o relay é um mapa em memória.
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

/** Mundo de teste: relógio, relay, DMs em trânsito, armazenamento da malha por aparelho e laços mútuos. */
function makeWorld() {
  return { now: Date.now(), relay: new Map(), dms: [], storage: new Map(), mutual: new Set(), guardians: [], pool: [] };
}

/** Roda `fn` como a conta `who`, com a malha guardada no aparelho dela. */
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

function deps(w, me) {
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

/** Entrega as DMs pendentes; devolve quantas eram do cofre na malha. */
async function deliver(w, filter = () => true) {
  const queue = w.dms.splice(0).filter(filter);
  let handled = 0;
  for (const { to, env } of queue) {
    if (await as(w, to, () => flow.receiveMeshDm({ from: env.from }, env.text, deps(w, to)))) handled += 1;
  }
  return handled;
}

/** Dona com cofre gravado (e-mail e senha) e `n` laços mútuos que já guardam. */
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
    assert.deepEqual((await flow.shareMyVault(deps(w, owner))).sort(), [...holders].sort());
  });
  assert.equal(await deliver(w), n);
  return { w, owner, holders };
}

async function newDevice(w, email = EMAIL, pass = PASS) {
  const device = (await localAccount.createAdditionalAccount({ displayName: "Aparelho novo" })).routeId;
  const res = await as(w, device, () => flow.requestFromMesh(email, pass, deps(w, device)));
  assert.equal(res.ok, true);
  return device;
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

test("dona — gravar o cofre com e-mail manda a cópia cifrada a cada laço mútuo, uma vez", async () => {
  const { w, owner, holders } = await ownerWithHolders(3);
  for (const h of holders) {
    const held = await as(w, h, () => mesh.loadHeld());
    assert.equal(Object.keys(held).length, 1);
    assert.ok(mesh.isVaultAddress(held[owner].address));
    assert.equal(held[owner].record.v, 2, "guarda o cofre v2 cifrado, não a conta");
  }
  assert.deepEqual(await as(w, owner, () => flow.shareMyVault(deps(w, owner))), [], "não reenvia");
});

test("dona — no máximo 7 guardas, guardiões primeiro; laço novo recebe na próxima volta", async () => {
  const { w, owner } = await ownerWithHolders(0);
  const ids = [];
  for (let i = 0; i < 9; i++) ids.push((await localAccount.createAdditionalAccount({ displayName: `L${i}` })).routeId);
  ids.forEach((id) => w.mutual.add(id));
  w.guardians = [ids[8]];
  w.pool = ids.slice(0, 8);
  const sent = await as(w, owner, () => flow.shareMyVault(deps(w, owner)));
  assert.equal(sent.length, 7);
  assert.equal(sent[0], ids[8], "guardião primeiro");
  assert.deepEqual(await as(w, owner, () => flow.shareMyVault(deps(w, owner))), [], "já são 7");
});

test("dona — quem não é laço mútuo fica de fora", async () => {
  const { w, owner } = await ownerWithHolders(0);
  const stranger = (await localAccount.createAdditionalAccount({ displayName: "X" })).routeId;
  w.pool = [stranger];
  assert.deepEqual(await as(w, owner, () => flow.shareMyVault(deps(w, owner))), []);
});

test("quem guarda — recusa cofre de quem não é laço mútuo, assinatura adulterada, remetente trocado e destino errado", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const [h] = holders;
  const body = mesh.buildGuardBody({ to: h, address: "c".repeat(64), record: { v: 2, ct: "x" }, updatedAt: Date.now() + 10 });
  const signed = await as(w, owner, () => localAccount.signPayload(body));
  const text = mesh.serializeMeshDm(signed);
  const before = await as(w, h, () => mesh.loadHeld()[owner].address);
  const receive = (env, raw) => as(w, h, () => flow.receiveMeshDm(env, raw, deps(w, h)));

  assert.equal(await receive({ from: holders[0] }, text), true, "remetente diferente do autor");
  assert.equal(await receive({ from: owner }, mesh.serializeMeshDm({ ...signed, address: "d".repeat(64) })), true, "adulterado");
  const elsewhere = await as(w, owner, () => localAccount.signPayload({ ...body, to: "vx_outro" }));
  assert.equal(await receive({ from: owner }, mesh.serializeMeshDm(elsewhere)), true, "para outro");
  w.mutual.delete(owner);
  assert.equal(await receive({ from: owner }, text), true, "laço desfeito");
  assert.equal(await as(w, h, () => mesh.loadHeld()[owner].address), before, "nada mudou");
  w.mutual.add(owner);
  await receive({ from: owner }, text);
  assert.equal(await as(w, h, () => mesh.loadHeld()[owner].address), "c".repeat(64), "o válido entra");
  assert.equal(await receive({}, "texto comum"), false, "DM comum segue o caminho normal");
});

test("aparelho limpo — sem resposta da dona, recebe o cofre 24 h depois do aviso e volta para a mesma conta", async () => {
  const { w, owner, holders } = await ownerWithHolders(2);
  const device = await newDevice(w);
  assert.equal(await tickAll(w, holders), 0, "não entrega na hora");
  const notices = w.dms.filter((d) => d.to === owner);
  assert.equal(notices.length, 2, "cada guarda avisa a dona");
  assert.equal((await collect(w, device)).reason, "waiting");
  w.now += 23 * HOUR;
  assert.equal(await tickAll(w, holders), 0, "ainda na espera");
  w.now += 2 * HOUR;
  assert.equal(await tickAll(w, holders), 2);
  const got = await collect(w, device);
  assert.equal(got.ok, true);
  const res = await restoreOn(w, device, got.record);
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.routeId, owner, "a mesma conta, sem servidor");
});

test("aparelho limpo — a dona aprova em outro aparelho e o cofre chega na hora", async () => {
  const { w, owner, holders } = await ownerWithHolders(2);
  const device = await newDevice(w);
  await tickAll(w, holders);
  assert.equal(await deliver(w), 2, "avisos chegam à dona");
  const pending = await as(w, owner, () => flow.pendingNotices());
  assert.equal(pending.length, 1, "um pedido, mesmo com dois guardas avisando");
  assert.equal(pending[0].holders, 2);
  assert.equal(await as(w, owner, () => flow.decideMeshRequest(pending[0].requestId, "sim", deps(w, owner))), 2);
  assert.deepEqual(await as(w, owner, () => flow.pendingNotices()), [], "decidido sai da lista");
  await deliver(w);
  assert.equal(await tickAll(w, holders), 2, "entrega antes das 24 h");
  const res = await restoreOn(w, device, (await collect(w, device)).record);
  assert.equal(res.routeId, owner);
});

test("veto — \"Não fui eu\" impede a entrega para sempre, mesmo depois da espera", async () => {
  const { w, owner, holders } = await ownerWithHolders(2);
  const device = await newDevice(w);
  await tickAll(w, holders);
  await deliver(w);
  const [{ requestId }] = await as(w, owner, () => flow.pendingNotices());
  await as(w, owner, () => flow.decideMeshRequest(requestId, "nao", deps(w, owner)));
  await deliver(w);
  w.now += 30 * HOUR;
  assert.equal(await tickAll(w, holders), 0);
  assert.equal((await collect(w, device)).reason, "waiting");
});

test("veto — decisão assinada por outra conta é ignorada (quem só roubou e-mail e senha não aprova)", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const [h] = holders;
  await newDevice(w);
  await tickAll(w, holders);
  const requestId = Object.keys(await as(w, h, () => mesh.loadHeld()[owner].requests))[0];
  const thief = (await localAccount.createAdditionalAccount({ displayName: "Ladrão" })).routeId;
  w.mutual.add(thief);
  const forged = await as(w, thief, () => localAccount.signPayload(mesh.buildDecisionBody({ to: h, requestId, decision: "sim" })));
  await as(w, h, () => flow.receiveMeshDm({ from: thief }, mesh.serializeMeshDm(forged), deps(w, h)));
  assert.equal(await tickAll(w, holders), 0, "continua esperando");
  const relabeled = { ...forged, author: owner };
  await as(w, h, () => flow.receiveMeshDm({ from: owner }, mesh.serializeMeshDm(relabeled), deps(w, h)));
  assert.equal(await tickAll(w, holders), 0, "assinatura não bate com a dona");
});

test("senha errada — o pedido vai para outra caixa: ninguém vê, ninguém avisa, nada chega", async () => {
  const { w, owner, holders } = await ownerWithHolders(2);
  const device = await newDevice(w, EMAIL, "outra senha bem longa");
  await tickAll(w, holders);
  assert.equal(w.dms.filter((d) => d.to === owner).length, 0);
  w.now += 25 * HOUR;
  assert.equal(await tickAll(w, holders), 0);
  assert.equal((await collect(w, device)).reason, "waiting");
});

test("e-mail digitado com maiúsculas e espaços acha o mesmo cofre", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const device = await newDevice(w, "  ANA@Exemplo.com ", PASS);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  assert.equal(await tickAll(w, holders), 1);
  assert.equal((await restoreOn(w, device, (await collect(w, device)).record)).routeId, owner);
});

test("entrega uma vez só; pedido repetido não gera aviso de novo", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const device = await newDevice(w);
  await tickAll(w, holders);
  await tickAll(w, holders);
  assert.equal(w.dms.filter((d) => d.to === owner).length, 1, "um aviso por pedido");
  w.now += 25 * HOUR;
  assert.equal(await tickAll(w, holders), 1);
  assert.equal(await tickAll(w, holders), 0, "já entregue");
  assert.equal((await collect(w, device)).ok, true);
});

test("pedido vencido (mais de 72 h) é descartado sem entrega", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  await newDevice(w);
  w.now += 73 * HOUR;
  assert.equal(await tickAll(w, holders), 0);
  assert.equal(w.dms.filter((d) => d.to === owner).length, 0, "pedido velho nem gera aviso");
});

test("quem guarda estava fora: o pedido espera na caixa e é visto quando o app abre", async () => {
  const { w, holders } = await ownerWithHolders(2);
  const device = await newDevice(w);
  w.now += 2 * HOUR;
  await tickAll(w, [holders[0]]);
  w.now += 24 * HOUR;
  assert.equal(await tickAll(w, holders), 1, "o primeiro já pode entregar; o segundo acabou de ver");
  assert.equal((await collect(w, device)).ok, true);
});

test("a resposta só abre com a chave temporária do aparelho que pediu", async () => {
  const { w, holders } = await ownerWithHolders(1);
  await newDevice(w);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  await tickAll(w, holders);
  const [replyBox] = [...w.relay.keys()].filter((k) => k.startsWith(mesh.REPLY_PREFIX));
  const [env] = w.relay.get(replyBox);
  const outsider = await cryptoDm.generateDmKeypair();
  await assert.rejects(() => cryptoDm.open(env, outsider.privateJwk));
});

test("o relay não vê de quem é a conta, o e-mail, o endereço do cofre nem o cofre", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  await newDevice(w);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  await tickAll(w, holders);
  const address = await as(w, holders[0], () => mesh.loadHeld()[owner].address);
  const record = await as(w, holders[0], () => mesh.loadHeld()[owner].record);
  const everything = JSON.stringify([...w.relay.entries()]);
  for (const secret of [owner, EMAIL, PASS, address, record.ct]) assert.ok(!everything.includes(secret), `vazou ${String(secret).slice(0, 12)}`);
  for (const [box, list] of w.relay) {
    assert.match(box, /^vxcofr?_[0-9a-f]{20}$/);
    for (const env of list) assert.equal(env.from, "", "sem remetente: o relay não liga pedido nem resposta a ninguém");
  }
});

test("troca de senha — quem guarda passa a ter o cofre novo; a senha antiga não acha mais nada", async () => {
  const { w, owner, holders } = await ownerWithHolders(1);
  const NEW = "senha nova bem comprida";
  await as(w, owner, async () => {
    const saved = await savePassphraseVault(NEW, { email: EMAIL, prevEmail: EMAIL, prevPassphrase: PASS });
    assert.equal(saved.ok, true, saved.reason);
    assert.deepEqual(await flow.shareMyVault(deps(w, owner)), holders, "quem guardava recebe o novo primeiro");
  });
  await deliver(w);
  const held = await as(w, holders[0], () => mesh.loadHeld()[owner]);
  assert.equal(held.address, await mesh.meshVaultAddress(NEW, EMAIL));
  const oldDevice = await newDevice(w, EMAIL, PASS);
  await tickAll(w, holders);
  w.now += 25 * HOUR;
  assert.equal(await tickAll(w, holders), 0);
  assert.equal((await collect(w, oldDevice)).reason, "waiting");
});

test("soltar — a dona pede e cada guarda apaga o cofre dela", async () => {
  const { w, owner, holders } = await ownerWithHolders(2);
  assert.equal(await as(w, owner, () => flow.releaseMyVault(deps(w, owner))), 2);
  await deliver(w);
  for (const h of holders) assert.equal(await as(w, h, () => mesh.heldCount()), 0);
  assert.equal(await as(w, owner, () => mesh.loadMine()), null);
});

test("aparelho novo — sem pedido não há o que juntar; cancelar esquece o pedido", async () => {
  const { w } = await ownerWithHolders(0);
  const device = await newDevice(w);
  assert.equal(await as(w, device, () => flow.hasMeshRequest(deps(w, device))), true);
  await as(w, device, () => flow.cancelMeshRequest());
  assert.equal(await as(w, device, () => flow.hasMeshRequest(deps(w, device))), false);
  assert.equal((await collect(w, device)).reason, "no-request");
});

test("aparelho novo — sem como guardar a chave temporária, não pede", async () => {
  const { w } = await ownerWithHolders(0);
  const device = (await localAccount.createAdditionalAccount({ displayName: "D" })).routeId;
  const res = await as(w, device, () => flow.requestFromMesh(EMAIL, PASS, { ...deps(w, device), sealKey: async () => { throw new Error("x"); } }));
  assert.deepEqual(res, { ok: false, reason: "no-keystore" });
});

test("conta sem e-mail no cofre não vai para a malha (não há como pedir só com a senha)", async () => {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
  await localAccount.ensureLocalAccount();
  assert.equal((await savePassphraseVault(PASS)).ok, true);
  assert.equal(mesh.loadMine(), null);
});
