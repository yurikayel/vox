/**
 * @file Ranking de comentários por pontes de consenso entre clusters (laboratório).
 * @module labs/parado/bridging-rank
 */

import { buildVoterMatrix, clusterVotersIntoTwoGroups, normalizePolisVote, VOTE_AGREE } from "./polis.js";

/**
 * Mínimo de eleitores para usar bridging em vez de contagem simples.
 * @type {number}
 */
export const MIN_VOTERS_FOR_BRIDGING = 4;

/**
 * Taxa de concordância de um cluster num comentário.
 * @param {string[]} [voters=[]] Ids do cluster.
 * @param {string} commentId Id tratado como declaração na matriz.
 * @param {Map<string, Map<string, number>>} voterMatrix Matriz de {@link buildVoterMatrix}.
 * @returns {number} Proporção 0–1; 0 se ninguém votou.
 */
export function calculateClusterAgreeRate(voters = [], commentId, voterMatrix) {
  if (!voters.length) return 0;
  let agrees = 0;
  let counted = 0;
  for (const voter of voters) {
    const vMap = voterMatrix.get(voter);
    if (!vMap || !vMap.has(commentId)) continue;
    counted++;
    if (vMap.get(commentId) === VOTE_AGREE) agrees++;
  }
  return counted === 0 ? 0 : agrees / counted;
}

/**
 * Pontuação de ponte: alto quando ambos os lados concordam e estão alinhados.
 * @param {number} pA Taxa de concordância do grupo A (0–1).
 * @param {number} pB Taxa do grupo B (0–1).
 * @returns {number} Score 0–1 com quatro casas decimais.
 */
export function computeBridgingScore(pA, pB) {
  const crossConsensus = pA * pB;
  const polarizationPenalty = Math.abs(pA - pB);
  const score = crossConsensus * (1 - polarizationPenalty);
  return parseFloat(Math.max(0, score).toFixed(4));
}

/**
 * Quão polarizados estão os dois grupos num comentário.
 * @param {number} pA Taxa do grupo A.
 * @param {number} pB Taxa do grupo B.
 * @returns {number} Diferença absoluta 0–1.
 */
export function computeDivisiveScore(pA, pB) {
  return parseFloat(Math.abs(pA - pB).toFixed(4));
}

/**
 * Métricas de bridging para um comentário dado o particionamento.
 * @param {string} commentId Id do comentário.
 * @param {object[]} votes Votos Pol.is.
 * @param {string[]} groupA Cluster A.
 * @param {string[]} groupB Cluster B.
 * @param {Map<string, Map<string, number>>} voterMatrix Matriz de votos.
 * @returns {object} Taxas, scores e flags.
 */
export function computeCommentBridgingStats(commentId, votes, groupA, groupB, voterMatrix) {
  const pA = calculateClusterAgreeRate(groupA, commentId, voterMatrix);
  const pB = calculateClusterAgreeRate(groupB, commentId, voterMatrix);
  const bridgeScore = computeBridgingScore(pA, pB);
  const divisiveScore = computeDivisiveScore(pA, pB);
  const isBridge = bridgeScore >= 0.25 && pA >= 0.5 && pB >= 0.5;
  const isDivisive = divisiveScore >= 0.45;

  return {
    commentId,
    pA: parseFloat(pA.toFixed(2)),
    pB: parseFloat(pB.toFixed(2)),
    bridgeScore,
    divisiveScore,
    isBridge,
    isDivisive,
  };
}

/**
 * Ordena comentários por bridging; com poucos votantes cai para contagem de agrees.
 * @param {object[]} [comments=[]] Comentários com `id`.
 * @param {object[]} [votes=[]] Votos associados.
 * @returns {object[]} Cópia ordenada com campos de score.
 */
export function rankCommentsByBridging(comments = [], votes = []) {
  if (!Array.isArray(comments) || comments.length === 0) return [];
  const voterMatrix = buildVoterMatrix(comments, votes);
  const totalVoters = voterMatrix.size;

  if (totalVoters < MIN_VOTERS_FOR_BRIDGING) {
    return fallbackSort(comments, votes);
  }

  const { groupA, groupB } = clusterVotersIntoTwoGroups(comments, votes);
  const scored = comments.map((c) => {
    const stats = computeCommentBridgingStats(c.id, votes, groupA, groupB, voterMatrix);
    return { ...c, ...stats };
  });

  return scored.sort((a, b) => {
    if (b.bridgeScore !== a.bridgeScore) {
      return b.bridgeScore - a.bridgeScore;
    }
    return (b.divisiveScore || 0) - (a.divisiveScore || 0);
  });
}

function fallbackSort(comments, votes) {
  const countMap = new Map();
  for (const v of votes) {
    if (normalizePolisVote(v.vote) === VOTE_AGREE) {
      countMap.set(v.statementId, (countMap.get(v.statementId) || 0) + 1);
    }
  }
  return [...comments].sort((a, b) => (countMap.get(b.id) || 0) - (countMap.get(a.id) || 0));
}

/**
 * Indica se o comentário deve receber fricção construtiva (muito divisivo, pouca ponte).
 * @param {string} commentId Id do comentário.
 * @param {object[]} votes Votos.
 * @param {string[]} groupA Cluster A.
 * @param {string[]} groupB Cluster B.
 * @param {Map<string, Map<string, number>>} voterMatrix Matriz de votos.
 * @returns {boolean}
 */
export function shouldApplyConstructiveFriction(commentId, votes, groupA, groupB, voterMatrix) {
  const stats = computeCommentBridgingStats(commentId, votes, groupA, groupB, voterMatrix);
  return stats.isDivisive && stats.bridgeScore < 0.1;
}