/**
 * @file Deliberação tipo Pol.is local: consenso e divisão entre grupos (laboratório).
 * @module labs/parado/polis
 */

/**
 * Voto de concordância normalizado.
 * @type {number}
 */
export const VOTE_AGREE = 1;

/**
 * Voto de discordância normalizado.
 * @type {number}
 */
export const VOTE_DISAGREE = -1;

/**
 * Abstenção ou neutro.
 * @type {number}
 */
export const VOTE_PASS = 0;

/**
 * Converte entrada textual ou numérica para voto canônico.
 * @param {unknown} value Entrada do formulário ou API.
 * @returns {number} Um de {@link VOTE_AGREE}, {@link VOTE_DISAGREE}, {@link VOTE_PASS}.
 */
export function normalizePolisVote(value) {
  if (value === 1 || value === "agree" || value === "concordo") return VOTE_AGREE;
  if (value === -1 || value === "disagree" || value === "discordo") return VOTE_DISAGREE;
  return VOTE_PASS;
}

function tallyStatementVoteCounts(statementVotes) {
  let agrees = 0;
  let disagrees = 0;
  let passes = 0;
  for (const v of statementVotes) {
    const val = normalizePolisVote(v.vote);
    if (val === VOTE_AGREE) agrees++;
    else if (val === VOTE_DISAGREE) disagrees++;
    else passes++;
  }
  return { agrees, disagrees, passes };
}

function calculateStatementMetrics(agrees, disagrees, total) {
  const agreePct = Math.round((agrees / total) * 100);
  const disagreePct = Math.round((disagrees / total) * 100);
  const passPct = 100 - agreePct - disagreePct;
  const p = agrees / total;
  const q = disagrees / total;
  const variance = parseFloat((p * (1 - p) + q * (1 - q)).toFixed(4));
  return { agreePct, disagreePct, passPct, variance };
}

/**
 * Estatísticas agregadas de votos numa declaração.
 * @param {string} statementId Id da declaração.
 * @param {object[]} [votes=[]] Votos com `statementId` e `vote`.
 * @returns {object} Totais, percentuais e variância.
 */
export function computeStatementStats(statementId, votes = []) {
  const statementVotes = votes.filter((v) => v.statementId === statementId);
  const total = statementVotes.length;
  if (total === 0) {
    return { statementId, total: 0, agreePct: 0, disagreePct: 0, passPct: 0, variance: 0 };
  }

  const { agrees, disagrees, passes } = tallyStatementVoteCounts(statementVotes);
  const metrics = calculateStatementMetrics(agrees, disagrees, total);

  return {
    statementId,
    total,
    agrees,
    disagrees,
    passes,
    ...metrics,
  };
}

/**
 * Mapa eleitor → (declaração → voto normalizado).
 * @param {object[]} [_statements=[]] Reservado; usa só votos hoje.
 * @param {object[]} [votes=[]] Votos com `voter`/`voterId`, `statementId`, `vote`.
 * @returns {Map<string, Map<string, number>>}
 */
export function buildVoterMatrix(_statements = [], votes = []) {
  const voterMap = new Map();
  for (const v of votes) {
    const voter = v.voter || v.voterId;
    if (!voter) continue;
    if (!voterMap.has(voter)) voterMap.set(voter, new Map());
    voterMap.get(voter).set(v.statementId, normalizePolisVote(v.vote));
  }
  return voterMap;
}

/**
 * Divide eleitores em dois grupos pela declaração mais polarizada.
 * @param {object[]} [statements=[]] Declarações com `id`.
 * @param {object[]} [votes=[]] Votos.
 * @returns {{groupA: string[], groupB: string[]}}
 */
