import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCivicPost,
  resolveCivicTag,
  parsePollOptions,
  tallyCivicVotes,
  splitFeedBySphere,
  civicChoicesFor,
  isValidCivicChoice,
} from "../client/js/civic-post.js";
import { renderCivicBlock, renderCivicPendingNote, renderCivicFeedIntro } from "../client/js/render/civic-block.js";

const ARG = "Precisamos de iluminação nas praças do bairro para garantir segurança à noite.";

function pauta(extra = {}) {
  return { id: "p1", author: "vx_ana", communityId: "pinheiros", civicTag: "[Pauta]", title: "Iluminação das praças", body: ARG, ...extra };
}

test("civic-post — tag cívica vem do campo, do prefixo do título ou de hashtag", () => {
  assert.equal(resolveCivicTag({ civicTag: "[Ideia]" }), "[Ideia]");
  assert.equal(resolveCivicTag({ title: "[Debate Geral] Ciclovias" }), "[Debate Geral]");
  assert.equal(resolveCivicTag({ body: "Vamos votar? #Votação" }), "[Pauta]");
  assert.equal(resolveCivicTag({ body: "Foto do almoço #domingo" }), "");
  assert.equal(resolveCivicTag({ civicTag: "[Bug]" }), "", "[Bug] é técnico, não cívico");
});

test("civic-post — só é cívico com tag E todos os requisitos", () => {
  assert.equal(classifyCivicPost(pauta()).isCivic, true);
  assert.deepEqual(classifyCivicPost({ ...pauta(), civicTag: "" }).missing, ["tag"]);
  assert.deepEqual(classifyCivicPost(pauta({ title: "Luz" })).missing, ["title"]);
  assert.deepEqual(classifyCivicPost(pauta({ body: "curto" })).missing, ["body"]);
  assert.deepEqual(classifyCivicPost(pauta({ communityId: "" })).missing, ["circle"]);
  assert.deepEqual(classifyCivicPost(pauta({ author: "", owner: "" })).missing, ["author"]);
  assert.equal(classifyCivicPost(pauta({ isExternal: true })).isCivic, false, "post do Bluesky não vira cívico");
});

test("civic-post — enquete exige de 2 a 6 opções e vira escolhas opt:N", () => {
  const body = `${ARG}\n- Praça Benedito Calixto\n- Largo da Batata\n* Praça do Pôr do Sol`;
  assert.deepEqual(parsePollOptions(body), ["Praça Benedito Calixto", "Largo da Batata", "Praça do Pôr do Sol"]);
  const ok = classifyCivicPost(pauta({ civicTag: "[Enquete]", body }));
  assert.equal(ok.isCivic, true);
  assert.deepEqual(civicChoicesFor(ok).map((c) => c.key), ["opt:0", "opt:1", "opt:2"]);
  assert.equal(isValidCivicChoice(ok, "opt:2"), true);
  assert.equal(isValidCivicChoice(ok, "concordo"), false);
  assert.deepEqual(classifyCivicPost(pauta({ civicTag: "[Enquete]", body: `${ARG}\n- só uma` })).missing, ["options"]);
});

test("civic-post — apuração conta 1 voto por pessoa (o mais recente)", () => {
  const votes = [
    { postId: "p1", author: "vx_a", choice: "concordo", ts: 1 },
    { postId: "p1", author: "vx_a", choice: "discordo", ts: 5, editedAt: 5 },
    { postId: "p1", author: "vx_b", choice: "concordo", ts: 2 },
    { postId: "p2", author: "vx_b", choice: "abstencao", ts: 3 },
  ];
  const t = tallyCivicVotes(votes, "vx_a").get("p1");
  assert.equal(t.total, 2);
  assert.deepEqual(t.counts, { discordo: 1, concordo: 1 });
  assert.equal(t.mine, "discordo");
});

test("civic-post — feed separa Social e Cívico; pendências só nos próprios posts", () => {
  const posts = [
    pauta(),
    { id: "s1", author: "vx_b", body: "Bom dia, vizinhança!", communityId: "geral" },
    pauta({ id: "own", title: "Luz", isOwnLocalPost: true }),
    pauta({ id: "other", title: "Luz" }),
  ];
  const { social, civic } = splitFeedBySphere(posts, { votes: [{ postId: "p1", author: "vx_z", choice: "concordo", ts: 1 }] });
  assert.deepEqual(civic.map((p) => p.id), ["p1"]);
  assert.equal(civic[0].civicTally.total, 1);
  assert.deepEqual(social.map((p) => p.id), ["s1", "own", "other"]);
  assert.deepEqual(social.find((p) => p.id === "own").civicPending, ["title"]);
  assert.equal(social.find((p) => p.id === "other").civicPending, undefined);
});

test("civic-block — posicionamento com apuração, voto próprio e link para votação formal", () => {
  const [post] = splitFeedBySphere([pauta()], {
    votes: [{ postId: "p1", author: "vx_me", choice: "concordo", ts: 1 }, { postId: "p1", author: "vx_x", choice: "discordo", ts: 1 }],
    me: "vx_me",
  }).civic;
  const html = renderCivicBlock(post);
  assert.ok(html.includes('data-choice="concordo"') && html.includes('data-choice="abstencao"'));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes("50% · 1"));
  assert.ok(html.includes("2 votos assinados"));
  assert.ok(html.includes('href="#/compose/proposal?c=pinheiros"'));
  assert.equal(renderCivicBlock({ id: "x" }), "", "post social não ganha bloco cívico");
});

test("civic-block — pendência lista requisitos e intro da aba mostra regras", () => {
  const note = renderCivicPendingNote({ civicPending: ["title", "circle"] });
  assert.ok(note.includes("Título com pelo menos 8 caracteres"));
  assert.ok(note.includes("Publicado em um círculo"));
  assert.equal(renderCivicPendingNote({}), "");
  const intro = renderCivicFeedIntro();
  assert.ok(intro.includes("Tag cívica"));
  assert.ok(intro.includes('href="#/compose/topic"'));
});
