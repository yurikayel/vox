import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const view = await import("../client/js/render/aviso.js");
const flow = await import("../client/js/app/aviso-flow.js");
const { parseRoute } = await import("../client/js/app/route-parse.js");

const NOW = Date.UTC(2026, 10, 11, 12);
const item = (extra = {}) => ({
  aviso: { id: "a1", avisoKind: "convocacao", title: "Assembleia <b>já</b>", body: "Pauta", eventAt: NOW, eventPlace: "Salão", avisoState: "ativo", ...extra },
  code: "A7F3",
  tally: { members: { ciente: 0, vou: 3, talvez: 0, "nao-vou": 1 }, outsiders: { ciente: 0, vou: 1, talvez: 0, "nao-vou": 0 }, total: 4 },
  count: { countCiente: 0, countVou: 12, countTalvez: 2, countNaoVou: 0 },
  myChoice: "vou",
});

test("aviso-ui — cartão escapa o texto, mostra código, contagens e a escolha", () => {
  const html = view.renderAvisoCard(item(), { canRespond: true });
  assert.ok(html.includes("Assembleia &lt;b&gt;já&lt;/b&gt;"));
  assert.ok(html.includes("<strong>A7F3</strong>"));
  assert.ok(html.includes("No Vox:</strong> 🙋 Vou 3 · ❌ Não vou 1"));
  assert.ok(html.includes("De fora do grupo:</strong> 🙋 Vou 1"));
  assert.ok(html.includes("Contado no WhatsApp:</strong> 🙋 Vou 12 · 🤔 Talvez 2"));
  assert.match(html, /is-active" data-aviso-action="responder" data-aviso-id="a1" data-choice="vou"/);
  assert.ok(!html.includes("Colar respostas"));
});

test("aviso-ui — moderação vê ferramentas; informe só tem Ciente; encerrado não responde", () => {
  const mod = view.renderAvisoCard(item(), { isMod: true, canRespond: true });
  assert.ok(mod.includes("Colar respostas do WhatsApp") && mod.includes("Cancelar ou corrigir"));
  const informe = view.renderAvisoCard(item({ eventAt: undefined, avisoKind: "informe" }), { canRespond: true });
  assert.equal((informe.match(/data-choice=/g) || []).length, 1);
  const closed = view.renderAvisoCard(item({ avisoState: "encerrado" }), { isMod: true, canRespond: true });
  assert.ok(closed.includes("<em>Encerrado</em>") && !closed.includes("data-aviso-action"));
});

test("aviso-ui — folha de envio: link de conferência só sob demanda", () => {
  const sheet = { innerHTML: "", hidden: true };
  view.renderShareSheet(sheet, { avisoId: "a1", text: "📣 Aviso" });
  assert.ok(sheet.innerHTML.includes(`https://wa.me/?text=${encodeURIComponent("📣 Aviso")}`));
  assert.ok(sheet.innerHTML.includes("Gerar link de conferência") && !sheet.innerHTML.includes("aviso.html"));
  view.renderShareSheet(sheet, { avisoId: "a1", text: "📣 Aviso", linkMessage: "🔒 Conferir: https://x/aviso.html#v=1" });
  assert.ok(sheet.innerHTML.includes("Enviar o link de conferência"));
  assert.equal(sheet.hidden, false);
});

test("aviso-flow — membros: entrou depois da última saída; dono sempre conta", () => {
  const joins = [{ author: "vx_a", joinedAt: 1 }, { author: "vx_b", joinedAt: 1 }, { author: "vx_b", joinedAt: 5 }];
  const leaves = [{ author: "vx_a", leftAt: 2 }, { author: "vx_b", leftAt: 3 }];
  assert.deepEqual([...flow.memberSet(joins, leaves, "vx_dono")].sort(), ["vx_b", "vx_dono"]);
});

test("aviso-flow — flag de laboratório e rotas", () => {
  const store = (v) => ({ getItem: () => v });
  assert.equal(flow.avisoLabOn(store("1")), true);
  assert.equal(flow.avisoLabOn(store(null)), false);
  assert.equal(flow.avisoLabOn({ getItem: () => { throw new Error("bloqueado"); } }), false);
  location.hash = "#/c/vila%201/avisos?enviar=a1";
  assert.deepEqual(parseRoute(), { name: "community-avisos", communityId: "vila 1" });
  location.hash = "#/compose/aviso?c=vila";
  assert.deepEqual(parseRoute(), { name: "compose-aviso", communityId: "vila" });
});
