/**
 * @file Economia de cotas para até 2 comunidades favoritas, escalonador W-DRF e eleição de Colunas IA.
 *
 * Estende os tetos de disco/banda de `supporter-mode.js` com alocação proporcional por slider e
 * coordenação de leases WebRTC (`WANT`/`HAVE`) para mestragem distribuída sem servidor central.
 *
 * @module community-pillar-pool
 * @see docs/specs/ai-social-dungeon-v0.md
 */

import { clampDiskMb, dailyCapForDisk } from "./supporter-mode.js";

const COMMUNITY_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const MB_TO_BYTES = 1024 * 1024;
const STAGE1_ROLES = [
  "STAGE1_JUDGE_RULES",
  "STAGE1_LORE_RAG",
  "STAGE1_NPC_ACTOR",
  "STAGE1_ACT_DIRECTOR",
];

/**
 * Máximo de comunidades favoritas que dividem cota e clock ocioso do nó.
 * @type {number}
 */
export const MAX_FAVORITE_COMMUNITIES = 2;

/**
 * Duração padrão do lease criptográfico de uma Coluna de Sustentação, em ms.
 * @type {number}
 */
export const DEFAULT_LEASE_TTL_MS = 10000;

/**
 * Timeout rígido para coleta de propostas do Estágio 1 MoA, em ms.
 * @type {number}
 */
export const STAGE1_TIMEOUT_MS = 1400;

/**
 * Papéis funcionais das 5 Colunas de Sustentação no pipeline MoA de 2 estágios.
 * @type {readonly string[]}
 */
export const PILLAR_ROLES = Object.freeze([
  ...STAGE1_ROLES,
  "STAGE2_LEAD_NARRATOR",
]);

/**
 * Separação de canais WebRTC para evitar Head-of-Line Blocking entre JSON de controle e sync RAG.
 * @type {Readonly<{control: string, bulk: string, maxControlBytes: number, maxBulkChunkBytes: number}>}
 */
export const DATA_CHANNELS = Object.freeze({
  control: "vox-rpg-ctrl",
  bulk: "vox-rpg-bulk",
  maxControlBytes: 2048,
  maxBulkChunkBytes: 65536,
});

function sanitizeFavoriteEntry(entry) {
  const cid = String(entry?.communityId || "").trim();
  if (!COMMUNITY_ID_RE.test(cid)) return null;
  const rawWeight = Number(entry?.weightPct);
  const weightPct = Number.isFinite(rawWeight) ? Math.max(0, Math.min(100, rawWeight)) : 0;
  return { communityId: cid, weightPct };
}

function buildQuotaSlice(entry, scale, totalDiskMb, totalBandwidthMb) {
  const normalizedWeight = Number((entry.weightPct * scale).toFixed(4));
  const fraction = normalizedWeight / 100;
  const allocatedDiskMb = Number((totalDiskMb * fraction).toFixed(2));
  return {
    communityId: entry.communityId,
    weightPct: normalizedWeight,
    allocatedDiskMb,
    dailyBandwidthMb: Number((totalBandwidthMb * fraction).toFixed(2)),
    lruGuardrailBytes: Math.floor(allocatedDiskMb * MB_TO_BYTES),
    clockSharePct: normalizedWeight,
  };
}

/**
 * Normaliza o slider de até 2 comunidades favoritas sobre a cota de disco/banda do aparelho.
 *
 * @param {Array<{communityId: string, weightPct: number}>} [favorites=[]] Preferências do slider.
 * @param {object} [modeSettings={}] Configurações de modo (`supporter`, `maxMb`, `dailyCapMb`).
 * @returns {Array<object>} Alocações normalizadas com disco, banda, teto LRU e clock em %.
 */
