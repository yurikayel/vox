/**
 * SUB-24a — modelo do pedido de teste: ops `CHECK_REQUEST`/`CHECK_REVEAL`, sigilo da CD por construção e vínculo da rolagem.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { isAuthorizedVttOp, projectStateForPlayer, reduceCampaign, replayCampaignOps } from "../client/js/dungeon/vtt-reducer.js";
import { filterOpForPlayer } from "../client/js/dungeon/vtt-sync.js";
import { buildCheckRequestOp, checkEntryText, normalizeCheckRequest } from "../client/js/dungeon/vtt-check-request.js";
import { recordFormulaRoll } from "../client/js/dungeon/dungeon-persistence.js";
import { renderChronicleEntry } from "../client/js/dungeon/screen-table-layout.js";

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

const lineOf = (state) => checkEntryText(state.chronicle.find((e) => e.badge === "Resultado"), state);
const revealed = (rolls, extra = {}) => run([op("CHECK_REQUEST", request({ dcHidden: true, dc: undefined, ...extra })), ...rolls, op("CHECK_REVEAL", { requestId: "req-1", dc: 14 })]);

test("revelação: rolagem pública vira ✓/✗ contra a CD revelada", () => {
  const s = revealed([roll("vx_a", 17, "public"), roll("vx_b", 9, "public")]);
  const r = s.checkRequestsById["req-1"];
  assert.equal(r.status, "revealed");
  assert.equal(r.dc, 14);
  assert.equal("results" in r, false);
  assert.equal(s.chronicle.at(-1).text, "Percepção · CD 14");
  assert.equal(lineOf(s), "Percepção · CD 14: Lia ✓ 17; Bran ✗ 9");
});

test("revelação: total igual à CD passa (limite)", () => {
  assert.match(lineOf(revealed([roll("vx_a", 14, "public"), roll("vx_b", 13, "public")])), /Lia ✓ 14; Bran ✗ 13/);
});

test("revelação: pedido com rolagem do Mestre mostra o mesmo texto para todos e nunca o total", () => {
  const s = revealed([roll("vx_a", 19, "gm"), roll("vx_b", 5, "gm")], { rollVisibility: "gm" });
  assert.equal(lineOf(s), "Percepção · CD 14: Alvo 1 resultado com o Mestre; Alvo 2 resultado com o Mestre");
  assert.doesNotMatch(lineOf(s), /19|5/);
});

test("revelação: a primeira rolagem pública vale, a nova é ignorada", () => {
  assert.match(lineOf(revealed([roll("vx_a", 3, "public"), roll("vx_a", 20, "public")])), /Lia ✗ 3; Alvo 2 não rolou/);
});

test("revelação: rolagem de outro pedido não conta", () => {
  assert.match(lineOf(revealed([roll("vx_a", 20, "public", "req-2")])), /Alvo 1 não rolou/);
});

test("revelação: rolagem depois da revelação não muda o resultado", () => {
  const s = run([op("CHECK_REQUEST", request()), op("CHECK_REVEAL", { requestId: "req-1" }), roll("vx_a", 20, "public")]);
  assert.match(lineOf(s), /Alvo 1 não rolou/);
});

test("revelação: a CD pública do pedido vence a do payload da revelação", () => {
  const s = run([op("CHECK_REQUEST", request()), op("CHECK_REVEAL", { requestId: "req-1", dc: 1 })]);
  assert.equal(s.checkRequestsById["req-1"].dc, 14);
});

test("determinismo: as mesmas ops em qualquer ordem de chegada dão o mesmo texto, igual ao replay", () => {
  const [req, a, b, rev] = [op("CHECK_REQUEST", request({ dcHidden: true, dc: undefined })), roll("vx_a", 17, "public"), roll("vx_b", 9, "public"), op("CHECK_REVEAL", { requestId: "req-1", dc: 14 })];
  const orders = [[req, a, b, rev], [req, b, rev, a], [req, rev, b, a]];
  orders.forEach((order) => assert.equal(lineOf(run(order)), "Percepção · CD 14: Lia ✓ 17; Bran ✗ 9", order.map((o) => o.type).join()));
  assert.equal(lineOf(replayCampaignOps(base(), [rev, b, a, req])), "Percepção · CD 14: Lia ✓ 17; Bran ✗ 9");
});

test("determinismo: o que o jogador recebe pelo filtro de envio dá o mesmo texto que o do Mestre", () => {
  const gmOps = [op("CHECK_REQUEST", request({ rollVisibility: "gm" })), roll("vx_a", 19, "gm"), roll("vx_b", 5, "gm"), op("CHECK_REVEAL", { requestId: "req-1", dc: 14 })];
  const seen = (viewer) => gmOps.map((o) => filterOpForPlayer(base(), o, viewer)).filter(Boolean);
  const texts = [lineOf(run(gmOps)), lineOf(run(seen("vx_a"))), lineOf(run(seen("vx_b")))];
  assert.deepEqual([...new Set(texts)].length, 1);
});

test("ordem: vale a primeira rolagem do log (lamport) mesmo que a outra chegue antes", () => {
  const first = roll("vx_a", 3, "public");
  const second = roll("vx_a", 20, "public");
  const s = run([op("CHECK_REQUEST", request()), second, first, op("CHECK_REVEAL", { requestId: "req-1" })]);
  assert.match(lineOf(s), /Lia ✗ 3/);
});

test("ordem: no mesmo lamport o opId desempata e decide o que veio antes da revelação", () => {
  const at = (type, payload, opId, actor = GM) => createVttOp({ type, payload, actor, lamport: 50, opId, ts: 1 });
  const rollAt = (opId, total) => at("ROLL_RECORDED", { speaker: "Lia", rollResult: { formula: "1d20", total, visibility: "public", requestId: "req-1" } }, opId, "vx_a");
  const req = createVttOp({ type: "CHECK_REQUEST", payload: request(), actor: GM, lamport: 49, opId: "op-0", ts: 1 });
  const rev = at("CHECK_REVEAL", { requestId: "req-1" }, "op-m");
  const s = run([req, rollAt("op-z", 20), rollAt("op-b", 5), rollAt("op-a", 15), rev]);
  assert.match(lineOf(s), /Lia ✓ 15/);
});

test("exibição: só a linha de Resultado de pedido revelado ganha os ✓/✗", () => {
  const s = revealed([roll("vx_a", 17, "public")]);
  const pedido = s.chronicle.find((e) => e.badge === "Pedido");
  assert.equal(checkEntryText(pedido, s), pedido.text);
  const open = run([op("CHECK_REQUEST", request())]);
  assert.equal(checkEntryText({ ...s.chronicle.find((e) => e.badge === "Resultado"), checkRequestId: "req-1" }, open), "Percepção · CD 14");
});

test("normalização: rótulo corta em 80 e alvos têm espaço aparado", () => {
  assert.equal(normalizeCheckRequest(request({ label: "x".repeat(100) })).label.length, 80);
  assert.deepEqual(normalizeCheckRequest(request({ targets: [" vx_a ", "vx_b"] })).targets, ["vx_a", "vx_b"]);
});

test("autoria: com requestId o autor é quem enviou a op, não o payload", () => {
  const forged = op("ROLL_RECORDED", { author: "vx_b", speaker: "Lia", rollResult: { formula: "1d20", total: 30, visibility: "public", requestId: "req-1" } }, "vx_a");
  const s = run([op("CHECK_REQUEST", request()), forged, roll("vx_b", 2, "public"), op("CHECK_REVEAL", { requestId: "req-1" })]);
  assert.equal(s.rolls[0].author, "vx_a");
  assert.match(lineOf(s), /Lia ✓ 30; Bran ✗ 2/);
});

test("exibição: a Crônica do jogador mostra as linhas do pedido e da revelação", () => {
  const s = revealed([roll("vx_a", 17, "public")]);
  const view = projectStateForPlayer(s, "player", "vx_a");
  const html = view.chronicle.map((e) => renderChronicleEntry(e, view)).join("");
  assert.match(html, /O Mestre pede Percepção · CD oculta/);
  assert.match(html, /Percepção · CD 14: Lia ✓ 17/);
});

test("redutor: payload bruto com dc e dcHidden não grava a CD (defesa em profundidade)", () => {
  const s = reduceCampaign(base(), op("CHECK_REQUEST", request({ dcHidden: true, dc: 14 })));
  assert.equal("dc" in s.checkRequestsById["req-1"], false);
});

test("fiação: recordFormulaRoll leva o requestId até a rolagem gravada", async () => {
  const sent = [];
  const state = { campaignDoc: base(), sheet: { name: "Lia" }, vttKeypair: { routeId: "vx_a" }, localActor: "vx_a", syncPeer: { dispatchOp: async (o) => (sent.push(o), null) } };
  await recordFormulaRoll(state, "1d20", { requestId: "req-1", store: { saveCampaign: async () => {}, listCampaigns: async () => [] } });
  assert.equal(sent[0]?.payload.rollResult.requestId, "req-1");
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
