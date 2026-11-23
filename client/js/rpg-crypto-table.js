/**
 * @file Protocolo de dados verificáveis Commit-Reveal² (≤1 RTT) e Cofres de Lore Shamir 3-de-5.
 *
 * Previne manipulação por desconexão (Last Revealer Attack) combinando duplo compromisso SHA-256
 * com partes de recuperação Shamir GF(256) e elimina viés modular por Rejection Sampling.
 *
 * @module rpg-crypto-table
 * @see docs/specs/ai-social-dungeon-v0.md
 */

import { splitSecret, combineShares } from "./shamir-gf256.js";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const UINT32_MOD = 0x100000000;

/**
 * Quórum padrão Shamir para recuperação de semente e desbloqueio de cofre de lore.
 * @type {number}
 */
export const DEFAULT_SHAMIR_THRESHOLD = 3;

/**
 * Quantidade padrão de pares guardiões na mesa para backup anti-abort de dados.
 * @type {number}
 */
export const DEFAULT_SHAMIR_PEERS = 4;

/**
 * Converte a entrada em bytes (texto vira UTF-8).
 * @param {Uint8Array|string} input Bytes ou texto
 * @returns {Uint8Array} Bytes.
 */
function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  return TEXT_ENCODER.encode(String(input ?? ""));
}

/**
 * Converte bytes em texto hexadecimal.
 * @param {Uint8Array} bytes Bytes
 * @returns {string} Texto hexadecimal.
 */
function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Converte texto hexadecimal em bytes.
 * @param {string} hex Texto hexadecimal
 * @returns {Uint8Array} Bytes.
 */
function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Concatena vetores de bytes.
 * @param {Uint8Array[]} arrays Vetores
 * @returns {Uint8Array} Bytes concatenados.
 */
function concatByteArrays(arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    joined.set(arr, offset);
    offset += arr.length;
  }
  return joined;
}

/**
 * Calcula o digest SHA-256 em hexadecimal minúsculo via WebCrypto.
 *
 * @param {Uint8Array|string} inputBytes Entrada em bytes ou texto UTF-8.
 * @returns {Promise<string>} Hash SHA-256 em hex (64 caracteres).
 */
export async function sha256Hex(inputBytes) {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(inputBytes));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Cria um slot pré-comprometido Commit-Reveal² ($c_o = H(s)$, $c_v = H(c_o)$) com backup Shamir.
 *
 * @param {Uint8Array} secretSeedBytes Semente aleatória de 32 bytes do jogador.
 * @param {object} [shareConfig={}] Opções (`threshold`, `totalPeers`, `splitId`, `random`).
 * @returns {Promise<{commitO: string, commitV: string, splitId: string, threshold: number, totalPeers: number, backupShares: Array<object>}>} Envelope do slot.
 */
export async function createCommitReveal2Slot(secretSeedBytes, shareConfig = {}) {
  if (!(secretSeedBytes instanceof Uint8Array) || secretSeedBytes.length === 0) {
    throw new TypeError("secretSeedBytes deve ser um Uint8Array não vazio.");
  }
  const threshold = Number(shareConfig.threshold) || DEFAULT_SHAMIR_THRESHOLD;
  const totalPeers = Number(shareConfig.totalPeers) || DEFAULT_SHAMIR_PEERS;
  const commitO = await sha256Hex(secretSeedBytes);
  const commitV = await sha256Hex(hexToBytes(commitO));
  const splitOpts = { m: threshold, n: totalPeers };
  if (shareConfig.splitId) splitOpts.splitId = shareConfig.splitId;
  if (shareConfig.random) splitOpts.random = shareConfig.random;
  const split = splitSecret(secretSeedBytes, splitOpts);
  return {
    commitO,
    commitV,
    splitId: split.splitId,
    threshold: split.m,
    totalPeers: split.n,
    backupShares: split.shares,
  };
}

/**
 * Reconstrói a semente de um jogador desconectado via Shamir GF(256) e valida contra `commitO`.
 *
 * @param {Array<object>} [backupShares=[]] Mínimo de $M$ partes Shamir daquele slot.
 * @param {string} [expectedCommitOHex=""] Compromisso $c_o$ esperado para prova criptográfica.
 * @param {number} [threshold=DEFAULT_SHAMIR_THRESHOLD] Quórum mínimo $M$ da divisão.
 * @returns {Promise<Uint8Array>} Semente reconstruída e autenticada.
 */