export function clusterVotersIntoTwoGroups(statements = [], votes = []) {
  const voterMap = buildVoterMatrix(statements, votes);
  const voters = Array.from(voterMap.keys());
  if (voters.length < 2) {
    return { groupA: voters, groupB: [] };
  }

  let maxVarStatement = null;
  let maxVar = -1;
  for (const s of statements) {
    const stats = computeStatementStats(s.id, votes);
    if (stats.variance > maxVar && stats.total >= 2) {
      maxVar = stats.variance;
      maxVarStatement = s.id;
    }
  }

  const groupA = [];
  const groupB = [];

  for (const voter of voters) {
    const vVal = maxVarStatement ? voterMap.get(voter)?.get(maxVarStatement) : 0;
    if (vVal === VOTE_AGREE) {
      groupA.push(voter);
    } else if (vVal === VOTE_DISAGREE) {
      groupB.push(voter);
    } else if (groupA.length <= groupB.length) {
      groupA.push(voter);
    } else {
      groupB.push(voter);
    }
  }

  return { groupA, groupB };
}

/**
 * Compara apoio a uma declaração entre dois grupos e marca ponte vs divisivo.
 * @param {string} statementId Id da declaração.
 * @param {object[]} votes Todos os votos.
 * @param {string[]} [groupA=[]] Ids do grupo A.
 * @param {string[]} [groupB=[]] Ids do grupo B.
 * @returns {object} Métricas por grupo e flags `isBridge` / `isDivisive`.
 */
export function evaluateStatementAcrossGroups(statementId, votes, groupA = [], groupB = []) {
  const votesA = votes.filter((v) => groupA.includes(v.voter));
  const votesB = votes.filter((v) => groupB.includes(v.voter));

  const statsA = computeStatementStats(statementId, votesA);
  const statsB = computeStatementStats(statementId, votesB);

  const isBridge = statsA.agreePct >= 55 && statsB.agreePct >= 55;
  const diffAgree = Math.abs(statsA.agreePct - statsB.agreePct);
  const isDivisive = diffAgree >= 40 || (statsA.agreePct >= 65 && statsB.disagreePct >= 65) || (statsA.disagreePct >= 65 && statsB.agreePct >= 65);

  return {
    statementId,
    statsA,
    statsB,
    diffAgree,
    isBridge,
    isDivisive,
  };
}

function buildStatementReport(s, votes, groupA, groupB) {
  const globalStats = computeStatementStats(s.id, votes);
  const groupEval = evaluateStatementAcrossGroups(s.id, votes, groupA, groupB);
  return {
    id: s.id,
    text: s.text || "",
    ...globalStats,
    groupA: groupEval.statsA,
    groupB: groupEval.statsB,
    isBridge: groupEval.isBridge,
    isDivisive: groupEval.isDivisive,
  };
}

function evaluateAllStatements(statements, votes, groupA, groupB) {
  const statementReports = [];
  const bridgeStatements = [];
  const divisiveStatements = [];

  for (const s of statements) {
    const rep = buildStatementReport(s, votes, groupA, groupB);
    statementReports.push(rep);
    if (rep.isBridge) bridgeStatements.push(rep);
    if (rep.isDivisive) divisiveStatements.push(rep);
  }
  return { statementReports, bridgeStatements, divisiveStatements };
}

/**
 * Relatório completo Pol.is: grupos, pontes e declarações divisivas.
 * @param {object[]} [statements=[]] Declarações.
 * @param {object[]} [votes=[]] Votos.
 * @returns {object}
 */
export function computePolisReport(statements = [], votes = []) {
  const totalVoters = buildVoterMatrix(statements, votes).size;
  const { groupA, groupB } = clusterVotersIntoTwoGroups(statements, votes);
  const { statementReports, bridgeStatements, divisiveStatements } =
    evaluateAllStatements(statements, votes, groupA, groupB);

  return {
    totalStatements: statements.length,
    totalVoters,
    totalVotes: votes.length,
    groups: {
      groupACount: groupA.length,
      groupBCount: groupB.length,
    },
    statements: statementReports,
    bridgeStatements,
    divisiveStatements,
  };
}