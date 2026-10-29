/**
 * bridging-rank.js — Ranqueamento por Pontes de Consenso & Sinais Cívicos (Vox)
 *
 * Implementa o ranqueamento determinístico baseado em pontes (Bridging-Based Ranking),
 * premiando argumentos que constroem convergência entre clusters divergentes
 * e aplicando fricção construtiva contra o design viciante de polarização (rage-bait).
 */

import { buildVoterMatrix, clusterVotersIntoTwoGroups, normalizePolisVote, VOTE_AGREE } from "./polis.js";

export const MIN_VOTERS_FOR_BRIDGING = 4;

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

export function computeBridgingScore(pA, pB) {
  // Score máximo (1.0) quando ambos os grupos concordam 100% com 0 divergência.
  const crossConsensus = pA * pB;
  const polarizationPenalty = Math.abs(pA - pB);
  const score = crossConsensus * (1 - polarizationPenalty);
  return parseFloat(Math.max(0, score).toFixed(4));
}

export function computeDivisiveScore(pA, pB) {
  return parseFloat(Math.abs(pA - pB).toFixed(4));
}

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

export function rankCommentsByBridging(comments = [], votes = []) {
  if (!Array.isArray(comments) || comments.length === 0) return [];
  const voterMatrix = buildVoterMatrix(comments, votes);
  const totalVoters = voterMatrix.size;

  if (totalVoters < MIN_VOTERS_FOR_BRIDGING) {
    // Poucos votos: fallback para contagem direta de votos positivos
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

export function shouldApplyConstructiveFriction(commentId, votes, groupA, groupB, voterMatrix) {
  const stats = computeCommentBridgingStats(commentId, votes, groupA, groupB, voterMatrix);
  return stats.isDivisive && stats.bridgeScore < 0.1;
}