export async function recoverAbortedSeed(
  backupShares = [],
  expectedCommitOHex = "",
  threshold = DEFAULT_SHAMIR_THRESHOLD,
) {
  const seedBytes = combineShares(backupShares, threshold);
  if (expectedCommitOHex) {
    const actual = await sha256Hex(seedBytes);
    if (actual !== expectedCommitOHex) {
      throw new Error("Semente reconstruída não corresponde ao compromisso commitO.");
    }
  }
  return seedBytes;
}

/**
 * Amostra um valor de dado sem viés modular a partir de um digest hex usando Rejection Sampling.
 *
 * @param {string} digestHex Digest SHA-256 em hexadecimal (64 caracteres).
 * @param {number} [dieSides=20] Quantidade de faces do dado (ex.: 4, 6, 8, 10, 12, 20, 100).
 * @returns {number} Resultado uniforme no intervalo `1..dieSides`.
 */
export function sampleUnbiasedDieFromDigest(digestHex, dieSides = 20) {
  const sides = Math.max(2, Math.trunc(Number(dieSides) || 20));
  const clean = String(digestHex || "").replace(/[^a-f0-9]/gi, "");
  if (clean.length < 8) throw new RangeError("Digest hex insuficiente para amostragem de dado.");
  const limit = Math.floor(UINT32_MOD / sides) * sides;
  for (let offset = 0; offset + 8 <= clean.length; offset += 8) {
    const sample = Number.parseInt(clean.slice(offset, offset + 8), 16) >>> 0;
    if (sample < limit) return (sample % sides) + 1;
  }
  const fallback = Number.parseInt(clean.slice(0, 8), 16) >>> 0;
  return (fallback % sides) + 1;
}

/**
 * Confere se a semente revelada bate com o compromisso do participante.
 * @param {object} participant Participante
 * @returns {Promise<object>} Semente verificada.
 */
async function verifyRevealedSeed(participant) {
  const commitO = await sha256Hex(participant.seedBytes);
  if (participant.commitO && commitO !== participant.commitO) {
    throw new Error(`Revelação inválida do par ${participant.peerId || "desconhecido"}.`);
  }
  return { peerId: participant.peerId || "", seedBytes: participant.seedBytes, commitO, recovered: false };
}

/**
 * Recupera a semente de um participante que abortou, pelos pedaços de backup.
 * @param {object} participant Participante
 * @returns {Promise<object>} Semente recuperada.
 */
async function recoverParticipantSeed(participant) {
  const threshold = Number(participant.threshold) || DEFAULT_SHAMIR_THRESHOLD;
  const seedBytes = await recoverAbortedSeed(participant.backupShares, participant.commitO || "", threshold);
  const commitO = participant.commitO || (await sha256Hex(seedBytes));
  return { peerId: participant.peerId || "", seedBytes, commitO, recovered: true };
}

/**
 * Resolve a semente do participante: revelada ou recuperada do backup.
 * @param {object} participant Participante
 * @returns {Promise<object>} Semente resolvida.
 */
async function resolveParticipantSeed(participant) {
  const hasSeed = !participant?.aborted && participant?.seedBytes instanceof Uint8Array;
  if (hasSeed) return verifyRevealedSeed(participant);
  const hasBackup = Array.isArray(participant?.backupShares) && participant.backupShares.length > 0;
  if (hasBackup) return recoverParticipantSeed(participant);
  throw new Error(`Par ${participant?.peerId || "?"} sem semente nem quórum Shamir.`);
}

/**
 * Resolve uma rolagem Commit-Reveal² entre pares WebRTC com recuperação anti-abort automática.
 *
 * @param {Array<object>} [participants=[]] Participantes com `commitO`, `seedBytes` ou `backupShares`.
 * @param {number} [dieSides=20] Número de faces do dado alvo.
 * @returns {Promise<{rollValue: number, dieSides: number, omegaOHex: string, omegaVHex: string, recoveredPeerIds: string[]}>} Resultado auditável.
 */
export async function resolveCommitReveal2Roll(participants = [], dieSides = 20) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new RangeError("Ao menos um participante é obrigatório para resolver a rolagem.");
  }
  const resolved = [];
  for (const p of participants) resolved.push(await resolveParticipantSeed(p));
  const omegaVHex = await sha256Hex(concatByteArrays(resolved.map((r) => hexToBytes(r.commitO))));
  const omegaOHex = await sha256Hex(concatByteArrays(resolved.map((r) => r.seedBytes)));
  const rollValue = sampleUnbiasedDieFromDigest(omegaOHex, dieSides);
  const recoveredPeerIds = resolved.filter((r) => r.recovered).map((r) => r.peerId);
  return { rollValue, dieSides, omegaOHex, omegaVHex, recoveredPeerIds };
}

