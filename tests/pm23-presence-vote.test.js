/**
 * PM-23 — Testes da lista de presença assinável, voto com prazo,
 * `blockReason` obrigatório e integração de `decisionStatus` na UI do Modo Assembleia.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/identity/index.js";
import {
  buildAssemblyBundleFromPosts,
  tallyAssemblyClient,
} from "../client/js/assembly-minutes.js";
import {
  buildAssemblyPresenceCheckin,
  buildAssemblyVote,
  buildPresenceExportData,
  filterAssemblyVotes,
  isAssemblyVotingOpen,
  renderPresenceListMarkdown,
  serializePresenceListJson,
  summarizeAssemblyPresence,
  tallyAssemblyAgendaVotes,
} from "../client/js/assembly-presence.js";
import { renderAssemblyPanel } from "../client/js/render/assembly-panel.js";
import {
  bindAssemblyPanelHost,
  exportAssemblyPresence,
  loadAssemblyContext,
  mountAssemblyPanel,
  publishAssemblyConvocacao,
  submitAssemblyPresence,
  submitAssemblyVote,
  updateAssemblyDecisionStatus,
} from "../client/js/app/assembly-ui.js";
import { drainMicrotasks, waitUntil } from "./helpers/wait-until.js";

const T0 = Date.UTC(2026, 10, 15, 14, 0, 0);
const T_CLOSE = T0 + 7_200_000;

function makeConvocacao(overrides = {}) {
  return {
    id: "asm-pres-vote",
    communityId: "vila-esperanca",
    title: "Assembleia Extraordinária",
    avisoKind: "convocacao",
    eventAt: T0,
    assemblyClosesAt: T_CLOSE,
    assemblyQuorumMin: 2,
    assemblyAgenda: "1. Orçamento da praça\n2. Regulamento interno",
    ...overrides,
  };
}

test("PM-23 presença: check-in assinado valida campos planos e verifica offline", async () => {
  await localAccount.ensureLocalAccount();
  assert.throws(() => buildAssemblyPresenceCheckin({ communityId: "", assemblyId: "asm-1" }), TypeError);
  assert.throws(() => buildAssemblyPresenceCheckin({ communityId: "c1", assemblyId: "a1", note: "x".repeat(141) }), RangeError);

  const payload = buildAssemblyPresenceCheckin({
    communityId: "vila-esperanca",
    assemblyId: "asm-pres-vote",
    note: "Presente presencialmente | Bloco B",
  }, T0 + 1000);
  assert.equal(payload.type, "assembly-presence");
  assert.equal(payload.present, true);

  const signed = await localAccount.signPayload({ ...payload, id: "apr_test01" });
  assert.equal(await localAccount.verifyPayload(signed), true);
});

test("PM-23 presença: contagem de presentes únicos deduplica e exporta Markdown/JSON conferível", async () => {
  const convocacao = makeConvocacao();
  const presences = [
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_ana", authorDisplay: "Ana", present: true, ts: T0 + 100, note: "Cheguei | cedo", sig: "sig_a1" },
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_ana", authorDisplay: "Ana", present: true, ts: T0 + 500, note: "Confirmada", sig: "sig_a2" },
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_bruno", present: true, ts: T0 + 200, sig: "sig_b1" },
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_sem_sig", present: true, ts: T0 + 300, sig: "" },
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_ausente", present: false, ts: T0 + 350, sig: "sig_x" },
    { type: "assembly-presence", assemblyId: "outra-asm", author: "pk_outra", present: true, ts: T0 + 400, sig: "sig_o" },
  ];

  const summary = summarizeAssemblyPresence(presences, convocacao.id);
  assert.equal(summary.uniqueCount, 2);
  assert.equal(summary.duplicatesRemoved, 1);
  assert.equal(summary.entries[0].note, "Confirmada");

  const data = await buildPresenceExportData({ convocacao, presences });
  assert.equal(data.uniqueCount, 2);
  assert.match(data.presenceHash, /^[0-9a-f]{64}$/);
  const md = renderPresenceListMarkdown(data);
  assert.ok(md.includes("Lista de Presença Assinada"));
  assert.ok(md.includes(data.presenceHash));
  assert.ok(md.includes("Ana (`pk_ana`)"));
  assert.equal(JSON.parse(serializePresenceListJson(data)).presenceHash, data.presenceHash);

  const emptyData = await buildPresenceExportData({ convocacao, presences: [] });
  assert.ok(renderPresenceListMarkdown(emptyData).includes("Nenhuma presença assinada registrada."));

  const exported = await exportAssemblyPresence({ convocacao, presences, format: "json", download: false });
  assert.equal(exported.filename, "presenca-asm-pres-vote.json");
  assert.equal(exported.data.presenceHash, data.presenceHash);
});

test("PM-23 presença: buildAssemblyBundleFromPosts integra check-ins assinados na ata", async () => {
  const convocacao = makeConvocacao();
  const presences = [
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_ana", authorDisplay: "Ana", present: true, ts: T0 + 100, sig: "sig_p1" },
    { type: "assembly-presence", assemblyId: convocacao.id, author: "pk_bruno", present: true, ts: T0 + 200, sig: "sig_p2" },
  ];
  const votes = [
    { assemblyId: convocacao.id, agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 300, sig: "sig_v1" },
    { assemblyId: convocacao.id, agendaId: "pauta-2", voterPubkey: "pk_bruno", choice: "yes", signedAt: T0 + 400, sig: "sig_v2" },
    { assemblyId: convocacao.id, agendaId: "pauta-1", voterPubkey: "pk_tarde", choice: "no", signedAt: T_CLOSE + 1, sig: "sig_v3" },
    { assemblyId: "outra", agendaId: "pauta-1", voterPubkey: "pk_outra", choice: "no", signedAt: T0 + 350, sig: "sig_v4" },
  ];
  const bundle = buildAssemblyBundleFromPosts({ convocacao, presences, votes });
  const tally = await tallyAssemblyClient(bundle);
  assert.equal(tally.attendanceCount, 2);
  assert.equal(tally.quorumMet, true);
  assert.equal(tally.decisionStatus, "approved");
  assert.equal(tally.agenda[0].counts.no, 0);
});

test("PM-23 voto com prazo: valida assemblyClosesAt, blockReason obrigatório e verifica offline", async () => {
  await localAccount.ensureLocalAccount();
  const conv = makeConvocacao();
  assert.equal(isAssemblyVotingOpen(conv, T_CLOSE - 1), true);
  assert.equal(isAssemblyVotingOpen(conv, T_CLOSE), false);
  assert.equal(isAssemblyVotingOpen({ id: "x" }, T_CLOSE), true);

  assert.throws(() => buildAssemblyVote({ convocacao: {}, agendaId: "pauta-1", choice: "yes" }, T0), TypeError);
  assert.throws(() => buildAssemblyVote({ convocacao: conv, agendaId: "pauta-1", choice: "yes" }, T_CLOSE), /Prazo de votação encerrado/);
  assert.throws(() => buildAssemblyVote({ convocacao: conv, agendaId: "pauta-9", choice: "yes" }, T0 + 100), RangeError);
  assert.throws(() => buildAssemblyVote({ convocacao: conv, agendaId: "pauta-1", choice: "talvez" }, T0 + 100), RangeError);
  assert.throws(() => buildAssemblyVote({ convocacao: conv, agendaId: "pauta-1", choice: "block", blockReason: "   " }, T0 + 100), /blockReason/);

  const votePayload = buildAssemblyVote({
    convocacao: conv,
    agendaId: "pauta-1",
    choice: "block",
    blockReason: "Falta previsão de rampa de acesso.",
  }, T0 + 1000);
  assert.equal(votePayload.type, "vote");
  assert.equal(votePayload.assemblyId, conv.id);
  assert.equal(votePayload.blockReason, "Falta previsão de rampa de acesso.");

  const signed = await localAccount.signPayload({ ...votePayload, id: "avt_test01" });
  assert.equal(await localAccount.verifyPayload(signed), true);
});

test("PM-23 voto com prazo: apuração filtra expirados, rejeita block sem motivo e resolve decisionStatus", () => {
  const conv = makeConvocacao({ assemblyAgenda: "1. Orçamento" });
  const votes = [
    { assemblyId: conv.id, agendaId: "pauta-1", author: "pk_ana", choice: "yes", ts: T0 + 100, sig: "s1" },
    { assemblyId: conv.id, agendaId: "pauta-1", author: "pk_ana", choice: "no", ts: T0 + 200, sig: "s2" },
    { assemblyId: conv.id, agendaId: "pauta-1", author: "pk_bruno", choice: "block", blockReason: "Impacto ambiental", ts: T0 + 300, sig: "s3" },
    { assemblyId: conv.id, agendaId: "pauta-1", author: "pk_inv", choice: "block", blockReason: "", ts: T0 + 350, sig: "s4" },
    { assemblyId: conv.id, agendaId: "pauta-1", author: "pk_exp", choice: "yes", ts: T_CLOSE + 500, sig: "s5" },
  ];
  const filtered = filterAssemblyVotes(votes, conv);
  assert.equal(filtered.length, 2);

  const blocked = tallyAssemblyAgendaVotes(conv, votes, { quorumMet: true, myRouteId: "pk_bruno" });
  assert.equal(blocked.overallDecisionStatus, "blocked");
  assert.equal(blocked.items[0].counts.no, 1);
  assert.equal(blocked.items[0].counts.block, 1);
  assert.equal(blocked.items[0].myVote.choice, "block");
  assert.equal(blocked.items[0].blockReasons[0].reason, "Impacto ambiental");

  const noQuorum = tallyAssemblyAgendaVotes(conv, votes, { quorumMet: false });
  assert.equal(noQuorum.overallDecisionStatus, "no_quorum");
});

test("PM-23 UI painel: renderiza presença, voto aberto vs expirado, blockReason escapado e decisionStatus", () => {
  const convOpen = makeConvocacao({ title: "Pauta Aberta" });
  const openHtml = renderAssemblyPanel({
    communityId: "vila-esperanca",
    isMod: true,
    canRespond: true,
    now: T0 + 1000,
    items: [{
      convocacao: convOpen,
      presence: { uniqueCount: 1 },
      myPresence: true,
      votingOpen: true,
      decisionStatus: "em_andamento",
      voteSummary: {
        overallDecisionStatus: "blocked",
        totalVotes: 1,
        items: [{
          id: "pauta-1",
          title: "Orçamento",
          counts: { yes: 0, no: 0, abstain: 0, block: 1, total: 1 },
          blockReasons: [{ voterPubkey: "pk_x", reason: "<img src=x onerror=alert(1)>" }],
          myVote: { choice: "block", blockReason: "Sem acessibilidade" },
        }],
      },
    }],
  });
  assert.ok(openHtml.includes("1 presente único assinado"));
  assert.ok(openHtml.includes("✓ Presença assinada"));
  assert.ok(openHtml.includes('data-assembly-form="vote"'));
  assert.ok(openHtml.includes("Aberta até"));
  assert.ok(openHtml.includes("Bloqueada"));
  assert.ok(openHtml.includes("Em andamento"));
  assert.ok(!openHtml.includes("<img src=x"));

  const closedHtml = renderAssemblyPanel({
    communityId: "vila-esperanca",
    canRespond: true,
    now: T_CLOSE + 1000,
    items: [{ convocacao: convOpen, presence: { uniqueCount: 0 }, votingOpen: false }],
  });
  assert.ok(!closedHtml.includes('data-assembly-form="vote"'));
  assert.ok(closedHtml.includes("Prazo de votação encerrado."));
});

function makeHostStub() {
  const listeners = {};
  const slot = { dataset: {}, innerHTML: "" };
  const main = {
    dataset: {},
    querySelector: (sel) => (sel === "[data-assembly-slot]" ? slot : null),
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
  };
  let btnRef = null;
  const click = async (dataset) => {
    btnRef = {
      dataset,
      disabled: false,
      closest: (sel) => (sel === "[data-assembly-action]" ? btnRef : sel === "[data-assembly-slot]" ? slot : null),
    };
    listeners.click({ target: btnRef });
    await drainMicrotasks(50);
  };
  return { main, slot, listeners, click };
}

test("PM-23 UI fluxo completo: check-in, export de presença e carregamento de contexto", async () => {
  await localAccount.ensureLocalAccount();
  const routeId = await localAccount.getRouteId();
  const communityId = "vila-pres-vote-ui";
  const meta = { owner: routeId, moderators: [] };
  const conv = await publishAssemblyConvocacao({
    communityId,
    title: "Assembleia de Presença",
    assemblyAgenda: "1. Construir horta",
    eventAt: Date.now() - 10_000,
    assemblyClosesAt: Date.now() + 3_600_000,
    quorumMin: 1,
  });

  const presencePost = await submitAssemblyPresence(conv, "Na sede");
  assert.equal(presencePost.type, "assembly-presence");
  const votePost = await submitAssemblyVote({ convocacao: conv, agendaId: "pauta-1", choice: "yes" });
  assert.equal(votePost.type, "vote");
  await updateAssemblyDecisionStatus({ communityId, assemblyId: conv.id, decisionStatus: "em_andamento" });

  const ctx = await loadAssemblyContext(communityId, meta);
  const item = ctx.items.find((i) => i.convocacao.id === conv.id);
  assert.equal(item.myPresence, true);
  assert.equal(item.presence.uniqueCount, 1);
  assert.equal(item.votingOpen, true);
  assert.equal(item.voteSummary.overallDecisionStatus, "approved");

  const { main, slot, click } = makeHostStub();
  await mountAssemblyPanel(slot, { communityId, meta });
  bindAssemblyPanelHost(main, { communityId, meta });
  await click({ assemblyAction: "checkin", assemblyId: conv.id });
  await click({ assemblyAction: "export-presence-md", assemblyId: conv.id });
  await click({ assemblyAction: "export-presence-json", assemblyId: conv.id });
});

test("PM-23 UI fluxo de voto: exige blockReason no submit e registra bloqueio válido", async () => {
  await localAccount.ensureLocalAccount();
  const routeId = await localAccount.getRouteId();
  const communityId = "vila-vote-submit-ui";
  const meta = { owner: routeId, moderators: [] };
  const conv = await publishAssemblyConvocacao({
    communityId,
    title: "Assembleia de Voto",
    assemblyAgenda: "1. Drenagem da praça",
    eventAt: Date.now() - 10_000,
    assemblyClosesAt: Date.now() + 3_600_000,
    quorumMin: 1,
  });
  const { main, slot, listeners } = makeHostStub();
  await mountAssemblyPanel(slot, { communityId, meta });
  bindAssemblyPanelHost(main, { communityId, meta });

  const errorEl = { textContent: "", hidden: true };
  const origFormData = globalThis.FormData;
  const voteForm = {
    dataset: { assemblyForm: "vote", assemblyId: conv.id, agendaId: "pauta-1" },
    querySelector: () => errorEl,
    closest: (sel) => (sel === '[data-assembly-form="vote"]' ? voteForm : sel === "[data-assembly-slot]" ? slot : null),
  };
  try {
    let fields = { choice: "block", blockReason: "" };
    globalThis.FormData = class { get(k) { return fields[k] ?? ""; } };
    listeners.submit({ target: voteForm, preventDefault() {} });
    await waitUntil(() => errorEl.hidden === false);
    assert.equal(errorEl.hidden, false);
    assert.match(errorEl.textContent, /blockReason/);

    fields = { choice: "block", blockReason: "Precisa revisar drenagem." };
    listeners.submit({ target: voteForm, preventDefault() {} });
    await waitUntil(() => slot.innerHTML.includes("Precisa revisar drenagem."));
    assert.ok(slot.innerHTML.includes("Precisa revisar drenagem."));
  } finally {
    globalThis.FormData = origFormData;
  }
});
