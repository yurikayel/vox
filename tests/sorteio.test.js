import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const s = await import("../client/js/sorteio.js");
const flow = await import("../client/js/app/sorteio-flow.js");

const NOW = Date.UTC(2026, 11, 1, 12);
const META = { owner: "vx_dono", moderators: "vx_mod" };
const MEMBERS = ["vx_ana", "vx_bia", "vx_caio", "vx_davi", "vx_eva", "vx_dono"];
const as = (author, body) => ({ ...body, author, sig: "s" });

async function setup() {
  const draw = as("vx_dono", { ...(await s.buildSorteio({ communityId: "c1", title: "Comissão de contas", seats: 2, members: MEMBERS, commitUntil: NOW + 1000, cycle: "2026-12" }, NOW)), id: "d1" });
  const secrets = { vx_ana: "a".repeat(64), vx_bia: "b".repeat(64), vx_caio: "c".repeat(64) };
  const commits = await Promise.all(Object.entries(secrets).map(async ([who, sec]) => as(who, await s.buildCommit(draw, sec, NOW))));
  const close = as("vx_dono", s.buildClose(draw, commits, NOW + 2000));
  const reveals = Object.entries(secrets).map(([who, sec]) => as(who, s.buildReveal(draw, sec, NOW + 3000)));
  return { draw, secrets, commits, close, reveals };
}

test("sorteio — lista congelada, ordenada e com hash; rascunho validado", async () => {
  const { draw } = await setup();
  assert.equal(draw.roster, "vx_ana,vx_bia,vx_caio,vx_davi,vx_dono,vx_eva");
  assert.match(draw.rosterHash, /^[0-9a-f]{64}$/);
  for (const value of Object.values(draw)) assert.notEqual(typeof value, "object");
  assert.deepEqual(s.validateSorteioDraft({ title: "x", seats: 9, members: ["vx_ana"], commitUntil: NOW - 1 }, NOW), ["title", "seats", "roster", "commitUntil"]);
  await assert.rejects(() => s.buildSorteio({ communityId: "c1", title: "Ok ok", seats: 6, members: MEMBERS, commitUntil: NOW + 1 }, NOW), /seats/);
});

test("sorteio — compromisso só com o hash; o fecho vale o primeiro da moderação", async () => {
  const { draw, secrets, commits, close } = await setup();
  assert.ok(!JSON.stringify(commits).includes(secrets.vx_ana));
  assert.equal(s.decodeCommits(close.commits).length, 3);
  const late = as("vx_mod", s.buildClose(draw, commits.slice(0, 1), NOW + 9000));
  const fake = as("vx_ana", s.buildClose(draw, [], NOW));
  assert.equal(s.firstByModeration([late, fake, close], s.CLOSE_TYPE, draw, META), close);
});

test("sorteio — mesmo resultado em qualquer ordem; muda se uma revelação muda", async () => {
  const { draw, close, reveals } = await setup();
  const { valid } = await s.matchReveals(close, reveals);
  const tally = as("vx_dono", s.buildTally(draw, valid, NOW + 4000));
  const a = await s.sorteioState(draw, { close, reveals, tally });
  const b = await s.sorteioState(draw, { close, reveals: [...reveals].reverse(), tally });
  assert.equal(a.phase, "sorteado");
  assert.deepEqual(a.winners, b.winners);
  assert.equal(new Set(a.winners).size, 2);
  assert.ok(a.winners.every((w) => MEMBERS.includes(w)));
  const twoOnly = as("vx_dono", { ...tally, revealed: "vx_ana,vx_bia" });
  assert.notEqual((await s.sorteioState(draw, { close, reveals, tally: twoOnly })).seed, a.seed);
});

test("sorteio — segredo falso não conta; quem não revelou e revelação ignorada aparecem", async () => {
  const { draw, close, reveals } = await setup();
  const forged = [reveals[0], reveals[1], as("vx_caio", s.buildReveal(draw, "f".repeat(64)))];
  const { valid, missing } = await s.matchReveals(close, forged);
  assert.deepEqual([...valid.keys()].sort(), ["vx_ana", "vx_bia"]);
  assert.deepEqual(missing, ["vx_caio"]);
  const tally = as("vx_dono", { ...s.buildTally(draw, new Map([["vx_ana", 1], ["vx_bia", 1]])) });
  const state = await s.sorteioState(draw, { close, reveals, tally });
  assert.deepEqual(state.ignored, ["vx_caio"]);
});

test("sorteio — fases: compromissos, sem testemunhas e esperando apuração", async () => {
  const { draw, commits, reveals } = await setup();
  assert.equal((await s.sorteioState(draw)).phase, "compromissos");
  const lonely = as("vx_dono", s.buildClose(draw, commits.slice(0, 1)));
  assert.equal((await s.sorteioState(draw, { close: lonely })).phase, "sem-testemunhas");
  const close = as("vx_dono", s.buildClose(draw, commits));
  const waiting = await s.sorteioState(draw, { close, reveals: reveals.slice(0, 2) });
  assert.equal(waiting.phase, "revelacao");
  assert.equal(waiting.revealed, 2);
});

test("sorteio — tela: testemunhar, revelar com segredo guardado, apurar e resultado", async () => {
  const { draw, commits, close, reveals } = await setup();
  const open = { draw, close: null, state: { phase: "compromissos", witnesses: 0 }, commits, reveals: [] };
  const member = flow.renderSorteioCard(open, { isMod: false, routeId: "vx_davi", secrets: {} });
  assert.ok(member.includes('data-sorteio-action="testemunhar"'));
  assert.ok(!member.includes('data-sorteio-action="fechar"'));
  assert.ok(flow.renderSorteioCard(open, { isMod: true, routeId: "vx_dono", secrets: {} }).includes("Fechar compromissos (3)"));
  const revealing = { ...open, close, state: await s.sorteioState(draw, { close, reveals: [] }) };
  assert.ok(flow.renderSorteioCard(revealing, { routeId: "vx_ana", secrets: { d1: "x" } }).includes('data-sorteio-action="revelar"'));
  assert.ok(!flow.renderSorteioCard(revealing, { routeId: "vx_ana", secrets: {} }).includes('data-sorteio-action="revelar"'));
  const { valid } = await s.matchReveals(close, reveals);
  const done = { ...revealing, reveals, state: await s.sorteioState(draw, { close, reveals, tally: as("vx_dono", s.buildTally(draw, valid)) }) };
  const html = flow.renderSorteioCard(done, { routeId: "vx_ana", secrets: {} });
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.ok(html.includes("qualquer aparelho recalcula"));
  assert.equal(flow.renderSorteiosHtml([], { isMod: false }), "");
});
