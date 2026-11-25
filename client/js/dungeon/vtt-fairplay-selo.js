/**
 * @file Selo Fairplay na Crônica do Subversus (ADR-040 §5), atrás da flag de laboratório `vox.lab.fairplay`.
 * O selo nasce só da conta refeita NESTE aparelho (`verifyFairplayRecord`); um campo `verified` vindo de outro
 * par nunca é lido. Textos leigos, sem jargão. Também conta, por pessoa, as rolagens que não fecharam.
 * @module dungeon/vtt-fairplay-selo
 */
import { escapeHtml } from "../shared/html.js";
import { verifyFairplayRecord } from "./vtt-fairplay-log.js";

/** Chave local da flag de laboratório (desligada por padrão). */
export const FAIRPLAY_LAB_KEY = "vox.lab.fairplay";

const KNOWN_REASONS = new Set([
  "rolagem desconhecida neste aparelho",
  "rolagem não fechou: faltaram compromissos",
  "o valor registrado não confere com a conta",
]);
const GENERIC_REASON = "a conta não fechou neste aparelho";
const SUMMARY = "Cada pessoa da mesa escondeu um número antes de qualquer um abrir o seu. O dado saiu da soma de todos, e este aparelho refez a conta e chegou ao mesmo resultado.";
const SUMMARY_RECOVERED = `${SUMMARY} Alguém saiu no meio, e a mesa recuperou o número dessa pessoa sem precisar dela.`;

/**
 * Diz se a flag `vox.lab.fairplay` está ligada neste aparelho.
 * @param {Storage|null} [storage] Armazenamento local (padrão `globalThis.localStorage`).
 * @returns {boolean} `true` só quando o valor salvo é `"1"`.
 */
export function isFairplayLabEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(FAIRPLAY_LAB_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Converte o veredito local em selo para exibir.
 * @param {{status?: string, reason?: string, recoveredPeerIds?: string[]}} verdict Resultado de `verifyFairplayRecord`.
 * @returns {{status: "verified"|"pending"|"unverified", label: string, detail: string}} Selo leigo.
 */
export function sealFromVerdict(verdict) {
  if (verdict?.status === "verified") {
    const recovered = Array.isArray(verdict.recoveredPeerIds) && verdict.recoveredPeerIds.length > 0;
    return { status: "verified", label: "✓ Verificada", detail: recovered ? SUMMARY_RECOVERED : SUMMARY };
  }
  if (verdict?.status === "pending") return { status: "pending", label: "rolando com a mesa…", detail: "" };
  const reason = KNOWN_REASONS.has(verdict?.reason) ? verdict.reason : GENERIC_REASON;
  return { status: "unverified", label: "não verificada", detail: reason };
}

/**
 * Refaz a conta de cada rolagem Fairplay da crônica neste aparelho.
 * @param {{fairplay?: object, chronicle?: object[]}} state Estado com o bloco `fairplay` e a crônica.
 * @returns {Promise<Record<string, object>>} Selos por id de entrada da crônica.
 */
export async function computeFairplaySeals(state) {
  const seals = {};
  for (const entry of state?.chronicle || []) {
    if (!entry?.fairplayRollId) continue;
    const verdict = await verifyFairplayRecord(state, entry.fairplayRollId, entry.fairplayValue);
    seals[entry.id] = sealFromVerdict(verdict);
  }
  return seals;
}

/**
 * Atualiza `state.fairplaySeals` (só neste aparelho) quando a flag está ligada.
 * @param {object} state Estado da sessão.
 * @param {Storage|null} [storage] Armazenamento da flag.
 * @returns {Promise<boolean>} `true` se algum selo mudou (hora de redesenhar).
 */
export async function refreshFairplaySeals(state, storage) {
  if (!state?.fairplayLabEnabled && !isFairplayLabEnabled(storage)) return false;
  const next = await computeFairplaySeals(state);
  const changed = JSON.stringify(next) !== JSON.stringify(state.fairplaySeals || {});
  state.fairplaySeals = next;
  return changed;
}

/**
 * Conta, por pessoa, as rolagens que não fecharam (abortadas por falta de compromisso).
 * @param {object} [fairplay] Bloco `fairplay` do estado.
 * @returns {Record<string, number>} Contagem por identificador de par.
 */
export function countUnclosedRolls(fairplay) {
  const counts = {};
  for (const roll of Object.values(fairplay?.rolls || {})) {
    if (roll?.phase !== "aborted") continue;
    for (const peer of roll.participants || []) {
      if (!Object.hasOwn(roll.commits || {}, peer)) counts[peer] = (counts[peer] || 0) + 1;
    }
  }
  return counts;
}

/**
 * HTML do selo de uma entrada da crônica (vazio sem selo calculado).
 * @param {{status: string, label: string, detail: string}|undefined} seal Selo calculado neste aparelho.
 * @returns {string} HTML escapado.
 */
export function renderFairplaySeal(seal) {
  if (!seal) return "";
  const cls = `dungeon-fairplay-seal is-${seal.status}`;
  if (seal.status === "verified") {
    return `<details class="${cls}"><summary>${escapeHtml(seal.label)}</summary><p>${escapeHtml(seal.detail)}</p></details>`;
  }
  const why = seal.detail ? ` · ${escapeHtml(seal.detail)}` : "";
  return `<p class="${cls}" role="status">${escapeHtml(seal.label)}${why}</p>`;
}

/**
 * Aviso das rolagens que não fecharam, por pessoa, com a saída "peça de novo".
 * @param {object} state Estado com `fairplay` e, opcionalmente, `fairplayNames` (peerId → nome).
 * @returns {string} HTML ou string vazia.
 */
export function renderFairplayUnclosed(state) {
  const entries = Object.entries(countUnclosedRolls(state?.fairplay));
  if (!entries.length) return "";
  const names = state.fairplayNames || {};
  const list = entries.map(([peer, n]) => `${escapeHtml(names[peer] || peer)}: ${n}`).join(" · ");
  return `<p class="dungeon-fairplay-unclosed" role="status">Rolagens que não fecharam — ${list}. Peça a rolagem de novo.</p>`;
}

/**
 * Bloco de selo para uma entrada da crônica, respeitando a flag.
 * @param {object} entry Entrada da crônica.
 * @param {object} state Estado da sessão.
 * @param {Storage|null} [storage] Armazenamento da flag.
 * @returns {string} HTML do selo ou vazio.
 */
export function renderEntrySeal(entry, state, storage) {
  if (!entry?.fairplayRollId) return "";
  if (!state?.fairplayLabEnabled && !isFairplayLabEnabled(storage)) return "";
  return renderFairplaySeal(state?.fairplaySeals?.[entry.id]);
}
