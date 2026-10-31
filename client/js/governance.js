/**
 * Módulo de Governança Comunitária e Deliberação FOSS (Fase G1 / Snapshot-style).
 * Implementa propostas com diff, votação descentralizada assinada localmente (ECDSA P-256),
 * regra canônica de marco de corte anti-brigading (Eligibility-Cutoff) e apuração no cliente.
 */

export const VOTE_CHOICES = ["yes", "no", "abstain"];

export const PROPOSAL_STATES = ["open", "merged", "rejected", "expired"];

/**
 * Valida os dados de entrada de uma proposta.
 */
export function validateProposalInput({ title, body, diffText = "", communityId }) {
  if (!communityId || typeof communityId !== "string" || !communityId.trim()) {
    return { valid: false, error: "Identificador da comunidade é obrigatório." };
  }
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    return { valid: false, error: "Título da proposta não pode ser vazio." };
  }
  if (cleanTitle.length > 120) {
    return { valid: false, error: "Título muito longo (máximo 120 caracteres)." };
  }
  const cleanBody = String(body || "").trim();
  if (!cleanBody) {
    return { valid: false, error: "Descrição da proposta é obrigatória." };
  }
  if (cleanBody.length > 5000) {
    return { valid: false, error: "Descrição excede o limite de 5.000 caracteres." };
  }
  return {
    valid: true,
    title: cleanTitle,
    body: cleanBody,
    diffText: String(diffText || "").trim(),
    communityId: communityId.trim(),
  };
}

/**
 * Normaliza e valida a escolha de voto.
 */
export function normalizeVoteChoice(raw) {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "sim" || clean === "yes" || clean === "aprovar") return "yes";
  if (clean === "não" || clean === "nao" || clean === "no" || clean === "rejeitar") return "no";
  if (clean === "abster" || clean === "abstain" || clean === "abstenção" || clean === "abstencao") return "abstain";
  return "";
}

/**
 * Verifica elegibilidade de um eleitor com base no marco de corte (Eligibility-Cutoff).
 * O eleitor DEVE ter aderido à comunidade antes da abertura da proposta.
 */
export function isEligibleToVote({ membershipTs, proposalCreatedAt }) {
  if (!membershipTs || !proposalCreatedAt) return false;
  const mTs = Number(membershipTs);
  const pTs = Number(proposalCreatedAt);
  if (Number.isNaN(mTs) || Number.isNaN(pTs)) return false;
  return mTs <= pTs;
}

/**
 * Determina o estado da proposta com base nos votos e no encerramento.
 */
export function resolveProposalState(proposal, yesCount, noCount, now = Date.now()) {
  const closesAt = Number(proposal.closesAt) || 0;
  const isClosed = closesAt > 0 && now >= closesAt;

  if (proposal.state && proposal.state !== "open") {
    return proposal.state;
  }

  if (!isClosed) return "open";

  const totalVotes = yesCount + noCount;
  const minVotes = Number(proposal.minQuorum) || 1;
  if (totalVotes < minVotes) return "expired";

  return yesCount > noCount ? "merged" : "rejected";
}

function buildMembershipTimestampMap(memberships) {
  const memberMap = new Map();
  for (const m of memberships) {
    const author = m.author || m.owner;
    if (author) memberMap.set(author, Number(m.ts || m.createdAt || 0));
  }
  return memberMap;
}

function deduplicateLatestVotesByAuthor(votes) {
  const sortedVotes = [...votes].sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  const latestByAuthor = new Map();
  for (const v of sortedVotes) {
    const author = v.author || v.owner;
    if (author && !latestByAuthor.has(author)) latestByAuthor.set(author, v);
  }
  return latestByAuthor;
}

function evaluateVoteRecord(author, v, memberMap, proposalCreatedAt, counts) {
  const choice = normalizeVoteChoice(v.choice);
  const memberJoinedAt = memberMap.get(author);
  const hasMembership = memberMap.has(author);
  const eligible = hasMembership && isEligibleToVote({ membershipTs: memberJoinedAt, proposalCreatedAt });

  let reason = "";
  if (!hasMembership) {
    reason = "não é membro da comunidade";
  } else if (!eligible) {
    reason = "adesão posterior ao marco de corte (anti-brigading)";
  }

  if (eligible && choice && counts[choice] !== undefined) {
    counts[choice] += 1;
  }

  return {
    author,
    choice: choice || "invalid",
    eligible,
    reason,
    ts: v.ts || 0,
  };
}

/**
 * Realiza a apuração (tally) estrita e transparente no cliente.
 * Regras canônicas:
 * 1. 1 membro = 1 voto (sem multiplicador de badges ou karma).
 * 2. Apenas o voto mais recente de cada autor é considerado.
 * 3. Votos posteriores ao Eligibility-Cutoff são catalogados como inelegíveis (não alteram a contagem).
 */
export function computeTally({ proposal, votes = [], memberships = [], now = Date.now() }) {
  if (!proposal) {
    return { yes: 0, no: 0, abstain: 0, totalEligible: 0, totalVotes: 0, ineligibleCount: 0, state: "rejected", votesDetail: [] };
  }

  const proposalCreatedAt = Number(proposal.createdAt || proposal.ts) || 0;
  const memberMap = buildMembershipTimestampMap(memberships);
  const latestByAuthor = deduplicateLatestVotesByAuthor(votes);
  const counts = { yes: 0, no: 0, abstain: 0 };
  const votesDetail = [];

  for (const [author, v] of latestByAuthor.entries()) {
    votesDetail.push(evaluateVoteRecord(author, v, memberMap, proposalCreatedAt, counts));
  }

  const totalEligible = counts.yes + counts.no + counts.abstain;
  const ineligibleCount = votesDetail.filter((d) => !d.eligible).length;
  const state = resolveProposalState(proposal, counts.yes, counts.no, now);

  return {
    yes: counts.yes,
    no: counts.no,
    abstain: counts.abstain,
    totalEligible,
    totalVotes: votesDetail.length,
    ineligibleCount,
    state,
    isPassed: counts.yes > counts.no && state === "merged",
    votesDetail,
  };
}

/**
 * Analisa e tokeniza um texto de diff unificado (estilo git diff) para exibição visual limpa.
 */
export function parseUnifiedDiff(diffText) {
  if (!diffText) return [];
  const lines = String(diffText).split("\n");
  return lines.map((raw) => {
    if (raw.startsWith("+")) {
      return { type: "add", text: raw.slice(1) };
    }
    if (raw.startsWith("-")) {
      return { type: "del", text: raw.slice(1) };
    }
    if (raw.startsWith("@@")) {
      return { type: "hunk", text: raw };
    }
    return { type: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw };
  });
}
