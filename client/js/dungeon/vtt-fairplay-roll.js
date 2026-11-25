/**
 * @file Adaptador Fairplay (Trilha A) do Subversus VTT: conecta o protocolo Commit-Reveal²
 * já existente em `rpg-crypto-table.js` às rolagens da mesa sem duplicar primitivas criptográficas.
 *
 * Separação obrigatória do que vai para a rede:
 * - `commit` é público (vai para todos na fase de compromisso);
 * - `secret` (a semente) só sai do aparelho na revelação, depois que todos os compromissos chegaram;
 * - `shares` são as partes de backup Shamir: cada uma vai para **um** par, nunca todas juntas
 *   (quem juntasse o quórum reconstruiria a semente antes da revelação).
 * A verificação usa sempre o `commitO` recebido na fase de compromisso, nunca o que vem junto da revelação.
 * @module dungeon/vtt-fairplay-roll
 */
import {
  createCommitReveal2Slot,
  DEFAULT_SHAMIR_PEERS,
  DEFAULT_SHAMIR_THRESHOLD,
  resolveCommitReveal2Roll,
} from "../rpg-crypto-table.js";

const HEX64_RE = /^[0-9a-f]{64}$/;

function randomSeed32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Cria o compromisso Commit-Reveal² de um participante de uma rolagem auditável do Subversus.
 *
 * @param {object} [opts={}] Opções (`peerId`, `rollId`, `seedBytes`, `threshold`, `totalPeers`).
 * @returns {Promise<{commit: {peerId: string, rollId: string, commitO: string, commitV: string, splitId: string, threshold: number, totalPeers: number}, secret: {peerId: string, rollId: string, seedBytes: Uint8Array}, shares: Array<object>}>}
 *   `commit` pode ir para a mesa; `secret` fica no aparelho até a revelação; cada item de `shares` vai para um par só.
 */
export async function createFairplayRollOffer(opts = {}) {
  const seedBytes = opts.seedBytes instanceof Uint8Array ? opts.seedBytes : randomSeed32();
  const threshold = Number(opts.threshold) || DEFAULT_SHAMIR_THRESHOLD;
  const totalPeers = Number(opts.totalPeers) || DEFAULT_SHAMIR_PEERS;
  const slot = await createCommitReveal2Slot(seedBytes, { threshold, totalPeers });
  const peerId = String(opts.peerId || "local");
  const rollId = String(opts.rollId || `roll-${crypto.randomUUID().slice(0, 8)}`);
  return {
    commit: {
      peerId,
      rollId,
      commitO: slot.commitO,
      commitV: slot.commitV,
      splitId: slot.splitId,
      threshold: slot.threshold,
      totalPeers: slot.totalPeers,
    },
    secret: { peerId, rollId, seedBytes },
    shares: slot.backupShares,
  };
}

/**
 * Monta a revelação do participante (só depois de receber o compromisso de todos).
 *
 * @param {{peerId: string, rollId: string, seedBytes: Uint8Array}} secret Parte `secret` de {@link createFairplayRollOffer}.
 * @returns {{peerId: string, rollId: string, seedBytes: Uint8Array}} Revelação para a mesa.
 */
export function buildFairplayReveal(secret) {
  return { peerId: String(secret?.peerId || ""), rollId: String(secret?.rollId || ""), seedBytes: secret?.seedBytes };
}

/**
 * Confere os compromissos da fase 1: hash válido, mesma rolagem, um por par.
 * @param {Array<object>} commits Compromissos recebidos.
 * @param {string} rollId Rolagem esperada.
 */
function assertValidCommits(commits, rollId) {
  if (!Array.isArray(commits) || commits.length === 0) throw new Error("Rolagem sem compromissos: inválida.");
  const seen = new Set();
  for (const c of commits) {
    if (!HEX64_RE.test(String(c?.commitO || ""))) throw new Error(`Compromisso inválido do par ${c?.peerId || "?"}.`);
    if (String(c.rollId || "") !== rollId) throw new Error(`Compromisso de outra rolagem (par ${c.peerId || "?"}): inválida.`);
    if (seen.has(c.peerId)) throw new Error(`Par ${c.peerId} comprometeu duas vezes: inválida.`);
    seen.add(c.peerId);
  }
}

/**
 * Participante no formato de `resolveCommitReveal2Roll`, sempre com o `commitO` da fase 1.
 * @param {object} commit Compromisso do par.
 * @param {object|undefined} reveal Revelação do par, se veio.
 * @param {Array<object>|undefined} recoveryShares Partes de backup juntadas pela mesa para quem não revelou.
 * @returns {object} Participante.
 */
function participantFor(commit, reveal, recoveryShares) {
  if (reveal) return { peerId: commit.peerId, commitO: commit.commitO, seedBytes: reveal.seedBytes };
  return {
    peerId: commit.peerId,
    aborted: true,
    commitO: commit.commitO,
    threshold: commit.threshold,
    backupShares: Array.isArray(recoveryShares) ? recoveryShares : [],
  };
}

/**
 * Junta compromissos, revelações e recuperações; recusa revelação de quem não se comprometeu.
 * @param {{rollId: string, commits: Array<object>, reveals?: Array<object>, recoveries?: Record<string, Array<object>>}} input Fases da rolagem.
 * @returns {Array<object>} Participantes prontos para resolver.
 */
function buildParticipants({ rollId, commits, reveals = [], recoveries = {} }) {
  assertValidCommits(commits, rollId);
  const byPeer = new Map(commits.map((c) => [c.peerId, c]));
  for (const r of reveals) {
    if (!byPeer.has(r?.peerId) || String(r.rollId || "") !== rollId) {
      throw new Error(`Revelação inválida: par ${r?.peerId || "?"} não se comprometeu nesta rolagem.`);
    }
  }
  const revealByPeer = new Map(reveals.map((r) => [r.peerId, r]));
  const recoveryByPeer = new Map(Object.entries(recoveries && typeof recoveries === "object" ? recoveries : {}));
  return commits.map((c) => participantFor(c, revealByPeer.get(c.peerId), recoveryByPeer.get(c.peerId)));
}

/**
 * Resolve uma rolagem verificável a partir dos compromissos recebidos antes, das revelações e, para quem
 * sumiu, das partes de backup juntadas pela mesa (recuperação anti-abort Shamir).
 *
 * @param {object} [opts={}] `rollId`, `sides`, `commits` (fase 1), `reveals` (fase 2) e `recoveries`
 *   (`{ [peerId]: share[] }` para quem não revelou).
 * @returns {Promise<{ok: boolean, rollId: string, value?: number, sides?: number, verified: boolean, recoveredPeerIds?: string[], omegaOHex?: string, error?: string}>} Resultado verificado ou erro de fraude.
 */
export async function resolveFairplayRoll(opts = {}) {
  const rollId = String(opts.rollId || "");
  const sides = Math.max(2, Math.trunc(Number(opts.sides) || 20));
  try {
    const participants = buildParticipants({ ...opts, rollId });
    const res = await resolveCommitReveal2Roll(participants, sides);
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