export function normalizeFavoriteAllocations(favorites = [], modeSettings = {}) {
  const list = Array.isArray(favorites) ? favorites : [];
  const valid = [];
  const seen = new Set();
  for (const item of list) {
    const clean = sanitizeFavoriteEntry(item);
    if (!clean || seen.has(clean.communityId)) continue;
    seen.add(clean.communityId);
    valid.push(clean);
    if (valid.length >= MAX_FAVORITE_COMMUNITIES) break;
  }
  const totalWeight = valid.reduce((acc, item) => acc + item.weightPct, 0);
  const scale = totalWeight > 100 ? 100 / totalWeight : 1;
  const diskMb = clampDiskMb(modeSettings);
  const bwMb = Math.min(dailyCapForDisk(diskMb), Number(modeSettings.dailyCapMb) || dailyCapForDisk(diskMb));
  return valid.map((entry) => buildQuotaSlice(entry, scale, diskMb, bwMb));
}

function computeDrfMetrics(alloc, usage) {
  const gpuCap = Math.max(1e-6, Number(usage?.capGpu) || 1);
  const ioCap = Math.max(1e-6, Number(usage?.capIo) || 1);
  const gpuShare = Math.max(0, Number(usage?.usedGpu) || 0) / gpuCap;
  const ioShare = Math.max(0, Number(usage?.usedIo) || 0) / ioCap;
  const dominantShare = Math.max(gpuShare, ioShare);
  const weight = (Number(alloc.weightPct) || 0) / 100;
  const weightedDominantShare = weight > 0 ? dominantShare / weight : Infinity;
  return {
    communityId: alloc.communityId,
    weightPct: alloc.weightPct,
    gpuShare: Number(gpuShare.toFixed(6)),
    ioShare: Number(ioShare.toFixed(6)),
    dominantShare: Number(dominantShare.toFixed(6)),
    weightedDominantShare: Number.isFinite(weightedDominantShare) ? Number(weightedDominantShare.toFixed(6)) : Infinity,
  };
}

/**
 * Escalonador Weighted Dominant Resource Fairness (W-DRF) entre GPU/clock e disco/I/O.
 *
 * @param {Array<object>} [allocations=[]] Saída de {@link normalizeFavoriteAllocations}.
 * @param {Object<string, object>} [usageByCommunity={}] Consumo acumulado por comunidade.
 * @returns {{nextCommunityId: string|null, schedule: Array<object>}} Ordem de prioridade W-DRF.
 */
export function computeWeightedDrfSchedule(allocations = [], usageByCommunity = {}) {
  const list = Array.isArray(allocations) ? allocations : [];
  const schedule = list
    .map((alloc) => computeDrfMetrics(alloc, usageByCommunity[alloc.communityId]))
    .sort((a, b) => a.weightedDominantShare - b.weightedDominantShare || b.weightPct - a.weightPct);
  return {
    nextCommunityId: schedule[0]?.communityId || null,
    schedule,
  };
}

/**
 * Verifica as guardas de hardware, rede e energia para ceder clock SLM ocioso.
 *
 * @param {object} [nodeStatus={}] Telemetria local do nó.
 * @returns {{eligible: boolean, reason: string}} Decisão e motivo objetivo.
 */
export function isPillarNodeEligible(nodeStatus = {}) {
  if (nodeStatus.wifi !== true) return { eligible: false, reason: "requires_wifi" };
  if (nodeStatus.deviceLost === true) return { eligible: false, reason: "webgpu_device_lost" };
  if (nodeStatus.thermalThrottle === true) return { eligible: false, reason: "thermal_throttle" };
  const batteryOk = nodeStatus.charging === true || Number(nodeStatus.batteryLevel ?? 0) >= 0.5;
  if (!batteryOk) return { eligible: false, reason: "low_battery_unplugged" };
  const used = Number(nodeStatus.dutyCycleUsedPct ?? 0);
  const maxPct = Number(nodeStatus.maxDutyCyclePct ?? 25);
  if (used >= maxPct) return { eligible: false, reason: "duty_cycle_exceeded" };
  return { eligible: true, reason: "ready" };
}

function capabilityScore(manifest) {
  const tps = Number(manifest.tokensPerSec) || 0;
  const vram = Number(manifest.vramMb) || 0;
  // Ter chave de serviço externo não dá prioridade: usar IA paga pede o consentimento da mesa (ADR-033).
  return vram + tps * 20;
}

