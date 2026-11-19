/**
 * Cofre na malha (ADR-037), fluxo entre aparelhos, caçando bugs: espera de 24 h, veto, decisão forjada, pedidos
 * concorrentes, volta de quem guarda interrompida, armazenamento corrompido e quem recebe o cofre. A cifra do pedido e
 * da resposta (caixa do cofre, chave temporária) é de verdade; as contas são de mentira (assinatura determinística,
 * sem PBKDF2), a DM vai em claro e o relay é um mapa em memória. O relógio é o do mundo de teste.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as flow from "../client/js/app/mesh-vault-flow.js";
import * as cryptoDm from "../client/js/crypto-dm.js";

const HOUR = 60 * 60 * 1000;
const A1 = "a".repeat(64);
const A2 = "b".repeat(64);
const RECORD = { v: 2, salt: "s", iv: "i", ct: "c".repeat(300) };
const KEYS = [mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.NOTICES_STORAGE, mesh.PENDING_STORAGE];
const OWNER = "vx_dona";
const H1 = "vx_h1";
const H2 = "vx_h2";

const sigOf = (author, body) => `ok:${author}:${JSON.stringify(body)}`;
const signAs = (author, body) => ({ ...body, author, pubKey: "pk", sig: sigOf(author, body) });
const verifySigned = ({ author, pubKey, sig, ...body }) => sig === sigOf(author, body);

function makeWorld(...mutual) {
  return { now: Date.now(), relay: new Map(), dms: [], storage: new Map(), mutual: new Set(mutual), guardians: [], pool: [] };
}

/** Roda `fn` no aparelho de `who` (cada um com a sua malha no armazenamento). */
async function as(w, who, fn) {
  const mine = w.storage.get(who) || {};
  for (const k of KEYS) (mine[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, mine[k]));
  try {
    return await fn();
  } finally {
    w.storage.set(who, Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)])));
  }
}

const isRelay = (to) => /^vxcofr?_/.test(String(to || ""));

