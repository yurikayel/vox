/**
 * Guardiões, parte 3c (spec dos guardiões v0 §7, THREAT-MODEL T25): pedir a conta de volta. Dona e guardiões são
 * contas reais neste navegador, com cifra de verdade (chave temporária, envelopes selados, chave do aparelho). Cada
 * condição do T25 tem o seu teste.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as guardians from "../client/js/identity/guardians.js";
import * as sendFlow from "../client/js/app/guardians-flow.js";
import * as ret from "../client/js/identity/guardian-return.js";
import * as flow from "../client/js/app/guardian-return-flow.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import * as keystore from "../client/js/identity/keystore.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as identitySeed from "../client/js/identity/identity-seed.js";
import { getAccountExits } from "../client/js/identity/account-exit.js";
import { openRecoverySecret, restoreFromSecret } from "../client/js/identity/account-phrase.js";
import { renderOAuthEnrich } from "../client/js/render/oauth-modals.js";
import { compressPoint, decompressPoint, bytesToBigInt } from "../client/js/identity/p256.js";
import { parseRoute } from "../client/js/app/route-parse.js";
import { BIP39_PT } from "../client/js/data/bip39-pt.js";
import * as screen from "../client/js/render/guardian-return.js";
import { isReadFirstRoute, submitNeedsEntry } from "../client/js/app/read-first.js";

if (!globalThis.sessionStorage) {
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

const HOUR = 60 * 60 * 1000;
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

function sendDeps(me, outbox) {
  return {
    getMe: () => me, getOwnerName: () => "Ana", getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body), verify: (s) => localAccount.verifyPayload(s),
    seal: async (_pub, text, meta) => ({ ...meta, text }),
    dispatch: async (_to, env) => outbox.push(env) && "delivered",
    openSecret: (pass) => openRecoverySecret(pass), follows: () => true, addedMe: () => true, alert: () => {},
  };
}

/** Dona com 3 guardiões que já guardam um pedaço cada (2 de 3). */
async function ownerWithGuardians() {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  sessionStorage.clear();
  heldByDevice.clear();
  keyLock.__resetKeyLockForTests();
  const owner = (await localAccount.ensureLocalAccount()).routeId;
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await localAccount.createAdditionalAccount({ displayName: `G${i}` })).routeId);
  await localAccount.switchActiveAccount(owner);
  const ownerDmPub = await cryptoDm.getPublicJwk();
  const seed = Buffer.from((await openRecoverySecret()).secret).toString("hex");
  const sent = [];
  await sendFlow.sendGuardianShares({ guardians: ids, m: 2 }, sendDeps(owner, sent));
  for (const env of sent) {
    await localAccount.switchActiveAccount(env.to);
    await onDevice(env.to, () => sendFlow.receiveGuardianDm({ from: env.from }, env.text, sendDeps(env.to, [])));
  }
  return { owner, ids, ownerDmPub, seed };
}

/** O que o aparelho de um guardião usa para devolver; `pushed` recebe o que iria para o relay. */
function guardianDeps(me, pushed, overrides = {}) {
  return {
    getMe: () => me,
    openHeld: (owner) => onDevice(me, () => guardians.openHeldShare(owner)),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    push: async (addr, env) => pushed.push({ addr, env }),
    now: () => Date.now(),
    ...overrides,
  };
}

/** Aparelho novo: começa como outra conta qualquer, que a volta substitui. */
async function newDevice(owner) {
  const device = (await localAccount.createAdditionalAccount({ displayName: "Aparelho novo" })).routeId;
  await localAccount.switchActiveAccount(device);
  const res = await flow.startRecovery(owner);
  assert.equal(res.ok, true);
  return { ...res, device };
}

const queryOf = (link) => new URLSearchParams(link.split("?")[1]);

