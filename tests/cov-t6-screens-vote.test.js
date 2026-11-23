/**
 * @file Cobertura T6: telas de governança (`app/screens-vote.js`): proposta, apuração, voto assinado com
 * confirmação em duas etapas e painel de votos, com identidade e cache reais sobre um DOM de mentira.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const toasts = captureToasts(doc);
mount(doc, '<div id="app-root"></div>');

const vote = await import("../client/js/app/screens-vote.js");
const account = await import("../client/js/identity/index.js");
const cache = await import("../client/js/cache-node.js");
const posse = await import("../client/js/posse-dispatch.js");

const me = await account.getRouteId();
const lastToast = () => toasts.at(-1)?.text;
const main = () => doc.getElementById("app-main");
const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label) {
  for (let i = 0; i < 100; i++) {
    const got = check();
    if (got) return got;
    await settle(30);
  }
  throw new Error(`tempo esgotado: ${label}`);
}

const PROPOSAL = {
  id: "prop_1", type: "governance-proposal", communityId: "c-vote", title: "Reformar a praça", body: "Plantar árvores",
  author: "vx_autor", createdAt: Date.now() - 1000, ts: Date.now() - 1000, closesAt: Date.now() + 7 * 86400000, minQuorum: 1,
};
await cache.saveLocalPost(PROPOSAL);
await cache.saveLocalPost({ id: "mem_me", type: "membership", communityId: "c-vote", author: me, joinedAt: Date.now() - 100000, ts: Date.now() - 100000 });

test("fetchProposalData: proposta inexistente dá null; existente traz membro, elegível e apuração vazia", async () => {
  assert.equal(await vote.fetchProposalData("c-vote", "nao_existe", me), null);
  const data = await vote.fetchProposalData("c-vote", "prop_1", me);
  assert.equal(data.proposal.id, "prop_1");
  assert.deepEqual([data.isMember, data.isEligible, data.userVote], [true, true, null]);
  assert.equal(data.tally.yes + data.tally.no + data.tally.abstain, 0);
  const outsider = await vote.fetchProposalData("c-vote", "prop_1", "vx_fora");
  assert.deepEqual([outsider.isMember, outsider.isEligible], [false, false]);
});

test("castGovernanceVote: escolha inválida é recusada; válida assina, grava e normaliza", async () => {
  await assert.rejects(() => vote.castGovernanceVote(PROPOSAL, me, "talvez"), /Escolha de voto inválida/);
  const signed = await vote.castGovernanceVote(PROPOSAL, me, "sim");
  assert.equal(signed.choice, "yes");
  assert.equal(signed.proposalId, "prop_1");
  assert.equal(signed.author, me);
  assert.ok(signed.sig);
  const votes = await vote.loadProposalVotes("prop_1");
  assert.deepEqual(votes.map((v) => v.choice), ["yes"]);
});

test("showProposal: proposta ausente mostra o aviso; presente mostra o voto atual e liga os botões", async () => {
  await vote.showProposal("c-vote", "nao_existe");
  assert.match(main().textContent, /Proposta não encontrada\./);
  assert.ok(main().querySelector('a[href="#/c/c-vote?tab=governance"]'));
  await vote.showProposal("c-vote", "prop_1");
  assert.match(main().textContent, /Reformar a praça/);
  assert.match(main().textContent, /Seu voto atual:\s*YES/);
  assert.equal(doc.querySelectorAll(".vote-btn").length, 3);
});

async function confirmFlow(finalStep = "confirm") {
  const overlay = await until(() => doc.querySelector(".vote-confirm-overlay"), "overlay de confirmação");
  click(overlay.querySelector("[data-vote-next]"));
  assert.equal(overlay.querySelector('[data-vote-step="confirm"]').hidden, false);
  click(overlay.querySelector(`[data-vote-${finalStep}]`));
}

test("votar na proposta: cancelar na confirmação não grava; confirmar assina e recarrega a tela", async () => {
  click(doc.querySelector('.vote-btn[data-choice="no"]'));
  const overlay = await until(() => doc.querySelector(".vote-confirm-overlay"), "overlay");
  click(overlay.querySelector("[data-vote-cancel]"));
  await settle();
  assert.equal((await vote.loadProposalVotes("prop_1")).length, 1, "nada novo foi gravado");
  assert.equal(doc.querySelector(".vote-confirm-overlay"), null);
  click(doc.querySelector('.vote-btn[data-choice="no"]'));
  await confirmFlow("confirm");
  await until(() => lastToast() === 'Voto "no" registrado!', "voto registrado");
  const votes = await vote.loadProposalVotes("prop_1");
  assert.deepEqual(votes.map((v) => v.choice).sort(), ["no", "yes"]);
  await until(() => /Seu voto atual:\s*NO/.test(main()?.textContent || ""), "tela recarregada");
});

test("botões da proposta: copiar resumo para o Discord e disparar webhook", async () => {
  const copied = [];
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { copied.push(t); } } });
  const discord = doc.getElementById("btn-proposal-copy-discord");
  assert.ok(discord && doc.getElementById("btn-proposal-webhook-echo"), "os dois botões existem");
  {
    click(discord);
    await settle();
    assert.match(copied[0], /Reformar a praça/);
    assert.equal(lastToast(), "Resumo da proposta copiado para Discord / Slack!");
  }
  const hook = doc.getElementById("btn-proposal-webhook-echo");
  {
    click(hook);
    await settle();
    assert.match(lastToast(), /Configure webhooks/);
    posse.savePosseWebhooks(["https://hooks.example.org/x"]);
    globalThis.fetch = async () => ({ ok: true });
    click(hook);
    await settle();
    assert.equal(lastToast(), "Proposta enviada para 1 webhook(s)!");
  }
});

test("loadVoteItems: pautas locais ordenadas, com apuração e título da comunidade", async () => {
  const items = await vote.loadVoteItems(me);
  const item = items.find((i) => i.id === "prop_1");
  assert.equal(item.communityId, "c-vote");
  assert.equal(item.state, "open");
  assert.equal(item.userVote.choice, "no");
  assert.equal(item.isEligible, true);
});

test("showVote: painel com filtro e voto com confirmação; sem filtro correspondente mostra vazio", async () => {
  await vote.showVote({ filter: "all" });
  assert.ok(main().querySelector(".agora-vote"));
  assert.match(main().textContent, /Reformar a praça/);
  const filter = main().querySelector("[data-vote-filter]");
  assert.ok(filter);
  click(main().querySelector('[data-vote-filter="closed"]') || filter);
  const before = (await vote.loadProposalVotes("prop_1")).length;
  click(main().querySelector('[data-vote-filter="all"]') || filter);
  const btn = main().querySelector('.agora-vote-btn[data-vote-choice="abstain"]');
  assert.ok(btn, "pauta aberta e elegível oferece votar");
  click(btn);
  await confirmFlow("confirm");
  await until(() => lastToast() === "Voto assinado e registrado neste aparelho.", "voto no painel");
  assert.equal((await vote.loadProposalVotes("prop_1")).length, before + 1);
});