function deps(w, me) {
  return {
    getMe: () => me,
    getDmPub: async () => ({ kty: "EC" }),
    sign: async (body) => signAs(me, body),
    verify: async (signed) => verifySigned(signed),
    seal: (pub, text, meta) => (isRelay(meta.to) ? cryptoDm.seal(pub, text, meta) : { ...meta, text }),
    open: (env, priv) => cryptoDm.open(env, priv),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    sealKey: async (v) => v,
    openKey: async (v) => v,
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

/** `from` manda a DM do cofre `body` a `to`, que a recebe. */
const send = (w, from, to, body, envFrom = from) =>
  as(w, to, () => flow.receiveMeshDm({ from: envFrom }, mesh.serializeMeshDm(signAs(from, body)), deps(w, to)));

const giveVault = (w, owner, to, over = {}) =>
  send(w, owner, to, mesh.buildGuardBody({ to, address: A1, record: RECORD, updatedAt: Date.now(), ...over }));

async function deliver(w) {
  const queue = w.dms.splice(0);
  for (const { to, env } of queue) await as(w, to, () => flow.receiveMeshDm({ from: env.from }, env.text, deps(w, to)));
  return queue.length;
}

/** Aparelho novo que pede o cofre de `address`: põe o pedido na caixa do relay, como `requestFromMesh` faz. */
async function pushRequest(w, address = A1, t = w.now) {
  const { publicJwk, privateJwk } = await cryptoDm.generateDmKeypair();
  const request = mesh.buildRequest({ publicJwk, now: t });
  const [mailbox, box] = [await mesh.boxMailbox(address), await mesh.boxKeyPair(address)];
  const env = await cryptoDm.seal(box.publicJwk, JSON.stringify(request), { from: "", to: mailbox });
  w.relay.set(mailbox, [...(w.relay.get(mailbox) || []), env]);
  return { request, privateJwk, requestId: await mesh.requestIdOf(request), replyBox: await mesh.replyMailbox(request.k) };
}

/** Cofre que chegou na caixa de resposta do pedido `r`, ou null. */
async function replyTo(w, r) {
  for (const env of w.relay.get(r.replyBox) || []) {
    const text = await cryptoDm.open(env, r.privateJwk).catch(() => null);
    const record = text && mesh.parseReplyText(text, r.requestId);
    if (record) return record;
  }
  return null;
}

const tick = (w, who, d = deps(w, who)) => as(w, who, () => flow.holderTick(d));
const heldOf = (w, who) => as(w, who, () => mesh.loadHeld());
const decide = (w, owner, requestId, decision) => as(w, owner, () => flow.decideMeshRequest(requestId, decision, deps(w, owner)));

/** Mundo com a dona e `n` guardas que já têm o cofre dela, e um pedido ao cofre já visto pelos guardas. */
async function worldWithRequest(n = 1) {
  const holders = [H1, H2].slice(0, n);
  const w = makeWorld(OWNER, ...holders);
  for (const h of holders) await giveVault(w, OWNER, h);
  const r = await pushRequest(w);
  for (const h of holders) await tick(w, h);
  return { w, r, holders };
}

test("liberação — sem \"Fui eu\" nada sai antes de 24 h do aviso; nas 24 h sai uma vez só", async () => {
  const { w, r } = await worldWithRequest();
  w.now += mesh.WAIT_MS - 1;
  assert.equal((await tick(w, H1)).released, 0);
  assert.equal(await replyTo(w, r), null);
  w.now += 1;
  assert.equal((await tick(w, H1)).released, 1);
  assert.deepEqual(await replyTo(w, r), RECORD);
  assert.equal((await tick(w, H1)).released, 0, "não repete");
});

test("liberação — depois do veto nada sai: nem passadas as 24 h, nem com um \"sim\" que chegue depois", async () => {
  const { w, r } = await worldWithRequest();
  await deliver(w);
  await decide(w, OWNER, r.requestId, "nao");
  await deliver(w);
  w.now += 30 * HOUR;
  assert.equal((await tick(w, H1)).released, 0);
  await send(w, OWNER, H1, mesh.buildDecisionBody({ to: H1, requestId: r.requestId, decision: "sim" }));
  assert.equal((await tick(w, H1)).released, 0, "a primeira decisão vale");
  assert.equal(await replyTo(w, r), null);
});

test("liberação — decisão com valor estranho, mesmo assinada pela dona, vale como veto", async () => {
  const { w, r } = await worldWithRequest();
  for (const decision of ["SIM", true, 1, "sim ", ["sim"], null]) {
    await send(w, OWNER, H1, { type: mesh.DECISION_TYPE, v: 0, to: H1, requestId: r.requestId, decision });
    w.now += 25 * HOUR;
    assert.equal((await tick(w, H1)).released, 0, JSON.stringify(decision));
    w.now -= 25 * HOUR;
    const held = await heldOf(w, H1);
    if (held[OWNER].requests[r.requestId].decision === "sim") assert.fail(`decisão ${JSON.stringify(decision)} virou "sim"`);
    delete held[OWNER].requests[r.requestId].decision;
    await as(w, H1, () => mesh.saveHeld(held));
  }
});

test("liberação — pedido vencido (mais de 72 h) não sai, nem visto tarde, e o guarda esquece dele", async () => {
  const w = makeWorld(OWNER, H1);
  await giveVault(w, OWNER, H1);
  const r = await pushRequest(w, A1, w.now - 71 * HOUR);
  await tick(w, H1);
  assert.equal(Object.keys((await heldOf(w, H1))[OWNER].requests).length, 1, "visto com 71 h");
  w.now += mesh.WAIT_MS;
  assert.equal((await tick(w, H1)).released, 0, "24 h depois já tem 95 h");
  assert.equal(await replyTo(w, r), null);
  assert.deepEqual((await heldOf(w, H1))[OWNER].requests, {}, "vencido sai do armazenamento");
});

test("decisão forjada — outra conta, também guardada por este guarda, não aprova nem veta o pedido da dona", async () => {
  const { w, r } = await worldWithRequest();
  w.mutual.add("vx_ladra");
  await giveVault(w, "vx_ladra", H1, { address: A2 });
  for (const decision of ["sim", "nao"]) {
    await send(w, "vx_ladra", H1, mesh.buildDecisionBody({ to: H1, requestId: r.requestId, decision }));
  }
  w.now += 2 * HOUR;
  assert.equal((await tick(w, H1)).released, 0, "o \"sim\" forjado não adiantou");
  const held = await heldOf(w, H1);
  assert.equal(held[OWNER].requests[r.requestId].decision, undefined, "nem o \"não\" forjado marcou");
  w.now += mesh.WAIT_MS;
  assert.equal((await tick(w, H1)).released, 1, "e o veto forjado não impede a entrega que a dona não vetou");
});

test("decisão forjada — remetente do envelope trocado, destino de outro e assinatura de outro autor são ignorados", async () => {
  const { w, r } = await worldWithRequest();
  const sim = mesh.buildDecisionBody({ to: H1, requestId: r.requestId, decision: "sim" });
  await send(w, OWNER, H1, sim, "vx_ladra");
  await send(w, OWNER, H1, { ...sim, to: H2 });
  const signed = signAs("vx_ladra", sim);
  await as(w, H1, () => flow.receiveMeshDm({ from: OWNER }, mesh.serializeMeshDm({ ...signed, author: OWNER }), deps(w, H1)));
  await as(w, H1, () => flow.receiveMeshDm({ from: OWNER }, mesh.serializeMeshDm({ ...signAs(OWNER, sim), requestId: "outro" }), deps(w, H1)));
  w.now += HOUR;
  assert.equal((await tick(w, H1)).released, 0);
});

test("decisão com identificador de pedido perigoso não escreve no protótipo nem libera outro pedido", async () => {
  const w = makeWorld(OWNER, "vx_vitima", H1);
  await giveVault(w, OWNER, H1);
  await giveVault(w, "vx_vitima", H1, { address: A2 });
  const r = await pushRequest(w, A2);
  await tick(w, H1);
  try {
    for (const requestId of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      await send(w, OWNER, H1, { type: mesh.DECISION_TYPE, v: 0, to: H1, requestId, decision: "sim" });
    }
    assert.equal(({}).decision, undefined, "protótipo dos objetos limpo");
    assert.equal(Object.decision, undefined, "Object limpo");
    w.now += HOUR;
    assert.equal((await tick(w, H1)).released, 0, "o pedido da vítima segue esperando as 24 h");
    assert.equal(await replyTo(w, r), null);
  } finally {
    delete Object.prototype.decision;
    delete Object.decision;
  }
});

test("pedidos concorrentes — cada um tem o seu aviso e a sua decisão; o \"sim\" de um não abre o outro", async () => {
  const w = makeWorld(OWNER, H1);
  await giveVault(w, OWNER, H1);
  const [a, b] = [await pushRequest(w), await pushRequest(w)];
  await tick(w, H1);
  await deliver(w);
  assert.deepEqual((await as(w, OWNER, () => flow.pendingNotices())).map((n) => n.requestId).sort(), [a.requestId, b.requestId].sort());
  await decide(w, OWNER, a.requestId, "sim");
  await decide(w, OWNER, b.requestId, "nao");
  await deliver(w);
  w.now += 30 * HOUR;
  assert.equal((await tick(w, H1)).released, 1);
  assert.deepEqual(await replyTo(w, a), RECORD);
  assert.equal(await replyTo(w, b), null);
});

test("pedidos concorrentes — o mesmo pedido repetido no relay e duas voltas ao mesmo tempo geram um aviso só", async () => {
  const w = makeWorld(OWNER, H1);
  await giveVault(w, OWNER, H1);
  const r = await pushRequest(w);
  const box = await mesh.boxMailbox(A1);
  w.relay.set(box, [...w.relay.get(box), ...w.relay.get(box)]);
  await as(w, H1, () => Promise.all([flow.holderTick(deps(w, H1)), flow.holderTick(deps(w, H1))]));
  await deliver(w);
  const notices = await as(w, OWNER, () => flow.pendingNotices());
  assert.deepEqual(notices.map((n) => [n.requestId, n.holders]), [[r.requestId, 1]]);
  assert.equal(Object.keys((await heldOf(w, H1))[OWNER].requests).length, 1);
});

/** Faz `during` acontecer no meio da volta de `who` (quando ela olha a caixa do relay), como numa corrida real. */
const tickInterrupted = (w, who, during) => {
  const d = deps(w, who);
  const pull = d.pull;
  d.pull = async (addr) => {
    await during();
    return pull(addr);
  };
  return tick(w, who, d);
};

test("corrida — um veto que chega durante a volta de quem guarda não se perde", async () => {
  const { w, r } = await worldWithRequest();
  await tickInterrupted(w, H1, () => send(w, OWNER, H1, mesh.buildDecisionBody({ to: H1, requestId: r.requestId, decision: "nao" })));
  w.now += 30 * HOUR;
  assert.equal((await tick(w, H1)).released, 0, "o veto vale");
  assert.equal(await replyTo(w, r), null);
});

test("corrida — cofre novo ou \"soltar\" da dona durante a volta não são desfeitos por ela", async () => {
  const { w } = await worldWithRequest();
  await tickInterrupted(w, H1, () => giveVault(w, OWNER, H1, { record: { ...RECORD, ct: "novo" }, updatedAt: Date.now() + 10 }));
  assert.equal((await heldOf(w, H1))[OWNER].record.ct, "novo", "a cópia velha não volta");
  await tickInterrupted(w, H1, () => send(w, OWNER, H1, mesh.buildReleaseBody({ to: H1 })));
  assert.equal((await heldOf(w, H1))[OWNER], undefined, "a dona soltou: o cofre não ressuscita");
});

test("estado corrompido — uma entrada ilegível não trava a volta das outras donas", async () => {
  const w = makeWorld(OWNER, H1);
  await giveVault(w, OWNER, H1);
  const held = await heldOf(w, H1);
  const broken = { a: null, b: "texto", c: { address: "zzz", requests: {} }, d: { address: [A2], requests: {} }, e: 7 };
  await as(w, H1, () => mesh.saveHeld({ ...broken, ...held }));
  const r = await pushRequest(w);
  assert.equal((await tick(w, H1)).released, 0);
  await deliver(w);
  assert.equal((await as(w, OWNER, () => flow.pendingNotices())).length, 1, "a dona boa foi avisada");
  w.now += mesh.WAIT_MS;
  assert.equal((await tick(w, H1)).released, 1);
  assert.deepEqual(await replyTo(w, r), RECORD);
});

test("estado corrompido — pedido guardado com forma errada não entrega nem trava a volta; o legível entrega", async () => {
  const { w, r } = await worldWithRequest();
  const held = await heldOf(w, H1);
  const good = held[OWNER].requests[r.requestId];
  const bad = { sem_data: { k: good.k, t: good.t }, nulo: null, texto: { k: good.k, t: good.t, firstSeen: "0" } };
  held[OWNER].requests = { ...bad, chave_ruim: { k: "x", t: good.t, firstSeen: 0 }, [r.requestId]: good };
  await as(w, H1, () => mesh.saveHeld(held));
  w.now += mesh.WAIT_MS;
  assert.equal((await tick(w, H1)).released, 1, "só o pedido legível, com 24 h de espera, sai");
  assert.deepEqual(await replyTo(w, r), RECORD);
  const left = Object.keys((await heldOf(w, H1))[OWNER].requests);
  assert.ok(left.includes(r.requestId) && !left.some((id) => ["sem_data", "nulo", "texto"].includes(id)), "o ilegível sai");
});

test("endereço malformado — guarda com endereço fora da forma não é guardada", async () => {
  const w = makeWorld(OWNER, H1);
  for (const address of ["zzz", "", A1.toUpperCase(), [A1], null]) await giveVault(w, OWNER, H1, { address });
  assert.deepEqual(await heldOf(w, H1), {});
  assert.deepEqual(await as(w, H1, () => flow.holderTick(deps(w, H1))), { released: 0 });
});

async function ownerWith(w, { sentTo = [], previousHolders = [] } = {}) {
  await as(w, OWNER, async () => {
    mesh.rememberMine({ routeId: OWNER, address: A1, record: RECORD, updatedAt: Date.now() });
    if (previousHolders.length) {
      mesh.markSent(previousHolders);
      mesh.rememberMine({ routeId: OWNER, address: A1, record: RECORD, updatedAt: Date.now() + 1 });
    }
    if (sentTo.length) mesh.markSent(sentTo);
  });
}
const share = (w) => as(w, OWNER, () => flow.shareMyVault(deps(w, OWNER)));
const ids = (n, prefix = "vx_l") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test("quem recebe — mais de 7 laços: 7 recebem, guardiões primeiro; quem não é laço mútuo não recebe nem como guardião", async () => {
  const ties = ids(10);
  const w = makeWorld(OWNER, ...ties, "vx_guardiao_laco");
  w.pool = [...ties, "vx_estranho"];
  w.guardians = ["vx_guardiao_sem_laco", "vx_guardiao_laco"];
  await ownerWith(w);
  const sent = await share(w);
  assert.equal(sent.length, 7);
  assert.equal(sent[0], "vx_guardiao_laco", "o guardião que é laço vai primeiro");
  assert.ok(!sent.includes("vx_guardiao_sem_laco") && !sent.includes("vx_estranho"), "sem laço mútuo não recebe");
  assert.equal(new Set(sent).size, 7);
  assert.deepEqual(await share(w), [], "as 7 vagas estão ocupadas");
});

test("quem recebe — quem já guardava a cópia velha e deixou de ser laço mútuo não recebe a nova nem gasta vaga", async () => {
  const w = makeWorld(OWNER, H2);
  w.pool = [H2];
  await ownerWith(w, { previousHolders: [H1, H2] });
  const sent = await share(w);
  assert.deepEqual(sent, [H2]);
  assert.deepEqual((await as(w, OWNER, () => mesh.loadMine())).sentTo, [H2], "só consta quem pode aceitar");
});

/** Dois aparelhos da dona levam o aviso em tempos diferentes: 51 avisos falsos empurram o verdadeiro para fora. */
const FLOOD = 60;

test("avisos — a dona vê o pedido verdadeiro mesmo com muitos pedidos falsos depois (veto sem teto)", async () => {
  const w = makeWorld(OWNER, H1);
  await giveVault(w, OWNER, H1);
  const real = await pushRequest(w);
  for (let i = 0; i < FLOOD; i++) await pushRequest(w);
  await tick(w, H1);
  await deliver(w);
  const seen = (await as(w, OWNER, () => flow.pendingNotices())).map((n) => n.requestId);
  assert.ok(seen.includes(real.requestId), "o pedido verdadeiro precisa chegar à dona");
});

test("soltar — um \"soltar\" antigo repetido não apaga o cofre novo que a dona mandou depois", { skip: "ACHADO média: a DM de soltar não tem data nem número de uso; quem repete o envelope (relay) apaga a cópia atual. Correção precisa de campo novo no corpo assinado (formato)." }, async () => {
  const w = makeWorld(OWNER, H1);
  const release = mesh.serializeMeshDm(signAs(OWNER, mesh.buildReleaseBody({ to: H1 })));
  await giveVault(w, OWNER, H1);
  await as(w, H1, () => flow.receiveMeshDm({ from: OWNER }, release, deps(w, H1)));
  await giveVault(w, OWNER, H1, { updatedAt: Date.now() + 5 });
  await as(w, H1, () => flow.receiveMeshDm({ from: OWNER }, release, deps(w, H1)));
  assert.ok((await heldOf(w, H1))[OWNER], "a cópia nova segue guardada");
});

test("soltar — depois de soltar, repetir a DM antiga de guarda não traz o cofre de volta", { skip: "ACHADO baixa: sem marca de que a dona soltou, a guarda velha repetida é aceita de novo. O cofre é cifrado (precisa da senha); correção precisa de lápide com data (formato)." }, async () => {
  const w = makeWorld(OWNER, H1);
  const body = mesh.buildGuardBody({ to: H1, address: A1, record: RECORD, updatedAt: Date.now() });
  const guardDm = mesh.serializeMeshDm(signAs(OWNER, body));
  await as(w, H1, () => flow.receiveMeshDm({ from: OWNER }, guardDm, deps(w, H1)));
  await send(w, OWNER, H1, mesh.buildReleaseBody({ to: H1 }));
  await as(w, H1, () => flow.receiveMeshDm({ from: OWNER }, guardDm, deps(w, H1)));
  assert.equal((await heldOf(w, H1))[OWNER], undefined);
});

test("avisos — aviso de quem não é laço mútuo da dona é ignorado", { skip: "ACHADO baixa: qualquer conta assinando um aviso para a dona gera alerta e entra na fila. Exigir laço mútuo derrubaria avisos de guarda que deixou de ser laço (e ainda entrega); precisa da lista de guardas em todo aparelho." }, async () => {
  const w = makeWorld(OWNER);
  await send(w, "vx_estranha", OWNER, mesh.buildNoticeBody({ to: OWNER, requestId: "r", firstSeen: w.now }));
  assert.deepEqual(await as(w, OWNER, () => flow.pendingNotices()), []);
});
