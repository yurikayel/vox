import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const review = await import("../client/js/report-review.js");
const dmMsg = await import("../client/js/dm-messenger.js");

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

function signedReport(over = {}) {
  return {
    type: review.SIGNED_REPORT_TYPE, reportId: "rep_1", postId: "p1", communityId: "bairro",
    reason: "spam", ts: NOW - HOUR, author: "vx_ana", pubKey: {}, sig: "x", ...over,
  };
}

test("report-review - DM de denúncia: ida e volta, e o leitor antigo mostra texto e cartão", () => {
  const rec = { id: "rep_1", postId: "p1", communityId: "bairro", reason: "odio", detail: "  xingou  ", ts: NOW };
  const body = review.buildSignedReportBody(rec);
  assert.deepEqual(body, { type: "vox-report", reportId: "rep_1", postId: "p1", communityId: "bairro", reason: "odio", ts: NOW });
  assert.ok(!("detail" in body), "o texto livre não entra no corpo assinado");
  const msg = review.buildReportDmMessage(rec);
  const wire = review.serializeReportDm({ ...body, author: "vx_ana", pubKey: {}, sig: "s" }, msg);
  assert.equal(review.parseReportDm(wire).author, "vx_ana");
  const legacy = dmMsg.parseDmPayload(wire);
  assert.equal(legacy.kind, "message");
  assert.match(legacy.text, /^Denúncia: Discurso de ódio/);
  assert.match(legacy.text, /xingou$/);
  assert.equal(legacy.contextCard.type, "topic");
  assert.equal(legacy.contextCard.id, "p1");
});

test("report-review - parseReportDm recusa o que não é denúncia bem formada", () => {
  assert.equal(review.parseReportDm("oi"), null);
  assert.equal(review.parseReportDm(dmMsg.serializeDmReadReceipt({ upToTs: 5 })), null);
  const bad = (r) => review.serializeReportDm(signedReport(r));
  assert.equal(review.parseReportDm(bad({ reason: "inventado" })), null);
  assert.equal(review.parseReportDm(bad({ author: "" })), null);
  assert.equal(review.parseReportDm(bad({ communityId: "" })), null);
  assert.equal(review.parseReportDm('{"__vox_dm_v2":1,"kind":"report"'), null);
});

test("report-review - verifySignedReport exige assinatura válida e data plausível", async () => {
  const ok = async () => true;
  assert.equal(await review.verifySignedReport(signedReport(), { verify: ok, now: NOW }), true);
  assert.equal(await review.verifySignedReport(signedReport(), { verify: async () => false, now: NOW }), false);
  assert.equal(await review.verifySignedReport(signedReport({ ts: NOW - 8 * 24 * HOUR }), { verify: ok, now: NOW }), false);
  assert.equal(await review.verifySignedReport(signedReport({ ts: NOW + HOUR }), { verify: ok, now: NOW }), false);
  assert.equal(await review.verifySignedReport(signedReport(), { now: NOW }), false);
});

test("report-review - decideAutoArchive aplica as salvaguardas na ordem", () => {
  const base = { reportId: "rep_9", postId: "p9", reporter: "vx_ana", isMember: true, targetIsModerator: false };
  const pending = (i, over = {}) => ({ reportId: `r${i}`, postId: `x${i}`, reporter: "vx_ana", status: "pending", ...over });
  assert.deepEqual(review.decideAutoArchive({ ...base, cases: [] }), { archive: true, why: "ok" });
  assert.equal(review.decideAutoArchive({ ...base, cases: [pending(1, { reportId: "rep_9" })] }).why, "duplicate");
  assert.equal(review.decideAutoArchive({ ...base, isMember: false }).why, "not-member");
  assert.equal(review.decideAutoArchive({ ...base, targetIsModerator: true }).why, "moderator-target");
  assert.equal(review.decideAutoArchive({ ...base, cases: [pending(1, { postId: "p9", reporter: "vx_bia" })] }).why, "already-in-review");
  assert.equal(review.decideAutoArchive({ ...base, cases: [pending(1), pending(2), pending(3)] }).why, "too-many-pending");
  const restored = [1, 2, 3].map((i) => pending(i, { status: "restored", resolvedAt: i }));
  assert.equal(review.decideAutoArchive({ ...base, cases: restored }).why, "rejected-streak");
  const broken = [...restored, pending(4, { status: "kept", resolvedAt: 9 })];
  assert.equal(review.decideAutoArchive({ ...base, cases: broken }).archive, true, "uma denúncia mantida quebra a sequência");
  assert.ok(review.describeSkip("not-member").includes("membro"));
});

test("report-review - fila: caso, resolução por publicação e prazo", () => {
  const storage = memStorage();
  const archived = review.buildCase(signedReport(), { archive: true, why: "ok" }, NOW);
  assert.equal(archived.status, "pending");
  assert.equal(archived.reporter, "vx_ana");
  const manual = review.buildCase(signedReport({ reportId: "rep_2", reason: "crianca" }), { archive: false, why: "not-member" }, NOW);
  assert.equal(manual.status, "manual");
  assert.equal(manual.grave, true);
  review.addCase(archived, storage);
  review.addCase(manual, storage);
  assert.equal(review.openCasesForPost("p1", storage).length, 2);
  assert.equal(review.openCasesForCommunity("bairro", storage).length, 2);
  assert.equal(review.resolveCasesForPost("p1", "kept", { storage, now: NOW }), 2);
  assert.equal(review.openCasesForPost("p1", storage).length, 0);
  assert.throws(() => review.resolveCasesForPost("p1", "talvez", { storage }), /inválida/);
  assert.equal(review.describeDeadline(NOW, NOW + 43 * HOUR), "faltam 5 h");
  assert.equal(review.describeDeadline(NOW, NOW + 50 * HOUR), "venceu há 2 h");
});

test("review-banner - autor vê prazo; moderação vê motivos, alerta grave e botões", async () => {
  const banner = await import("../client/js/render/review-banner.js");
  const badges = await import("../client/js/render/topic-badges.js");
  const topic = { id: "p1", inReview: true, reviewSince: NOW };
  assert.equal(banner.renderReviewBannerHtml({ id: "p1" }), "");
  const author = banner.renderReviewBannerHtml(topic, { now: NOW + HOUR });
  assert.match(author, /Só você e a moderação/);
  assert.match(author, /faltam 47 h/);
  assert.ok(!author.includes("btn-review-restore"));
  const cases = [{ reason: "crianca", grave: true }, { reason: "spam", grave: false }];
  const modHtml = banner.renderReviewBannerHtml(topic, { isMod: true, topicId: "p1", communityId: "bairro", now: NOW, cases });
  assert.match(modHtml, /2 denúncias/);
  assert.match(modHtml, /Motivo grave/);
  assert.ok(modHtml.includes('class="btn btn-primary btn-sm btn-review-restore" data-id="p1" data-comm="bairro"'));
  assert.match(banner.renderArchivedTopicShellHtml(), /Publicação arquivada/);
  assert.match(badges.resolveTopicBadgesHtml({ inReview: true, isPinned: true }), /^<span class="badge-pill community-review-pill"/);
});
