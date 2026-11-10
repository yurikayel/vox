import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const reportDm = await import("../client/js/app/report-dm.js");
const review = await import("../client/js/report-review.js");
const reviewFlow = await import("../client/js/app/report-review-flow.js");
const localAccount = await import("../client/js/local-account.js");

const NOW = 1_800_000_000_000;

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

function signed(over = {}) {
  return {
    type: "vox-report", reportId: "rep_1", postId: "p1", communityId: "bairro",
    reason: "spam", ts: NOW - 1000, author: "vx_ana", pubKey: {}, sig: "s", ...over,
  };
}

function receiveDeps(over = {}) {
  const calls = { dispatched: [], notified: [] };
  const deps = {
    verify: async () => true,
    getSelves: async () => ["D-carteira", "vx_dono"],
    getCommunity: async (id) => ({ id, owner: "vx_dono", moderators: "vx_mod2" }),
    getPost: async (id) => ({ id, owner: "vx_autor" }),
    checkMembership: async () => true,
    dispatchModAction: async (...args) => calls.dispatched.push(args),
    notify: (kase) => calls.notified.push(kase),
    storage: memStorage(),
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}

test("report-dm - moderador recebe denúncia válida e arquiva para todos só pela malha", async () => {
  const { deps, calls } = receiveDeps();
  const kase = await reportDm.receiveReportDm({ from: "vx_ana" }, signed(), deps);
  assert.equal(kase.status, "pending");
  assert.deepEqual(calls.dispatched, [["bairro", "review-hide", "p1", { upload: false }]]);
  assert.match(reportDm.describeReceivedCase(kase), /arquivada para todos/);
  assert.equal(review.listCases(deps.storage).length, 1);
  assert.equal(await reportDm.receiveReportDm({ from: "vx_ana" }, signed(), deps), null, "mesma denúncia de novo não conta duas vezes");
  assert.equal(calls.dispatched.length, 1);
});

test("report-dm - salvaguardas: não membro e post de moderador viram caso manual, sem arquivar", async () => {
  const notMember = receiveDeps({ checkMembership: async () => false });
  const k1 = await reportDm.receiveReportDm({}, signed(), notMember.deps);
  assert.equal(k1.why, "not-member");
  assert.equal(notMember.calls.dispatched.length, 0);
  assert.match(reportDm.describeReceivedCase(k1), /não arquivou sozinha: quem denunciou não é membro/);

  const modTarget = receiveDeps({ getPost: async (id) => ({ id, author: "vx_mod2" }) });
  const k2 = await reportDm.receiveReportDm({}, signed(), modTarget.deps);
  assert.equal(k2.why, "moderator-target");
  assert.equal(modTarget.calls.dispatched.length, 0);
});

test("report-dm - recusa assinatura inválida e aparelho que não modera a comunidade", async () => {
  const forged = receiveDeps({ verify: async () => false });
  assert.equal(await reportDm.receiveReportDm({}, signed(), forged.deps), null);
  const notMod = receiveDeps({ getSelves: async () => ["vx_outra", ""] });
  assert.equal(await reportDm.receiveReportDm({}, signed(), notMod.deps), null);
  assert.equal(review.listCases(notMod.deps.storage).length, 0);
  const noMeta = receiveDeps({ getCommunity: async () => null });
  assert.equal(await reportDm.receiveReportDm({}, signed(), noMeta.deps), null);
});

test("report-dm - quarta denúncia pendente da mesma pessoa não arquiva", async () => {
  const { deps, calls } = receiveDeps();
  for (const i of [1, 2, 3, 4]) {
    await reportDm.receiveReportDm({}, signed({ reportId: `rep_${i}`, postId: `p${i}` }), deps);
  }
  assert.equal(calls.dispatched.length, 3);
  assert.equal(calls.notified.at(-1).why, "too-many-pending");
});

test("report-dm - quem denuncia envia a denúncia assinada e guarda no próprio fio", async () => {
  const sent = {};
  const deps = {
    getDmPub: async () => ({ kty: "EC" }),
    sign: async (body) => ({ ...body, author: "vx_ana", pubKey: {}, sig: "s" }),
    seal: async (_pub, text, meta) => { sent.text = text; return { id: "dm_1", ts: NOW, ...meta }; },
    dispatch: async () => "delivered",
    saveDm: async (msg) => { sent.saved = msg; },
  };
  const rec = { id: "rep_1", postId: "p1", communityId: "bairro", reason: "spam", detail: "", ts: NOW };
  assert.equal(await reportDm.sendReportToModerator("vx_ana", "vx_dono", rec, deps), "delivered");
  assert.equal(review.parseReportDm(sent.text).postId, "p1");
  assert.equal(sent.saved.peerAddress, "vx_dono");
  assert.equal(sent.saved.contextCard.id, "p1");
  assert.equal(await reportDm.sendReportToModerator("vx_ana", "vx_dono", rec, { ...deps, getDmPub: async () => null }), "no-key");
});

test("report-dm - assinatura real da conta local passa na verificação e adulterada não", async () => {
  const body = review.buildSignedReportBody({ id: "rep_r", postId: "p1", communityId: "bairro", reason: "spam", ts: Date.now() });
  const real = await localAccount.signPayload(body);
  assert.equal(await review.verifySignedReport(real, { verify: localAccount.verifyPayload }), true);
  const tampered = { ...real, postId: "p2" };
  assert.equal(await review.verifySignedReport(tampered, { verify: localAccount.verifyPayload }), false);
});

test("report-review-flow - decisão do moderador publica a ação e fecha os casos", async () => {
  const storage = memStorage();
  review.addCase(review.buildCase(signed(), { archive: true, why: "ok" }, NOW), storage);
  const sentActions = [];
  const dispatch = async (...args) => sentActions.push(args);
  await reviewFlow.decideReview("bairro", "p1", "restored", { dispatch, storage, now: NOW });
  assert.deepEqual(sentActions[0], ["bairro", "unhide", "p1", { upload: false }]);
  assert.equal(review.listCases(storage)[0].status, "restored");
  await reviewFlow.decideReview("bairro", "p1", "kept", { dispatch, storage, now: NOW });
  assert.deepEqual(sentActions[1], ["bairro", "hide", "p1", { upload: true }]);
  await assert.rejects(() => reviewFlow.decideReview("", "p1", "kept", { dispatch, storage }), /Revisão sem/);
});
