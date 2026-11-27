/**
 * SUB-24a — modelo do pedido de teste: ops `CHECK_REQUEST`/`CHECK_REVEAL`, sigilo da CD por construção e vínculo da rolagem.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { isAuthorizedVttOp, projectStateForPlayer, reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { filterOpForPlayer } from "../client/js/dungeon/vtt-sync.js";
import { buildCheckRequestOp, normalizeCheckRequest } from "../client/js/dungeon/vtt-check-request.js";

const GM = "vx_gm";
const base = () => createCampaign({ id: "camp-24", name: "Pedido", gmRouteId: GM });
let lamport = 0;
const op = (type, payload, actor = GM) => createVttOp({ type, payload, actor, lamport: ++lamport, ts: 1000 + lamport });
const request = (extra = {}) => ({ requestId: "req-1", skillId: "percepcao", label: "Percepção", targets: ["vx_a", "vx_b"], dcHidden: false, dc: 14, rollVisibility: "public", ...extra });
const roll = (author, total, visibility, requestId = "req-1") =>
  op("ROLL_RECORDED", { speaker: author === "vx_a" ? "Lia" : "Bran", rollResult: { formula: "1d20", total, visibility, requestId } }, author);
const run = (ops, state = base()) => ops.reduce(reduceCampaign, state);

test("pedido: o Mestre abre o pedido e a Crônica ganha a linha pública", () => {
  const s = run([op("CHECK_REQUEST", request())]);
  assert.equal(s.checkRequestsById["req-1"].status, "open");
  assert.equal(s.chronicle.at(-1).checkRequestId, "req-1");
  assert.match(s.chronicle.at(-1).text, /Percepção · CD 14/);
});

test("pedido: jogador não pode pedir nem revelar", () => {
  const s = base();
  assert.equal(isAuthorizedVttOp(s, op("CHECK_REQUEST", request(), "vx_a")), false);
  assert.equal(isAuthorizedVttOp(s, op("CHECK_REVEAL", { requestId: "req-1" }, "vx_a")), false);
  assert.equal(isAuthorizedVttOp(s, op("CHECK_REQUEST", request())), true);
});

test("sigilo: pedido com CD oculta não grava a CD no estado, na projeção nem no envio", () => {
  const built = { ...buildCheckRequestOp(request({ dcHidden: true, dc: 14 })), actor: GM };
  const sent = filterOpForPlayer(base(), op(built.type, built.payload), "vx_a");
  const s = run([op(built.type, built.payload)]);
  assert.equal(s.checkRequestsById["req-1"].dcHidden, true);
  assert.equal("dc" in s.checkRequestsById["req-1"], false);
  assert.doesNotMatch(JSON.stringify(projectStateForPlayer(s, "player", "vx_a")), /"dc":14/);
  assert.doesNotMatch(JSON.stringify(sent), /"dc":14/);
  assert.match(s.chronicle.at(-1).text, /CD oculta/);
});

test("revelação: rolagem pública vira ✓/✗ contra a CD revelada", () => {
  const s = run([op("CHECK_REQUEST", request({ dcHidden: true, dc: undefined })), roll("vx_a", 17, "public"), roll("vx_b", 9, "public"), op("CHECK_REVEAL", { requestId: "req-1", dc: 14 })]);
  const r = s.checkRequestsById["req-1"];
  assert.equal(r.status, "revealed");
  assert.equal(r.dc, 14);
  assert.deepEqual(r.results.map((x) => x.outcome), ["pass", "fail"]);
  assert.match(s.chronicle.at(-1).text, /CD 14: Lia ✓ 17; Bran ✗ 9/);
});

test("revelação: rolagem do Mestre não mostra o total e quem não rolou aparece", () => {
  const s = run([op("CHECK_REQUEST", request({ rollVisibility: "gm" })), roll("vx_a", 19, "gm"), op("CHECK_REVEAL", { requestId: "req-1" })]);
  const text = s.chronicle.at(-1).text;
  assert.match(text, /Lia resultado com o Mestre/);
  assert.match(text, /Alvo 2 não rolou/);
  assert.doesNotMatch(text, /19/);
});

test("vínculo: ROLL_RECORDED com requestId chega em state.rolls", () => {
  const s = run([roll("vx_a", 11, "public", "req-9")]);
  assert.equal(s.rolls[0].requestId, "req-9");
  const plain = run([op("ROLL_RECORDED", { rollResult: { formula: "1d20", total: 3 } })]);
  assert.equal("requestId" in plain.rolls[0], false);
});

test("revelação: segunda revelação e CD fora de 1–60 são ignoradas", () => {
  const open = run([op("CHECK_REQUEST", request({ dcHidden: true, dc: undefined }))]);
  assert.equal(reduceCampaign(open, op("CHECK_REVEAL", { requestId: "req-1", dc: 61 })).checkRequestsById["req-1"].status, "open");
  assert.equal(reduceCampaign(open, op("CHECK_REVEAL", { requestId: "req-1", dc: 0 })).checkRequestsById["req-1"].status, "open");
  const done = reduceCampaign(open, op("CHECK_REVEAL", { requestId: "req-1", dc: 12 }));
  const again = reduceCampaign(done, op("CHECK_REVEAL", { requestId: "req-1", dc: 30 }));
  assert.equal(again.checkRequestsById["req-1"].dc, 12);
  assert.equal(reduceCampaign(base(), op("CHECK_REVEAL", { requestId: "nada", dc: 12 })).chronicle.length, 0);
});

test("pedido: duplicado é ignorado", () => {
  const once = run([op("CHECK_REQUEST", request())]);
  const twice = reduceCampaign(once, op("CHECK_REQUEST", request({ dc: 30, label: "Outro" })));
  assert.equal(twice.checkRequestsById["req-1"].dc, 14);
  assert.equal(twice.chronicle.length, once.chronicle.length);
});

test("normalização: valida id, perícia, alvos (1–8, únicos), CD e rótulo", () => {
  assert.equal(normalizeCheckRequest(request({ requestId: "!!" })), null);
  assert.equal(normalizeCheckRequest(request({ skillId: "Má Perícia" })), null);
  assert.equal(normalizeCheckRequest(request({ targets: [] })), null);
  assert.equal(normalizeCheckRequest(request({ targets: ["a", "a"] })), null);
  assert.equal(normalizeCheckRequest(request({ targets: Array.from({ length: 9 }, (_, i) => `t${i}`) })), null);
  assert.equal(normalizeCheckRequest(request({ targets: Array.from({ length: 8 }, (_, i) => `t${i}`) })).targets.length, 8);
  assert.equal(normalizeCheckRequest(request({ dc: 0 })), null);
  assert.equal(normalizeCheckRequest(request({ dc: 61 })), null);
  assert.equal(normalizeCheckRequest(request({ dc: 1.5 })), null);
  assert.equal(normalizeCheckRequest(request({ dc: 60 })).dc, 60);
  assert.equal(normalizeCheckRequest(request({ label: "  " })).label, "percepcao");
  assert.equal(normalizeCheckRequest(request({ rollVisibility: "blind" })).rollVisibility, "public");
  assert.equal(normalizeCheckRequest(request({ rollVisibility: "gm" })).rollVisibility, "gm");
});

test("construtor: com CD oculta a op sai sem dc; inválido vira null", () => {
  const built = buildCheckRequestOp(request({ dcHidden: true, dc: 14 }));
  assert.equal(built.type, "CHECK_REQUEST");
  assert.equal("dc" in built.payload, false);
  assert.equal(buildCheckRequestOp(request({ targets: [] })), null);
});
