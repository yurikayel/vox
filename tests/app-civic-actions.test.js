/**
 * Voto cívico (`app/civic-actions.js`): validação, assinatura, id determinístico
 * (um voto por pessoa) e propagação por gossip.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const localAccount = await import("../client/js/identity/local-account.js");
const cacheNode = await import("../client/js/cache-node.js");
const actions = await import("../client/js/app/civic-actions.js");

const BODY = "Argumento com bem mais de quarenta caracteres para valer.";
const pauta = { id: "pauta_1", title: "Reforma da praça", body: BODY, author: "vx_autor", communityId: "praca", civicTag: "[Pauta]" };
const enquete = { ...pauta, id: "enq_1", civicTag: "[Enquete]", body: `${BODY}\n- Sim\n- Não\n- Talvez` };

async function freshAccount() {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
}

test("castCivicVote: post fora dos requisitos cívicos é recusado e nada é gravado", async () => {
  await freshAccount();
  await assert.rejects(() => actions.castCivicVote({ id: "x", title: "oi", body: "curto" }, "vx_a", "concordo"), /requisitos cívicos/);
  await assert.rejects(() => actions.castCivicVote({ ...pauta, communityId: "" }, "vx_a", "concordo"), /requisitos cívicos/);
  assert.deepEqual(await actions.loadCivicVotes(), []);
});

test("castCivicVote: escolha fora das opções é recusada", async () => {
  await freshAccount();
  await assert.rejects(() => actions.castCivicVote(pauta, "vx_a", "talvez"), /Escolha inválida/);
  await assert.rejects(() => actions.castCivicVote(enquete, "vx_a", "opt:3"), /Escolha inválida/);
  await assert.rejects(() => actions.castCivicVote(enquete, "vx_a", "concordo"), /Escolha inválida/);
  assert.deepEqual(await actions.loadCivicVotes(), []);
});

test("castCivicVote: voto válido sai assinado, com id por (post, autor), e fica salvo", async () => {
  await freshAccount();
  const routeId = await localAccount.getRouteId();
  const signed = await actions.castCivicVote(pauta, "vx_fallback", "concordo");
  assert.equal(signed.type, "civic-vote");
  assert.equal(signed.postId, "pauta_1");
  assert.equal(signed.communityId, "praca");
  assert.equal(signed.choice, "concordo");
  assert.equal(signed.author, routeId);
  assert.equal(signed.id, `civicvote_pauta_1_${routeId}`);
  assert.ok(signed.sig || signed.signature, "carrega assinatura");
  const saved = await actions.loadCivicVotes();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].choice, "concordo");
});

test("castCivicVote: votar de novo substitui o voto anterior (1 voto por pessoa)", async () => {
  await freshAccount();
  const first = await actions.castCivicVote(enquete, "vx_a", "opt:0");
  const second = await actions.castCivicVote(enquete, "vx_a", "opt:2");
  assert.equal(first.id, second.id);
  assert.ok(second.editedAt >= first.editedAt);
  const saved = await actions.loadCivicVotes();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].choice, "opt:2");
});

test("castCivicVote: votos em posts diferentes não se sobrepõem", async () => {
  await freshAccount();
  await actions.castCivicVote(pauta, "vx_a", "discordo");
  await actions.castCivicVote(enquete, "vx_a", "opt:1");
  const saved = await actions.loadCivicVotes();
  assert.deepEqual(saved.map((v) => v.postId).sort(), ["enq_1", "pauta_1"]);
});