async function giveBack(guardian, link, pushed, overrides = {}) {
  await localAccount.switchActiveAccount(guardian);
  const prep = await flow.prepareGuardianReturn(queryOf(link), guardianDeps(guardian, pushed, overrides));
  assert.equal(prep.ok, true, `pedido vale para ${guardian}`);
  return flow.sendGuardianReturn(prep.request, { confirmed: true }, guardianDeps(guardian, pushed, overrides));
}

test("volta - 2 de 3: uma resposta não basta; duas devolvem a mesma conta, a mesma DM e a mesma semente", async () => {
  const { owner, ids, ownerDmPub, seed } = await ownerWithGuardians();
  const req = await newDevice(owner);
  const pushed = [];
  const first = await giveBack(ids[0], req.link, pushed);
  const second = await giveBack(ids[1], req.link, pushed);
  assert.equal(first.viaRelay, true);
  await localAccount.switchActiveAccount(req.device);
  assert.deepEqual(await flow.addPastedReply(first.pasteText), { ok: true }, "volta pessoal: texto colado");
  assert.deepEqual(await flow.addPastedReply(first.pasteText), { ok: false, reason: "repeated" });
  assert.deepEqual(await flow.finishRecovery(), { ok: false, reason: "not-enough", have: 1, need: 2 });
  assert.equal(await flow.collectRelayReplies({ ...(await flowDeps()), pull: async () => [pushed[1].env] }), 1, "caixa temporária");
  const done = await flow.finishRecovery();
  assert.equal(done.ok, true);
  assert.equal(await localAccount.getRouteId(), owner);
  assert.deepEqual(await cryptoDm.getPublicJwk().then((j) => [j.x, j.y]), [ownerDmPub.x, ownerDmPub.y]);
  assert.equal(Buffer.from(await identitySeed.openSeed(owner)).toString("hex"), seed);
  assert.ok(getAccountExits(owner).guardioes > 0);
  assert.equal(ret.loadPending(), null, "pedido e chave temporária esquecidos");
  assert.equal(second.ok, true);
});

/** Dependências reais do aparelho novo, com `pull` trocável. */
async function flowDeps() {
  const [inbox, phrase] = [await import("../client/js/inbox.js"), await import("../client/js/identity/account-phrase.js")];
  return {
    getMe: () => localAccount.getRouteId(), openHeld: (o) => guardians.openHeldShare(o),
    newKeypair: () => cryptoDm.generateDmKeypair(), seal: (p, t, m) => cryptoDm.seal(p, t, m), open: (e, k) => cryptoDm.open(e, k),
    sealKey: (v) => keystore.sealJsonStrict(v), openKey: (v) => keystore.openSealed(v),
    push: (a, e) => inbox.pushSealed(a, e), pull: (a) => inbox.pullMine(a),
    verify: (s) => localAccount.verifyPayload(s), restore: (j, o) => phrase.restoreFromSecret(j, o), now: () => Date.now(),
  };
}

test("volta - guardião recusa link estragado, a própria conta, pedido velho ou adiantado e conta que não guarda", async () => {
  const { owner, ids } = await ownerWithGuardians();
  const req = await newDevice(owner);
  const pushed = [];
  const deps = (me, over) => guardianDeps(me, pushed, over);
  const q = queryOf(req.link);
  const broken = new URLSearchParams(q);
  broken.set("k", "AAAA");
  assert.deepEqual(await flow.prepareGuardianReturn(broken, deps(ids[0])), { ok: false, reason: "invalid" });
  assert.deepEqual(await flow.prepareGuardianReturn(q, deps(owner)), { ok: false, reason: "self" });
  const later = (ms) => deps(ids[0], { now: () => req.request.t + ms });
  assert.deepEqual(await flow.prepareGuardianReturn(q, later(25 * HOUR)), { ok: false, reason: "old" });
  assert.equal((await flow.prepareGuardianReturn(q, later(23 * HOUR))).ok, true, "até 24 h vale");
  assert.deepEqual(await flow.prepareGuardianReturn(q, later(-10 * 60 * 1000)), { ok: false, reason: "future" });
  const stranger = (await localAccount.createAdditionalAccount({ displayName: "Estranho" })).routeId;
  assert.deepEqual(await flow.prepareGuardianReturn(q, deps(stranger)), { ok: false, reason: "not-held" });
  assert.deepEqual(await flow.sendGuardianReturn(req.request, { confirmed: true }, later(25 * HOUR)), { ok: false, reason: "old" });
  assert.equal(pushed.length, 0);
});