/**
 * Avalia deterministicamente se o estado consensual da mesa satisfaz o predicado de um cofre.
 *
 * @param {object} [gameState={}] Estado público atual (`mapId`, `gridX`, `gridY`, `lastRollTotal`, `flags`).
 * @param {object} [triggerPredicate={}] Regras de desbloqueio do cofre.
 * @returns {{unlocked: boolean, failedChecks: string[]}} Resultado da avaliação.
 */
export function evaluateVaultTrigger(gameState = {}, triggerPredicate = {}) {
  const failed = [];
  if (triggerPredicate.mapId && gameState.mapId !== triggerPredicate.mapId) failed.push("mapId");
  if (triggerPredicate.gridX !== undefined && gameState.gridX !== triggerPredicate.gridX) failed.push("gridX");
  if (triggerPredicate.gridY !== undefined && gameState.gridY !== triggerPredicate.gridY) failed.push("gridY");
  if (triggerPredicate.minRollTotal !== undefined) {
    if ((Number(gameState.lastRollTotal) || 0) < Number(triggerPredicate.minRollTotal)) {
      failed.push("minRollTotal");
    }
  }
  if (triggerPredicate.requiredFlag) {
    const flags = Array.isArray(gameState.flags) ? gameState.flags : [];
    if (!flags.includes(triggerPredicate.requiredFlag)) failed.push("requiredFlag");
  }
  return { unlocked: failed.length === 0, failedChecks: failed };
}

/**
 * Sela um segredo de campanha em partes Shamir (padrão 3-de-5) atreladas a um predicado de gatilho.
 *
 * @param {string} secretText Texto secreto da sala, armadilha ou reviravolta.
 * @param {number} [threshold=3] Mínimo de partes necessárias para reconstrução.
 * @param {number} [totalPeers=5] Total de partes distribuídas entre os pares.
 * @param {object} [triggerPredicate={}] Condição determinística no estado público para liberar o cofre.
 * @returns {Promise<object>} Envelope selado com hash de verificação e partes Shamir.
 */
export async function sealLoreVaultSecret(secretText, threshold = 3, totalPeers = 5, triggerPredicate = {}) {
  const bytes = TEXT_ENCODER.encode(String(secretText || ""));
  if (bytes.length === 0) throw new TypeError("secretText não pode ser vazio.");
  const plaintextCommitHex = await sha256Hex(bytes);
  const split = splitSecret(bytes, { m: threshold, n: totalPeers });
  return {
    splitId: split.splitId,
    threshold: split.m,
    totalPeers: split.n,
    plaintextCommitHex,
    triggerPredicate: { ...triggerPredicate },
    shares: split.shares,
  };
}

/**
 * Desbloqueia um cofre de lore apenas quando o predicado de jogo e o quórum Shamir são satisfeitos.
 *
 * @param {object} vaultEnvelope Envelope gerado por {@link sealLoreVaultSecret}.
 * @param {Array<object>} [providedShares=[]] Partes Shamir entregues pelos pares após o gatilho.
 * @param {object} [gameState={}] Estado público atual da campanha.
 * @returns {Promise<{ok: boolean, reason: string, failedChecks?: string[], secretText: string|null}>} Conteúdo se liberado.
 */
export async function unlockLoreVaultSecret(vaultEnvelope, providedShares = [], gameState = {}) {
  const trigger = evaluateVaultTrigger(gameState, vaultEnvelope?.triggerPredicate || {});
  if (!trigger.unlocked) {
    return { ok: false, reason: "trigger_not_met", failedChecks: trigger.failedChecks, secretText: null };
  }
  const threshold = Number(vaultEnvelope?.threshold) || DEFAULT_SHAMIR_THRESHOLD;
  if (!Array.isArray(providedShares) || providedShares.length < threshold) {
    return { ok: false, reason: "insufficient_shares", secretText: null };
  }
  const bytes = combineShares(providedShares, threshold);
  const actualCommit = await sha256Hex(bytes);
  if (vaultEnvelope?.plaintextCommitHex && actualCommit !== vaultEnvelope.plaintextCommitHex) {
    return { ok: false, reason: "commit_mismatch", secretText: null };
  }
  return { ok: true, reason: "unlocked", secretText: TEXT_DECODER.decode(bytes) };
}

/**
 * Monta o prompt do juiz mecânico.
 * @param {object} ctx Contexto do turno
 * @param {string} turnIntent Intenção do jogador
 * @returns {string} Prompt.
 */