function supportsCommunity(manifest, communityId) {
  const favs = Array.isArray(manifest.favorites) ? manifest.favorites : [];
  return favs.some((f) => f?.communityId === communityId && Number(f?.weightPct) > 0);
}

function rankNarratorCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const scoreDiff = capabilityScore(b) - capabilityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(Boolean(b.isIdleCampfireNode)) - Number(Boolean(a.isIdleCampfireNode));
  });
}

function rankWorkerCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const campDiff = Number(Boolean(b.isIdleCampfireNode)) - Number(Boolean(a.isIdleCampfireNode));
    if (campDiff !== 0) return campDiff;
    return capabilityScore(b) - capabilityScore(a);
  });
}

function buildLease(peer, role, communityId, nowMs) {
  return {
    leaseId: `lease-${communityId}-${role}-${peer.peerId}-${nowMs}`,
    role,
    peerId: peer.peerId,
    communityId,
    isCampfireNode: Boolean(peer.isIdleCampfireNode),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + DEFAULT_LEASE_TTL_MS,
  };
}

/**
 * Elege as 5 Colunas de Sustentação priorizando nós ociosos fora da mesa ("Nó de Acampamento").
 *
 * @param {Array<object>} [manifests=[]] Manifestos `HAVE` recebidos dos pares da comunidade.
 * @param {object} [sessionConfig={}] Configuração da sessão (`communityId`, `nowMs`).
 * @returns {{leases: Array<object>, unassignedRoles: string[]}} Leases emitidos e papéis vagos.
 */
export function assignPillarLeases(manifests = [], sessionConfig = {}) {
  const communityId = String(sessionConfig.communityId || "");
  const nowMs = Number(sessionConfig.nowMs) || Date.now();
  const eligible = (Array.isArray(manifests) ? manifests : []).filter(
    (m) => m?.peerId && supportsCommunity(m, communityId) && isPillarNodeEligible(m.status).eligible,
  );
  if (!eligible.length) return { leases: [], unassignedRoles: [...PILLAR_ROLES] };
  const narrator = rankNarratorCandidates(eligible)[0];
  const remaining = rankWorkerCandidates(eligible.filter((p) => p.peerId !== narrator.peerId));
  const stage1Pool = remaining.length ? remaining : [narrator];
  const leases = STAGE1_ROLES.map((role, idx) =>
    buildLease(stage1Pool[idx % stage1Pool.length], role, communityId, nowMs),
  );
  leases.push(buildLease(narrator, "STAGE2_LEAD_NARRATOR", communityId, nowMs));
  return { leases, unassignedRoles: [] };
}

/**
 * Avalia a condição de estabilidade de fila do Distributed Edge MoA: `((k+1)M + 1)*lambda < 1/alpha`.
 *
 * @param {number} arrivalRateLambda Taxa média de turnos por segundo (`lambda`).
 * @param {number} meanServiceTimeAlpha Tempo médio de serviço por estágio em segundos (`alpha`).
 * @param {number} [proposerCount=4] Quantidade `k` de colunas propositoras no Estágio 1.
 * @returns {{stable: boolean, utilization: number, maxSafeLambda: number}} Diagnóstico da fila.
 */
export function checkMoaQueueStability(arrivalRateLambda, meanServiceTimeAlpha, proposerCount = 4) {
  const lambda = Number(arrivalRateLambda);
  const alpha = Number(meanServiceTimeAlpha);
  const k = Math.max(1, Number(proposerCount) || 4);
  if (!Number.isFinite(lambda) || !Number.isFinite(alpha) || lambda < 0 || alpha <= 0) {
    return { stable: false, utilization: Infinity, maxSafeLambda: 0 };
  }
  const factor = (k + 1) * 1 + 1;
  const serviceCapacity = 1 / alpha;
  const utilization = (factor * lambda) / serviceCapacity;
  return {
    stable: factor * lambda < serviceCapacity,
    utilization: Number(utilization.toFixed(6)),
    maxSafeLambda: Number((serviceCapacity / factor).toFixed(6)),
  };
}