test("volta - sem marcar que conferiu o código por voz ou pessoalmente, nada é devolvido; o botão nasce desligado", async () => {
  const { owner, ids } = await ownerWithGuardians();
  const req = await newDevice(owner);
  const pushed = [];
  for (const confirmed of [false, undefined, "sim", 1]) {
    assert.deepEqual(await flow.sendGuardianReturn(req.request, { confirmed }, guardianDeps(ids[0], pushed)), { ok: false, reason: "not-confirmed" });
  }
  assert.equal(pushed.length, 0);
  const html = screen.renderGuardianReturnHtml({ name: "Ana dos contatos", avatarUrl: "", ageMs: 5 * 60000, code: req.code });
  assert.match(html, /id="btn-guardian-return" disabled/);
  assert.match(html, /por voz ou pessoalmente/);
  assert.match(html, /Ana dos contatos/);
  assert.match(html, /há 5 minutos/);
});

test("volta - pedido e caixa não levam nome nem routeId da dona; resposta só abre com a chave temporária do pedido", async () => {
  const { owner, ids } = await ownerWithGuardians();
  const reqA = await newDevice(owner);
  const pushed = [];
  const reply = await giveBack(ids[0], reqA.link, pushed);
  await giveBack(ids[1], reqA.link, pushed);
  const box = pushed[0].addr;
  assert.match(box, /^vxtmp_[0-9a-f]{20}$/);
  assert.equal(box.includes(owner.slice(3)), false);
  assert.equal(pushed[0].env.to, box, "o envelope vai para a caixa, não para a dona");
  assert.equal(JSON.stringify(pushed[0].env).includes(owner), false);
  assert.deepEqual([...queryOf(reqA.link).keys()].sort(), ["k", "n", "o", "t"]);
  const reqB = await newDevice(owner);
  assert.deepEqual(await flow.addPastedReply(reply.pasteText), { ok: true });
  const relabelled = { ...pushed[1].env, id: "dm_outro", to: await ret.mailboxFor(reqB.request.k) };
  await flow.collectRelayReplies({ ...(await flowDeps()), pull: async () => [pushed[1].env, relabelled] });
  assert.deepEqual(await flow.finishRecovery(), { ok: false, reason: "not-enough", have: 0, need: 0 }, "respostas de outro pedido não abrem");
  assert.notEqual(await localAccount.getRouteId(), owner);
});

test("volta - pedaço forjado ou de outra conta não conta; conta juntada diferente da pedida é recusada antes de trocar chave", async () => {
  const { owner, ids } = await ownerWithGuardians();
  await localAccount.switchActiveAccount(ids[0]);
  const real = await onDevice(ids[0], () => guardians.openHeldShare(owner));
  const forged = await localAccount.signPayload({ ...real, author: undefined, sig: undefined, pubKey: undefined, id: undefined });
  const tampered = { ...real, y: real.y.replace(/^./, (c) => (c === "A" ? "B" : "A")) };
  const verify = (s) => localAccount.verifyPayload(s);
  assert.deepEqual(await ret.joinShares([forged, tampered], owner, verify), { ok: false, have: 0, need: 0 });
  const other = await localAccount.createAdditionalAccount({ displayName: "Outra" });
  await localAccount.switchActiveAccount(other.routeId);
  const wrong = await restoreFromSecret({ kind: "semente", secret: crypto.getRandomValues(new Uint8Array(16)) }, owner);
  assert.deepEqual(wrong, { ok: false, reason: "wrong-account" });
  assert.equal(await localAccount.getRouteId(), other.routeId, "nenhuma chave trocada");
});