function formatJudgePrompt(ctx, turnIntent) {
  const sheet = ctx?.tier3PartySheet || {};
  return `VALIDAÇÃO MECÂNICA | Personagem: ${sheet.name || "Aventureiro"} | Recursos: ${JSON.stringify(sheet.pools || {})} | Condições: ${(sheet.conditions || []).join(",") || "nenhuma"} | Ação: ${turnIntent}`;
}

/**
 * Monta o prompt de recuperação de lore (RAG).
 * @param {object} ctx Contexto do turno
 * @param {string} turnIntent Intenção do jogador
 * @returns {string} Prompt.
 */
function formatLoreRagPrompt(ctx, turnIntent) {
  const facts = (ctx?.tier4LoreRrf?.canonicalFacts || []).map((c) => c.text);
  const local = (ctx?.tier2SpatialMemory?.localEvents || []).map((e) => e.summary || e.text || "");
  return `CONTEXTO ESPACIAL & CANÔNICO | Eventos locais: ${local.join(" ; ") || "nenhum"} | Fatos: ${facts.join(" ; ") || "nenhum"} | Consulta: ${turnIntent}`;
}

/**
 * Monta o prompt de atuação dos NPCs.
 * @param {object} ctx Contexto do turno
 * @param {string} turnIntent Intenção do jogador
 * @returns {string} Prompt.
 */
function formatNpcActorPrompt(ctx, turnIntent) {
  const anchor = ctx?.tier2SpatialMemory?.anchor || {};
  const rumors = (ctx?.tier4LoreRrf?.disputedRumors || []).map((c) => `[boato de taverna não confirmado] ${c.text}`);
  return `ATUAÇÃO NPC (LoS) | Local: ${anchor.map_id || "cena"} (${anchor.grid_x ?? 0},${anchor.grid_y ?? 0}) | Rumores: ${rumors.join(" ; ") || "nenhum"} | Estímulo: ${turnIntent}`;
}

/**
 * Monta o prompt do diretor de ritmo.
 * @param {object} ctx Contexto do turno
 * @param {string} turnIntent Intenção do jogador
 * @returns {string} Prompt.
 */
function formatActDirectorPrompt(ctx, turnIntent) {
  const mem = ctx?.tier2SpatialMemory || {};
  return `DIREÇÃO DE RITMO | Resumo global: ${mem.globalPlotSummary || "-"} | Últimas 3 fases: ${(mem.lastThreePhases || []).join(" -> ") || "início"} | Intenção: ${turnIntent}`;
}

const ROLE_BLINDING_BUILDERS = {
  STAGE1_JUDGE_RULES: { scope: "MECHANICAL_SHEET_ONLY", build: formatJudgePrompt },
  STAGE1_LORE_RAG: { scope: "AUTHORIZED_LORE_AND_SPATIAL", build: formatLoreRagPrompt },
  STAGE1_NPC_ACTOR: { scope: "VISIBLE_SCENE_AND_TAVERN_RUMORS", build: formatNpcActorPrompt },
  STAGE1_ACT_DIRECTOR: { scope: "ABSTRACT_ACTS_PACING", build: formatActDirectorPrompt },
  STAGE2_LEAD_NARRATOR: {
    scope: "PTBR_PROSE_SYNTHESIS_ONLY",
    build: (ctx, turnIntent) => `NARRAÇÃO PT-BR | Síntese Estágio 1: ${ctx?.narratorBriefPtBr || turnIntent}`,
  },
};

/**
 * Constrói um prompt epistêmico cegado para uma Coluna específica, impedindo vazamento de segredos locais.
 *
 * @param {string} role Papel da Coluna (`STAGE1_JUDGE_RULES`, `STAGE1_LORE_RAG`, `STAGE1_NPC_ACTOR`, `STAGE1_ACT_DIRECTOR`, `STAGE2_LEAD_NARRATOR`).
 * @param {object} [packedContext={}] Contexto em 4 Tiers vindo de `packFourTierTurnContext` ou síntese MoA.
 * @param {string} [turnIntent=""] Intenção declarada pelo jogador no turno.
 * @returns {{role: string, epistemicScope: string, promptText: string, leaksPrevented: boolean}} Envelope cegado para inferência local.
 */
export function buildBlindedPillarPrompt(role, packedContext = {}, turnIntent = "") {
  const spec = ROLE_BLINDING_BUILDERS[role] || ROLE_BLINDING_BUILDERS.STAGE2_LEAD_NARRATOR;
  return {
    role: String(role || "STAGE2_LEAD_NARRATOR"),
    epistemicScope: spec.scope,
    promptText: spec.build(packedContext, String(turnIntent || "")),
    leaksPrevented: true,
  };
}
