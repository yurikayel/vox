/**
 * @file Adaptador Fairplay (Trilha A) do Subversus VTT: conecta o protocolo Commit-Reveal²
 * já existente em `rpg-crypto-table.js` às rolagens da mesa sem duplicar primitivas criptográficas.
 * @module dungeon/vtt-fairplay-roll
 */
import {
  createCommitReveal2Slot,
  DEFAULT_SHAMIR_PEERS,
  DEFAULT_SHAMIR_THRESHOLD,
  resolveCommitReveal2Roll,
} from "../rpg-crypto-table.js";

function randomSeed32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Cria um compromisso Commit-Reveal² para um participante de uma rolagem auditável do Subversus.
 *
 * @param {object} [opts={}] Opções (`peerId`, `rollId`, `seedBytes`, `threshold`, `totalPeers`).
 * @returns {Promise<{peerId: string, rollId: string, seedBytes: Uint8Array, commitO: string, commitV: string, threshold: number, totalPeers: number, backupShares: Array<object>}>} Oferta pronta para troca de compromisso.
 */
export async function createFairplayRollOffer(opts = {}) {
  const seedBytes = opts.seedBytes instanceof Uint8Array ? opts.seedBytes : randomSeed32();
  const threshold = Number(opts.threshold) || DEFAULT_SHAMIR_THRESHOLD;
  const totalPeers = Number(opts.totalPeers) || DEFAULT_SHAMIR_PEERS;
  const slot = await createCommitReveal2Slot(seedBytes, { threshold, totalPeers });
  return {
    peerId: String(opts.peerId || "local"),
    rollId: String(opts.rollId || `roll-${crypto.randomUUID().slice(0, 8)}`),
    seedBytes,
    commitO: slot.commitO,
    commitV: slot.commitV,
    threshold: slot.threshold,
    totalPeers: slot.totalPeers,
    backupShares: slot.backupShares,
  };
}

/**
 * Resolve uma rolagem verificável entre participantes (com recuperação automática anti-abort Shamir).
 *
 * @param {object} [opts={}] Opções (`rollId`, `sides`, `participants`).
 * @returns {Promise<{ok: boolean, rollId: string, value?: number, sides?: number, verified: boolean, recoveredPeerIds?: string[], omegaOHex?: string, error?: string}>} Resultado verificado ou erro de fraude.
 */
export async function resolveFairplayRoll(opts = {}) {
  const rollId = String(opts.rollId || "");
  const sides = Math.max(2, Math.trunc(Number(opts.sides) || 20));
  try {
    const res = await resolveCommitReveal2Roll(opts.participants || [], sides);
    return {
      ok: true,
      rollId,
      value: res.rollValue,
      sides: res.dieSides,
      verified: true,
      recoveredPeerIds: res.recoveredPeerIds,
      omegaOHex: res.omegaOHex,
    };
  } catch (err) {
    return {
      ok: false,
      rollId,
      verified: false,
      error: err?.message || "Falha na verificação da rolagem.",
    };
  }
}

/**
 * Formata um selo curto e leigo para a Crônica do Subversus (sem jargão criptográfico na UI).
 *
 * @param {object} [roll] Resultado de `resolveFairplayRoll` ou registro da crônica.
 * @returns {{label: string, title: string}} Selo discreto para exibição na crônica.
 */
export function formatFairplayBadge(roll) {
  if (!roll?.verified) return { label: "", title: "" };
  const recovered = Array.isArray(roll.recoveredPeerIds) && roll.recoveredPeerIds.length > 0;
  const title = recovered
    ? "Rolagem verificada entre os jogadores (com recuperação automática de par desconectado)."
    : "Rolagem verificada entre os jogadores.";
  return { label: "✓ Verificada", title };
}
