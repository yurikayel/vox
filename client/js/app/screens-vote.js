/**
 * @file Telas e fluxos de governança: detalhe de proposta, apuração e painel global de votação.
 * @module app/screens-vote
 */
import { confirmGovernanceVote } from "./vote-confirm.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../identity/index.js";
import * as gov from "../governance.js";
import * as peers from "../peers.js";
import * as share from "../share.js";
import * as profileDirectory from "../profile-directory.js";
import { buildProposalPossePayload, firePosseWebhooks, loadPosseWebhooks } from "../posse-dispatch.js";
import { buildChatSummaryCopy } from "../chat-bridge.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { resolveCommunityMetadata } from "./community-metadata.js";

/**
 * Monta tela de proposta de governança.
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} proposalId Identificador da proposta.
 * @returns {Promise<void>}
 */
export async function showProposal(communityId, proposalId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Proposta de Governança"));
  render.renderLoading(main);
  const data = await fetchProposalData(communityId, proposalId, user);
  if (!data?.proposal) {
    main.innerHTML = `<div class="empty card"><p>Proposta não encontrada.</p><a href="#/c/${encodeURIComponent(communityId)}?tab=governance" class="btn btn-outline">← Voltar</a></div>`;
    return;
  }
  const { proposal, tally, userVote, isEligible, isMember } = data;
  const meta = await resolveCommunityMetadata(communityId).catch(() => ({}));
  main.innerHTML = "";
  render.renderProposalDetail(main, proposal, tally, {
    userVote,
    isEligible,
    community: { id: communityId, title: meta.title || communityId },
    isMember,
    userAddress: user,
  });
  attachProposalVotingHandlers(proposal, user);
  attachProposalBridgeHandlers(proposal, tally);
}

/**
 * Busca dados da proposta e apuração de votos no cache local.
 *
 * @param {string} communityId Identificador da comunidade.
 * @param {string} proposalId Identificador da proposta.
 * @param {string} user Rota do usuário atual.
 * @returns {Promise<{ proposal: object, votes: object[], tally: object, userVote: object|null, isEligible: boolean, isMember: boolean }|null>} Dados apurados ou `null`.
 */
export async function fetchProposalData(communityId, proposalId, user) {
  let proposal = await cacheNode.getLocalPost(proposalId);
  if (!proposal) proposal = mock.MOCK_DEMO_PROPOSALS.find((p) => p.id === proposalId) || null;
  if (!proposal) return null;

  const votes = await loadProposalVotes(proposalId);
  const localMems = await cacheNode.getLocalPosts({ type: "membership", communityId: proposal.communityId });
  const userMem = localMems.find((m) => m.author === user);
  const isMember = Boolean(userMem);
  const isEligible = isMember && gov.isEligibleToVote({
    membershipTs: Number(userMem?.joinedAt || userMem?.ts || 0),
    proposalCreatedAt: Number(proposal.createdAt || proposal.ts || 0),
  });
  const tally = gov.computeTally({ proposal, votes, memberships: localMems, now: Date.now() });
  const userVote = votes.filter((v) => (v.author || v.owner) === user).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;
  return { proposal, votes, tally, userVote, isEligible, isMember };
}

/**
 * Carrega votos já registrados na proposta (locais e demo sem duplicação).
 *
 * @param {string} proposalId Identificador da proposta.
 * @returns {Promise<object[]>} Lista consolidada de votos.
 */
export async function loadProposalVotes(proposalId) {
  const localVotes = await cacheNode.getLocalPosts({ type: "governance-vote", proposalId });
  const mockVotesList = mock.MOCK_DEMO_VOTES[proposalId] || [];
  const seenV = new Set();
  const votes = [];
  for (const v of localVotes) { seenV.add(v.id || `${v.author}_${v.choice}`); votes.push(v); }
  for (const v of mockVotesList) {
    const key = v.id || `${v.author}_${v.choice}`;
    if (!seenV.has(key)) { seenV.add(key); votes.push(v); }
  }
  return votes;
}

function attachProposalBridgeHandlers(proposal, tally) {
  const payload = buildProposalPossePayload(proposal, tally);
  document.getElementById("btn-proposal-copy-discord")?.addEventListener("click", async () => {
    const summary = buildChatSummaryCopy(payload, { format: "discord" });
    try {
      await navigator.clipboard.writeText(summary);
      share.showToast("Resumo da proposta copiado para Discord / Slack!");
    } catch {
      share.showToast(summary.slice(0, 120), "info");
    }
  });
  document.getElementById("btn-proposal-webhook-echo")?.addEventListener("click", async () => {
    const urls = loadPosseWebhooks();
    if (!urls.length) {
      share.showToast("Configure webhooks do Discord/Slack em Configurações → Rede.", "info");
      return;
    }
    const res = await firePosseWebhooks(payload, urls);
    share.showToast(res.sent > 0 ? `Proposta enviada para ${res.sent} webhook(s)!` : "Falha ao disparar webhook.", res.sent > 0 ? "info" : "error");
  });
}