test("volta - chave temporária nunca fica em claro; sem chave do aparelho não há pedido; pedido velho some da aba", async () => {
  const { owner } = await ownerWithGuardians();
  const req = await newDevice(owner);
  const raw = sessionStorage.getItem(ret.PENDING_STORAGE);
  assert.equal(JSON.parse(raw).privateJwk, undefined);
  assert.ok(keystore.isSealed(JSON.parse(raw).sealedPrivate));
  assert.equal(ret.loadPending(req.request.t + 25 * HOUR), null);
  assert.equal(sessionStorage.getItem(ret.PENDING_STORAGE), null);
  const saved = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  keystore.__resetKeystoreForTests();
  try {
    assert.deepEqual(await flow.startRecovery(owner), { ok: false, reason: "no-keystore" });
  } finally {
    globalThis.indexedDB = saved;
    keystore.__resetKeystoreForTests();
  }
  assert.deepEqual(await flow.startRecovery("vx_curto"), { ok: false, reason: "invalid" });
  assert.equal(flow.parseOwnerInput(`https://vox.example/#/u/${owner}?tab=posts`), owner);
  assert.equal(flow.parseOwnerInput("nada aqui"), "");
});

test("volta - ponto comprimido, código curto, texto colado, rotas e entrada pela tela de conta", async () => {
  const pair = await cryptoDm.generateDmKeypair();
  const jwk = ret.decodeTempPub(ret.encodeTempPub(pair.publicJwk));
  assert.deepEqual([jwk.x, jwk.y], [pair.publicJwk.x, pair.publicJwk.y]);
  const pt = decompressPoint(compressPoint({ x: bytesToBigInt(Buffer.from(pair.publicJwk.x, "base64url")), y: bytesToBigInt(Buffer.from(pair.publicJwk.y, "base64url")) }));
  assert.equal(pt.y, bytesToBigInt(Buffer.from(pair.publicJwk.y, "base64url")));
  assert.throws(() => decompressPoint(new Uint8Array(33).fill(5)), /inválido/);
  const req = ret.buildRequest({ owner: "vx_aaaaaaaaaaaaaaaaaaaa", publicJwk: pair.publicJwk, now: 1000, nonce: "nonce_123" });
  const code = await ret.shortCode(req);
  assert.equal(code.length, ret.CODE_WORDS);
  assert.ok(code.every((w) => BIP39_PT.includes(w)));
  assert.deepEqual(await ret.shortCode({ ...req }), code, "o mesmo pedido dá o mesmo código");
  assert.notDeepEqual(await ret.shortCode({ ...req, n: "nonce_124" }), code);
  const env = { v: 1, id: "dm_x", ephPub: { kty: "EC" }, ct: "abc", to: "vxtmp_1" };
  assert.deepEqual(ret.decodePasteText(`  ${ret.encodePasteText(env).replace(/(.{20})/g, "$1\n")}  `), env);
  assert.equal(ret.decodePasteText("vox-volta:lixo"), null);
  location.hash = `#/guardiao?o=${req.o}&k=${req.k}&t=1000&n=nonce_123`;
  const route = parseRoute();
  assert.equal(route.name, "guardian-return");
  assert.deepEqual(ret.parseRequest(route.query), req);
  location.hash = "#/voltar";
  assert.deepEqual(parseRoute(), { name: "guardian-recover" });
  assert.equal(isReadFirstRoute("guardian-recover"), true, "aparelho novo abre #/voltar sem entrar");
  assert.equal(submitNeedsEntry({ id: "form-guardian-recover" }), false, "criar o pedido não pede entrada");
  location.hash = "#/";
  const modal = { innerHTML: "" };
  renderOAuthEnrich(modal);
  assert.match(modal.innerHTML, /href="#\/voltar"/, "Já tenho conta oferece os guardiões");
  assert.match(screen.renderRecoverPendingHtml({ link: "L", code, received: 1 }), /1 resposta recebida/);
  assert.equal(screen.describeAge(2 * HOUR), "há 2 horas");
});
