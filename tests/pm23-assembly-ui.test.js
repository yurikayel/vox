/**
 * PM-23 — Testes da UI e lógica cliente do Modo Assembleia (v0).
 * Cobre convocação+pauta assinada, RSVP via `aviso-resposta`, ritual mensal,
 * `blockReason`, `decisionStatus` pós-decisão, renderização com escape XSS
 * e paridade exata de ata (Markdown/JSON/`minutesHash`) com `scripts/assembly-minutes.mjs`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/identity/index.js";
import * as aviso from "../client/js/aviso.js";
import {
  buildAssemblyBundleFromPosts,
  buildAssemblyConvocacao,
  buildDecisionStatusUpdate,
  isAssemblyConvocacao,
  nextRitualOccurrence,
  parseAgendaLines,
  renderAssemblyMinutesMarkdownClient,
  tallyAssemblyClient,
  validateBlockReason,
  validatePostDecisionStatus,
} from "../client/js/assembly-minutes.js";
import { renderAssemblyEntrySlot, renderAssemblyPanel } from "../client/js/render/assembly-panel.js";
import { renderCommunityGovernanceTab } from "../client/js/render/community-governance.js";
import {
  bindAssemblyPanelHost,
  exportAssemblyMinutes,
  loadAssemblyContext,
  mountAssemblyPanel,
  publishAssemblyConvocacao,
  submitAssemblyRsvp,
  updateAssemblyDecisionStatus,
} from "../client/js/app/assembly-ui.js";
import {
  renderAssemblyMinutesMarkdown,
  tallyAssembly,
} from "../scripts/assembly-minutes.mjs";
import { waitUntil } from "./helpers/wait-until.js";

const T0 = Date.UTC(2026, 10, 15, 14, 0, 0);

test("PM-23 UI: convocação com pauta estende aviso convocacao com campos planos e verifica offline", async () => {
  await localAccount.ensureLocalAccount();
  const payload = buildAssemblyConvocacao({
    communityId: "vila-esperanca",
    title: "Assembleia Ordinária de Novembro",
    assemblyAgenda: "1. Reforma da quadra\n2. Calendário da feira",
    eventAt: T0,
    eventPlace: "Associação de Moradores",
    quorumMin: 2,
    ritualRule: "monthly",
  }, T0 - 10_000);

  assert.equal(payload.type, "topic");
  assert.equal(payload.avisoKind, "convocacao");
  assert.equal(payload.ritualRule, "monthly");
  assert.equal(isAssemblyConvocacao(payload), true);
  assert.equal(parseAgendaLines(payload.assemblyAgenda).length, 2);

  const signed = await localAccount.signPayload({ ...payload, id: "asm_test0001" });
  const verified = await localAccount.verifyPayload(signed);
  assert.equal(verified, true);
});

test("PM-23 UI: RSVP reutiliza aviso-resposta e ritual mensal calcula próxima ocorrência", async () => {
  await localAccount.ensureLocalAccount();
  const convocacao = await publishAssemblyConvocacao({
    communityId: "vila-esperanca",
    title: "Encontro mensal do bairro",
    assemblyAgenda: "Prestação de contas",
    eventAt: T0,
    quorumMin: 1,
    ritualRule: "monthly",
  });
  const rsvp = await submitAssemblyRsvp(convocacao, "vou");
  assert.equal(rsvp.type, "aviso-resposta");
  assert.equal(rsvp.avisoId, convocacao.id);
  assert.equal(rsvp.choice, "vou");
  assert.equal(await localAccount.verifyPayload(rsvp), true);

  const tally = aviso.tallyAvisoResponses([rsvp], convocacao.id, new Set([rsvp.author]));
  assert.equal(tally.members.vou, 1);

  const next = nextRitualOccurrence(T0, "monthly", T0 + 1000);
  assert.ok(next);
  assert.equal(next.label, "Todo mês · Próximo: 15/12");
});

test("PM-23 UI: blockReason obrigatório em block e decisionStatus pós-decisão só aceita 3 valores", async () => {
  await localAccount.ensureLocalAccount();
  assert.equal(validateBlockReason("block", "").ok, false);
  assert.equal(validateBlockReason("block", "   ").ok, false);
  assert.equal(validateBlockReason("block", "x".repeat(281)).ok, false);
  assert.equal(validateBlockReason("block", "Falta detalhar acessibilidade.").ok, true);

  assert.equal(validatePostDecisionStatus("em_andamento"), "em_andamento");
  assert.equal(validatePostDecisionStatus("cumprida"), "cumprida");
  assert.equal(validatePostDecisionStatus("arquivada"), "arquivada");
  assert.equal(validatePostDecisionStatus("invalido"), null);

  assert.throws(() => buildDecisionStatusUpdate({
    communityId: "vila-esperanca",
    assemblyId: "asm_1",
    decisionStatus: "cancelada",
  }), RangeError);

  const signedStatus = await updateAssemblyDecisionStatus({
    communityId: "vila-esperanca",
    assemblyId: "asm_1",
    decisionStatus: "cumprida",
  });
  assert.equal(signedStatus.type, "assembly-status");
  assert.equal(signedStatus.decisionStatus, "cumprida");
  assert.equal(await localAccount.verifyPayload(signedStatus), true);
});

test("PM-23 UI: exportação de ata (JSON e Markdown) tem paridade exata com scripts/assembly-minutes.mjs", async () => {
  const convocacao = {
    id: "asm-2026-11",
    communityId: "vila-esperanca",
    title: "Assembleia Ordinária de Novembro",
    avisoKind: "convocacao",
    eventAt: T0,
    assemblyClosesAt: T0 + 7_200_000,
    assemblyQuorumMin: 2,
    assemblyAgenda: "Reforma da quadra",
  };
  const responses = [
    { type: "aviso-resposta", avisoId: "asm-2026-11", author: "pk_ana", authorDisplay: "Ana", choice: "vou", ts: T0 + 1000, sig: "sig_att_ana" },
    { type: "aviso-resposta", avisoId: "asm-2026-11", author: "pk_bruno", authorDisplay: "Bruno", choice: "ciente", ts: T0 + 2000, sig: "sig_att_bruno" },
    { type: "aviso-resposta", avisoId: "asm-2026-11", author: "pk_carla", authorDisplay: "Carla", choice: "nao-vou", ts: T0 + 2500, sig: "sig_att_carla" },
  ];
  const votes = [
    { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 5000, sig: "sig_v_ana" },
    { agendaId: "pauta-1", voterPubkey: "pk_bruno", choice: "block", blockReason: "Falta orçamento acessível.", signedAt: T0 + 6000, sig: "sig_v_bruno" },
    // Voto block sem blockReason deve ser recusado na leitura
    { agendaId: "pauta-1", voterPubkey: "pk_invalido", choice: "block", blockReason: "  ", signedAt: T0 + 6500, sig: "sig_v_inv" },
  ];

  const bundle = buildAssemblyBundleFromPosts({ convocacao, responses, votes });
  const cliTally = tallyAssembly(bundle);
  const clientTally = await tallyAssemblyClient(bundle);
  assert.deepEqual(clientTally, cliTally);
  assert.equal(clientTally.decisionStatus, "blocked");
  assert.equal(clientTally.attendanceCount, 2);

  const cliMd = renderAssemblyMinutesMarkdown(cliTally);
  const clientMd = renderAssemblyMinutesMarkdownClient(clientTally);
  assert.equal(clientMd, cliMd);

  const exportedJson = await exportAssemblyMinutes({ convocacao, responses, votes, format: "json", download: false });
  assert.equal(JSON.parse(exportedJson.output).minutesHash, cliTally.minutesHash);
  assert.equal(exportedJson.filename, "ata-asm-2026-11.json");
});

test("PM-23 UI: renderização da aba governança e painel de assembleia escapa HTML/XSS", () => {
  const govHtml = renderCommunityGovernanceTab("vila-esperanca", "Vila", {}, []);
  assert.ok(govHtml.includes("data-assembly-slot"));
  assert.ok(govHtml.includes("Modo Assembleia (v0)"));

  const slotHtml = renderAssemblyEntrySlot("vila\"><img src=x>");
  assert.ok(!slotHtml.includes("<img"));

  const panelHtml = renderAssemblyPanel({
    communityId: "vila-esperanca",
    isMod: true,
    canRespond: true,
    now: T0 + 1000,
    items: [{
      convocacao: {
        id: "asm_xss",
        title: "<script>alert(1)</script> Pauta",
        eventAt: T0,
        eventPlace: "<b>Praça</b>",
        ritualRule: "monthly",
        assemblyAgenda: "<img src=x onerror=alert(1)>",
      },
      tally: { members: { ciente: 0, vou: 2, talvez: 0, "nao-vou": 0 } },
      myChoice: "vou",
      decisionStatus: "em_andamento",
    }],
  });
  assert.ok(!panelHtml.includes("<script>"));
  assert.ok(!panelHtml.includes("<img src=x"));
  assert.ok(panelHtml.includes("Todo mês · Próximo: 15/12"));
  assert.ok(panelHtml.includes("Exportar ata (.md)"));
  assert.ok(panelHtml.includes("Exportar ata (.json)"));
});

function makeHostStub() {
  const listeners = {};
  const slot = { dataset: {}, innerHTML: "" };
  const main = {
    dataset: {},
    querySelector: (sel) => (sel === "[data-assembly-slot]" ? slot : null),
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
  };
  const makeBtn = (dataset) => ({
    dataset,
    disabled: false,
    closest: (sel) => (sel === "[data-assembly-action]" ? btnRef : sel === "[data-assembly-slot]" ? slot : null),
  });
  let btnRef = null;
  const click = async (dataset) => {
    btnRef = makeBtn(dataset);
    listeners.click({ target: btnRef });
    await new Promise((r) => setTimeout(r, 25));
  };
  return { main, slot, listeners, click };
}

test("PM-23 UI: loadAssemblyContext, mountAssemblyPanel e cliques delegados", async () => {
  await localAccount.ensureLocalAccount();
  const routeId = await localAccount.getRouteId();
  const communityId = "vila-host-test";
  const meta = { owner: routeId, moderators: [] };
  const conv = await publishAssemblyConvocacao({
    communityId,
    title: "Assembleia do Host",
    assemblyAgenda: "1. Pauta A",
    eventAt: T0,
    eventPlace: "Praça",
  });
  await submitAssemblyRsvp(conv, "vou");
  await updateAssemblyDecisionStatus({ communityId, assemblyId: conv.id, decisionStatus: "em_andamento" });

  const ctx = await loadAssemblyContext(communityId, meta);
  assert.equal(ctx.isMod, true);
  assert.ok(ctx.items.some((i) => i.convocacao.id === conv.id && i.myChoice === "vou" && i.decisionStatus === "em_andamento"));

  const { main, slot, click } = makeHostStub();
  await mountAssemblyPanel(slot, { communityId, meta });
  assert.equal(slot.dataset.assemblyMounted, "1");
  assert.ok(slot.innerHTML.includes("Assembleia do Host"));

  bindAssemblyPanelHost(main, { communityId, meta });
  bindAssemblyPanelHost(main, { communityId, meta });
  await click({ assemblyAction: "open" });
  await click({ assemblyAction: "rsvp", assemblyId: conv.id, choice: "ciente" });
  await click({ assemblyAction: "status", assemblyId: conv.id, status: "cumprida" });
  await click({ assemblyAction: "export-md", assemblyId: conv.id });
  await click({ assemblyAction: "export-json", assemblyId: conv.id });
  await click({ assemblyAction: "rsvp", assemblyId: "inexistente", choice: "vou" });
});

test("PM-23 UI: bindAssemblyPanelHost trata submit inválido e válido do formulário de convocação", async () => {
  await localAccount.ensureLocalAccount();
  const routeId = await localAccount.getRouteId();
  const communityId = "vila-submit-test";
  const meta = { owner: routeId, moderators: [] };
  const { main, slot, listeners } = makeHostStub();
  bindAssemblyPanelHost(main, { communityId, meta });

  const errorEl = { textContent: "", hidden: true };
  const origFormData = globalThis.FormData;
  const formStub = {
    querySelector: () => errorEl,
    closest: (sel) => (sel === '[data-assembly-form="publish"]' ? formStub : sel === "[data-assembly-slot]" ? slot : null),
  };
  try {
    let fields = { title: "", assemblyAgenda: "" };
    globalThis.FormData = class { get(k) { return fields[k] ?? ""; } };
    listeners.submit({ target: formStub, preventDefault() {} });
    await waitUntil(() => errorEl.hidden === false);
    assert.equal(errorEl.hidden, false);

    fields = { title: "Nova Convocação", assemblyAgenda: "1. Item único", eventAt: "2026-12-01T10:00", eventPlace: "Sede", quorumMin: "5", ritualRule: "monthly" };
    listeners.submit({ target: formStub, preventDefault() {} });
    await waitUntil(() => slot.innerHTML.includes("Nova Convocação"));
    assert.ok(slot.innerHTML.includes("Nova Convocação"));
  } finally {
    globalThis.FormData = origFormData;
  }
});