/**
 * Assina e propaga um voto de governança (mesmo formato usado pelo detalhe da pauta).
 *
 * @param {object} proposal Pauta com `id` e `communityId`.
 * @param {string} user Rota do votante.
 * @param {string} choice Opção escolhida.
 * @returns {Promise<object>} Voto assinado.
 */
export async function castGovernanceVote(proposal, user, choice) {
  const normalized = gov.normalizeVoteChoice(choice);
  if (!normalized) throw new Error("Escolha de voto inválida");
  const signedVote = await localAccount.signPayload({
    id: `vote_${proposal.id}_${user}_${Date.now()}`,
    type: "governance-vote",
    proposalId: proposal.id,
    choice: normalized,
    communityId: proposal.communityId,
    author: user,
    owner: user,
    ts: Date.now(),
  });
  await cacheNode.saveLocalPost(signedVote);
  peers.broadcastGossip(signedVote);
  return signedVote;
}

/**
 * Liga botões de voto na tela de proposta.
 *
 * @param {object} proposal Objeto da proposta.
 * @param {string} user Rota do usuário atual.
 * @returns {void}
 */
export function attachProposalVotingHandlers(proposal, user) {
  const buttons = document.querySelectorAll(".vote-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const choice = btn.dataset.choice;
      if (!choice || !user) return;
      if (!(await confirmGovernanceVote(proposal, choice))) return;
      buttons.forEach((b) => (b.disabled = true));
      btn.textContent = "Assinando…";
      try {
        await castGovernanceVote(proposal, user, choice);
        share.showToast(`Voto "${choice}" registrado!`);
        void showProposal(proposal.communityId, proposal.id);
      } catch (err) {
        share.showToast(`Erro ao votar: ${err.message}`, "error");
        buttons.forEach((b) => (b.disabled = false));
      }
    });
  });
}

async function buildVoteCommunityTitles() {
  const titles = new Map([["vox", mock.MOCK_OFFICIAL_COMMUNITY_VOX.title]]);
  const local = await cacheNode.getLocalCommunities().catch(() => []);
  for (const c of local) if (c?.id) titles.set(c.id, c.title || c.id);
  return titles;
}

function normalizeVoteItem({ proposal, tally, userVote, isEligible, isMember }, titles) {
  return {
    id: proposal.id,
    communityId: proposal.communityId,
    communityTitle: titles.get(proposal.communityId) || proposal.communityId,
    title: proposal.title,
    body: proposal.body,
    author: proposal.author || proposal.owner || "",
    authorLabel: profileDirectory.getAuthorDisplaySync(proposal.author || proposal.owner || "") || "",
    createdAt: Number(proposal.createdAt || proposal.ts) || 0,
    closesAt: Number(proposal.closesAt) || 0,
    minQuorum: Number(proposal.minQuorum) || 1,
    state: tally.state,
    tally,
    userVote,
    isEligible,
    isMember,
    proposal,
  };
}

/**
 * Carrega todas as pautas de governança conhecidas por este aparelho, com apuração real.
 *
 * @param {string} user Rota ativa para elegibilidade.
 * @returns {Promise<object[]>} Itens normalizados para a tela de votos.
 */
export async function loadVoteItems(user) {
  const proposals = await cacheNode.getLocalPosts({ type: "governance-proposal" }).catch(() => []);
  const titles = await buildVoteCommunityTitles();
  const items = [];
  for (const p of proposals) {
    const data = await fetchProposalData(p.communityId, p.id, user).catch(() => null);
    if (data) items.push(normalizeVoteItem(data, titles));
  }
  const order = { open: 0, merged: 1, rejected: 2, expired: 2 };
  items.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || (a.closesAt || 0) - (b.closesAt || 0));
  return items;
}

function bindVoteChoiceButtons(main, items, user, rerender) {
  main.querySelectorAll(".agora-vote-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = items.find((i) => i.id === btn.dataset.proposalId);
      if (!item || !user) {
        share.showToast("Crie sua identidade neste aparelho para votar.", "warning");
        return;
      }
      if (!(await confirmGovernanceVote(item.proposal, btn.dataset.voteChoice))) return;
      main.querySelectorAll(".agora-vote-btn").forEach((b) => (b.disabled = true));
      btn.textContent = "Assinando…";
      try {
        await castGovernanceVote(item.proposal, user, btn.dataset.voteChoice);
        share.showToast("Voto assinado e registrado neste aparelho.");
        rerender(true);
      } catch (err) {
        share.showToast(`Erro ao votar: ${err.message}`, "error");
        rerender(false);
      }
    });
  });
}

/**
 * Monta tela global de votos da democracia direta.
 *
 * @param {{ filter?: string }} [options] Filtro inicial (`all`, `open`, etc.).
 * @returns {Promise<void>}
 */
export async function showVote({ filter = "all" } = {}) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "vote", "Democracia Direta"));
  render.renderLoading(main);
  const items = await loadVoteItems(user);
  let activeFilter = filter;
  const paint = () => {
    main.innerHTML = render.renderVoteDashboard(items, { filter: activeFilter });
    main.querySelectorAll("[data-vote-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.voteFilter || "all";
        paint();
      });
    });
    bindVoteChoiceButtons(main, items, user, (reload) => (reload ? showVote({ filter: activeFilter }) : paint()));
  };
  paint();
}