function pickReplacementPeer(role, pools, idx) {
  if (role === "STAGE2_LEAD_NARRATOR") return pools.narratorPool[0] || pools.workerPool[0] || null;
  if (pools.workerPool.length > 0) return pools.workerPool[idx % pools.workerPool.length];
  return pools.narratorPool[0] || null;
}

function buildReplacementPools(manifests, failedPeerId, communityId) {
  const eligible = (Array.isArray(manifests) ? manifests : []).filter(
    (m) => m?.peerId && m.peerId !== failedPeerId && supportsCommunity(m, communityId) && isPillarNodeEligible(m.status).eligible,
  );
  return { narratorPool: rankNarratorCandidates(eligible), workerPool: rankWorkerCandidates(eligible) };
}

/**
 * Reatribui em &lt; 1 RTT os leases de uma Coluna que sofreu falha ou queda de GPU.
 *
 * @param {Array<object>} [activeLeases=[]] Leases correntes da sessão.
 * @param {string} [failedPeerId=""] Identificador do par que desconectou ou perdeu WebGPU.
 * @param {Array<object>} [manifests=[]] Manifestos `HAVE` atualizados dos pares da comunidade.
 * @param {object} [sessionConfig={}] Opções da sessão (`communityId`, `nowMs`).
 * @returns {{leases: Array<object>, replacedRoles: string[], backupPeerIds: string[]}} Novo conjunto de leases.
 */
export function reassignFailedPillarLease(activeLeases = [], failedPeerId = "", manifests = [], sessionConfig = {}) {
  const current = Array.isArray(activeLeases) ? activeLeases : [];
  const communityId = String(sessionConfig.communityId || current[0]?.communityId || "");
  const nowMs = Number(sessionConfig.nowMs) || Date.now();
  const pools = buildReplacementPools(manifests, failedPeerId, communityId);
  const replacedRoles = [];
  const backupSet = new Set();
  const nextLeases = [];
  let rrIdx = 0;
  for (const lease of current) {
    if (lease?.peerId !== failedPeerId) {
      nextLeases.push(lease);
      continue;
    }
    const replacement = pickReplacementPeer(lease.role, pools, rrIdx++);
    if (!replacement) continue;
    replacedRoles.push(lease.role);
    backupSet.add(replacement.peerId);
    nextLeases.push(buildLease(replacement, lease.role, communityId, nowMs));
  }
  return { leases: nextLeases, replacedRoles, backupPeerIds: [...backupSet] };
}

/**
 * Emite um Recibo do Nó de Acampamento para auditar e reconhecer o membro ausente na sessão.
 *
 * @param {object} [contribution={}] Métricas servidas (`communityId`, `peerId`, `memberName`, `turnsServed`, `ragChunksServed`, `gpuSecondsLent`, `nowMs`).
 * @returns {object} Recibo determinístico de sustentação comunitária com resumo em PT-BR.
 */
export function issueCampfireContributionReceipt(contribution = {}) {
  const communityId = String(contribution.communityId || "comunidade");
  const peerId = String(contribution.peerId || "campfire-node");
  const memberName = String(contribution.memberName || peerId);
  const turnsServed = Math.max(0, Math.trunc(Number(contribution.turnsServed) || 0));
  const ragChunksServed = Math.max(0, Math.trunc(Number(contribution.ragChunksServed) || 0));
  const gpuSecondsLent = Math.max(0, Number(contribution.gpuSecondsLent) || 0);
  const issuedAtMs = Number(contribution.nowMs) || Date.now();
  const supportPoints = turnsServed * 10 + ragChunksServed * 2 + Math.round(gpuSecondsLent * 0.5);
  return {
    receiptId: `campfire-${communityId}-${peerId}-${issuedAtMs}`,
    communityId,
    peerId,
    memberName,
    turnsServed,
    ragChunksServed,
    gpuSecondsLent: Number(gpuSecondsLent.toFixed(2)),
    supportPoints,
    issuedAtMs,
    summaryPtBr: `${memberName} sustentou ${turnsServed} turno(s) e ${ragChunksServed} chunk(s) RAG para ${communityId} (${supportPoints} pts de acampamento).`,
  };
}
