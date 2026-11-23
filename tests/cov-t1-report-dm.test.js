/**
 * @file Cobertura de `app/report-dm.js` (lote T1): os caminhos com as dependências reais — envio assinado
 * pela DM, recebimento no aparelho de quem modera e o aviso ao moderador natural do denunciado.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installRelay, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as gql from "../client/js/graphql.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as review from "../client/js/report-review.js";
import { NATURAL_MOD_LAB_KEY } from "../client/js/app/natural-mod-flow.js";
import { sendReportToModerator, receiveReportDm } from "../client/js/app/report-dm.js";
import { person } from "./signer.js";

let me = "";
let myPub = null;
let seq = 0;

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
  myPub = (await cryptoDm.ensureDmKeys()).publicJwk;
});

afterEach(() => {
  restoreEnv();
  localStorage.removeItem(NATURAL_MOD_LAB_KEY);
  localStorage.removeItem(review.REVIEW_QUEUE_KEY);
});

const rec = (over = {}) => ({ id: `rep_t1_${++seq}`, postId: `post_t1_${seq}`, communityId: `com_t1_${seq}`, reason: "spam", detail: "", ts: Date.now(), ...over });

test("report-dm real — envia a denúncia assinada pela DM e guarda a mensagem no fio de quem denunciou", async () => {
  const moderator = `vx_mod_t1_${++seq}`;
  gql.cacheUserDmPub(moderator, myPub);
  const relay = installRelay(me);
  const r = rec();
  assert.equal(await sendReportToModerator(me, moderator, r), "queued-relay");
  assert.equal(relay.pushed.length, 1);
  assert.equal(relay.pushed[0].to, moderator);
  const [saved] = await cacheNode.getDmMessages(moderator);
  assert.match(saved.text, /^Denúncia:/);
  assert.equal(saved.id, relay.pushed[0].env.id);
  assert.equal(saved.contextCard.id, r.postId);
});

test("report-dm real — moderador sem chave de DM conhecida: 'no-key' e nada é enviado nem guardado", async () => {
  const moderator = `vx_mod_sem_chave_${++seq}`;
  const relay = installRelay(me);
  assert.equal(await sendReportToModerator(me, moderator, rec()), "no-key");
  assert.equal(relay.pushed.length, 0);
  assert.deepEqual(await cacheNode.getDmMessages(moderator), []);
});

/** Comunidade cujo dono é este aparelho e um post de outra pessoa, para a denúncia ter onde cair. */
async function seedCommunityWithPost(r, postAuthor) {
  await cacheNode.saveLocalPost({ id: `c_${r.communityId}`, type: "community", communityId: r.communityId, title: "Comunidade T1", author: me, ts: 1000 });
  await cacheNode.saveLocalPost({ id: r.postId, type: "topic", communityId: r.communityId, title: "Post", body: "x", author: postAuthor, ts: 2000 });
}

test("report-dm real — denúncia assinada de membro vira caso e arquiva o post; replay não repete", async () => {
  const reporter = await person();
  const r = rec();
  await seedCommunityWithPost(r, "vx_autor_t1");
  const signed = await reporter.sign(review.buildSignedReportBody(r));
  const kase = await receiveReportDm({ from: reporter.routeId }, signed);
  assert.ok(kase, "o caso foi criado");
  assert.equal(kase.reportId, r.id);
  assert.equal(review.listCases().filter((c) => c.reportId === r.id).length, 1);
  assert.equal(await receiveReportDm({ from: reporter.routeId }, signed), null, "mesma denúncia de novo é ignorada");
  assert.equal(review.listCases().filter((c) => c.reportId === r.id).length, 1);
});

test("report-dm real — assinatura que não confere não abre caso", async () => {
  const reporter = await person();
  const r = rec();
  await seedCommunityWithPost(r, "vx_autor_t1");
  const signed = await reporter.sign(review.buildSignedReportBody(r));
  assert.equal(await receiveReportDm({}, { ...signed, reason: "assedio" }), null);
  assert.equal(review.listCases().some((c) => c.reportId === r.id), false);
});

test("report-dm real — com a flag de moderador natural ligada o caso continua sendo criado", async () => {
  localStorage.setItem(NATURAL_MOD_LAB_KEY, "1");
  installRelay(me);
  const reporter = await person();
  const r = rec();
  await seedCommunityWithPost(r, "vx_autor_natural");
  const kase = await receiveReportDm({}, await reporter.sign(review.buildSignedReportBody(r)));
  assert.equal(kase.reportId, r.id);
  await settle(80);
});
