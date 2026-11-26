/**
 * @file Faltas do Fairplay (ADR-040 §3): quem é apontado quando uma rolagem é anulada e o texto leigo disso.
 * A conta é refeita em cada aparelho pelo próprio log; nada vindo de outro par (nem o texto da entrada que
 * o Mestre grava) é lido como verdade. O que só um aparelho consegue ver (partes cifradas para ele) é aviso
 * local: nunca entra na falta que o Mestre grava nem na contagem.
 * @module dungeon/vtt-fairplay-faltas
 */
import { boundCommitHex, FAIRPLAY_COMMIT_ALG } from "../rpg-crypto-table.js";
import { verifyFairplayRecord } from "./vtt-fairplay-log.js";

const NO_FAULT_STATUS = new Set(["verified", "pending"]);

function hexToBytes(hex) {
  return Uint8Array.from(String(hex).match(/../g) || [], (h) => Number.parseInt(h, 16));
}

/** Pares cuja revelação não refaz o compromisso que eles mesmos publicaram (o reducer só confere o formato). */
async function badRevealPeers(roll) {
  const bad = [];
  for (const [peer, seedHex] of Object.entries(roll.reveals || {})) {
    const c = roll.commits?.[peer];
    if (c?.alg !== FAIRPLAY_COMMIT_ALG) continue;
    const got = await boundCommitHex({ rollId: roll.rollId, peerId: peer }, hexToBytes(seedHex));
    if (got !== c.commitO) bad.push(peer);
  }
  return bad;
}

/**
 * Veredito local de uma rolagem com o que as faltas precisam: estado, motivo e quem revelou um número que não bate.
 * @param {object} state Estado da campanha deste aparelho.
 * @param {string} rollId Rolagem a conferir.
 * @returns {Promise<{status: string, reason: string, badReveals: string[]}>} Veredito para {@link fairplayRollFaults}.
 */
export async function verdictForFaults(state, rollId) {
  const { status, reason } = await verifyFairplayRecord(state, rollId);
  const roll = state?.fairplay?.rolls?.[rollId];
  return { status, reason, badReveals: status === "unverified" && roll ? await badRevealPeers(roll) : [] };
}

function derivedFaults(roll, verdict) {
  if (roll.phase !== "done" || !verdict || NO_FAULT_STATUS.has(verdict.status)) return [];
  const bad = new Set(verdict.badReveals || []);
  const committed = (roll.participants || []).filter((p) => Object.hasOwn(roll.commits || {}, p));
  const silent = committed.filter((p) => !Object.hasOwn(roll.reveals || {}, p)).map((peer) => ({ peer, kind: "no_reveal" }));
  return [...silent, ...committed.filter((p) => bad.has(p)).map((peer) => ({ peer, kind: "bad_reveal" }))];
}

/**
 * Faltas de uma rolagem, como este aparelho a vê. Rolagem que fechou e não saiu `verified` aponta cada par que
 * se comprometeu e não revelou (`no_reveal`) ou revelou um número que não bate (`bad_reveal`); rolagem `verified`,
 * mesmo recuperada, não tem falta. `local.invalidShares` só vira aviso (`invalid_shares`) neste aparelho.
 * @param {object} [roll] Rolagem do bloco `fairplay` do estado.
 * @param {{status?: string, badReveals?: string[]}} [verdict] Veredito de {@link verdictForFaults} (sem veredito, não há como acusar).
 * @param {{invalidShares?: string}} [local] Achado só deste aparelho: dono das partes que não refazem o número.
 * @returns {Array<{peer: string, kind: "no_reveal"|"bad_reveal"|"invalid_shares"}>} Faltas por par.
 */
export function fairplayRollFaults(roll, verdict, local = {}) {
  if (!roll) return [];
  const faults = derivedFaults(roll, verdict);
  const owner = String(local.invalidShares || "");
  const known = faults.some((f) => f.peer === owner);
  return owner && !known && (roll.participants || []).includes(owner) ? [...faults, { peer: owner, kind: "invalid_shares" }] : faults;
}

/**
 * Texto leigo de uma falta.
 * @param {{peer: string, kind: string}} fault Falta de {@link fairplayRollFaults}.
 * @param {{name: string, mine?: boolean, sent?: boolean}} who Nome de quem é apontado, se é este aparelho e se a revelação dele saiu daqui.
 * @returns {string} Frase para a Crônica.
 */
export function faultText(fault, who) {
  if (fault.kind === "invalid_shares") return `As partes de ${who.name} que ficaram comigo não refazem o número escondido; sem a revelação de ${who.name}, a recuperação não vai funcionar.`;
  if (fault.kind === "bad_reveal") return who.mine ? "O número que você revelou não bate com o que escondeu; a rolagem foi anulada." : `${who.name} revelou um número que não bate com o que escondeu; a rolagem foi anulada.`;
  if (who.mine && who.sent) return "Sua revelação foi segurada no caminho: ela não aparece no registro da mesa.";
  if (who.mine) return "Você não revelou o seu número a tempo; a rolagem foi anulada.";
  return `${who.name} não revelou o número a tempo; a rolagem foi anulada.`;
}
