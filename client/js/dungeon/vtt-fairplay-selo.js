/**
 * @file Selo Fairplay na Crônica do Subversus (ADR-040 §5), atrás da flag de laboratório `vox.lab.fairplay`.
 * O selo nasce só da conta refeita NESTE aparelho (`verifyFairplayRecord`); um campo `verified` vindo de outro
 * par nunca é lido. Textos leigos, sem jargão. Também conta, por pessoa, as rolagens que não fecharam.
 * @module dungeon/vtt-fairplay-selo
 */
import { escapeHtml } from "../shared/html.js";
import { parseDiceCommand, rollDiceFormula, singleDieSides } from "./dice-engine.js";
import { verifyFairplayRecord } from "./vtt-fairplay-log.js";
import { fairplayRollFaults, faultText } from "./vtt-fairplay-faltas.js";

/** Chave local da flag de laboratório (desligada por padrão). */
export const FAIRPLAY_LAB_KEY = "vox.lab.fairplay";

const KNOWN_REASONS = new Set([
  "rolagem desconhecida neste aparelho",
  "rolagem não fechou: faltaram compromissos",
  "o valor registrado não confere com a conta",
  "o autor do registro não é quem abriu a rolagem",
  "esta rolagem já foi registrada",
  "a fórmula registrada não é a da rolagem",
  "o número mostrado não confere com a conta",
]);
const BONUS_NOTE = "O dado foi conferido; o bônus vem da ficha de quem rolou.";
const GENERIC_REASON = "a conta não fechou neste aparelho";
const TABLE_ONLY_DETAIL = "A mesa conferiu esta rolagem, mas você não participou dela, então este aparelho não pode confirmar por conta própria.";
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
 * @param {boolean} [tookPart=true] Se este aparelho é participante da rolagem e tem o próprio compromisso no log.
 * @returns {{status: "verified"|"pending"|"unverified", label: string, detail: string}} Selo leigo.
 */
export function sealFromVerdict(verdict, tookPart = true) {
  if (verdict?.status === "verified" && !tookPart) {
    return { status: "table_only", label: "verificada pela mesa, sem você", detail: TABLE_ONLY_DETAIL };
  }
  if (verdict?.status === "verified") {
    const recovered = Array.isArray(verdict.recoveredPeerIds) && verdict.recoveredPeerIds.length > 0;
    return { status: "verified", label: "✓ Verificada", detail: recovered ? SUMMARY_RECOVERED : SUMMARY };
  }
  if (verdict?.status === "pending") return { status: "pending", label: "rolando com a mesa…", detail: "" };
  const reason = KNOWN_REASONS.has(verdict?.reason) ? verdict.reason : GENERIC_REASON;
  return { status: "unverified", label: "não verificada", detail: reason };
}

function tookPartIn(state, rollId, me) {
  const roll = state?.fairplay?.rolls?.[rollId];
  return Boolean(me && roll?.participants?.includes(me) && Object.hasOwn(roll.commits || {}, me));
}

/** Fórmula normalizada de um comando de dados, ou `null` quando não interpreta. */
function formulaOf(raw) {
  try {
    return parseDiceCommand(raw).formula;
  } catch {
    return null;
  }
}

/** Mesma fórmula da abertura e mesmo dado; sem `@`, a conta resolvida também é a própria fórmula (sem bônus inventado). */
function sameFormula(roll, rec) {
  if (formulaOf(roll.formula) !== rec.formula || singleDieSides(rec.resolvedFormula) !== roll.sides) return false;
  return String(roll.formula).includes("@") || formulaOf(rec.resolvedFormula) === formulaOf(roll.formula);
}

const diceKey = (rolls) => (rolls || []).map((d) => `${d.sides}:${d.value}:${d.kept}:${d.exploded}`).join(",");

/** O que a entrada mostra (todos os dados, críticos, falhas críticas e total) é o refeito aqui. */
function sameNumber(rec, verdict) {
  const redo = rollDiceFormula(rec.resolvedFormula, { fairplayValue: verdict.value });
  if (!redo.ok || diceKey(redo.rolls) !== diceKey(rec.rolls)) return false;
  return redo.total === rec.total && redo.crits === rec.crits && redo.fumbles === rec.fumbles;
}

/**
 * Amarra a entrada da Crônica à rolagem Fairplay: autor assinado, um único registro com o id, uma vez só
 * (contando só quem abriu), mesma fórmula e tudo o que a entrada mostra refeito aqui.
 * @param {object} state Estado com `fairplay`, `rolls` e a crônica.
 * @param {object} entry Entrada da crônica com `fairplayRollId`.
 * @param {object} verdict Veredito local de `verifyFairplayRecord` (já `verified`).
 * @param {Set<string>} seen Rolagens que já tiveram uma entrada de quem abriu (muda o conjunto).
 * @returns {string} Motivo da recusa do selo, ou vazio quando a entrada se amarra à rolagem.
 */
export function bindsToRoll(state, entry, verdict, seen) {
  const roll = state.fairplay.rolls[entry.fairplayRollId];
  const recs = (state.rolls || []).filter((r) => `turn-${r.id}` === entry.id);
  if (entry.author !== roll.opener) return "o autor do registro não é quem abriu a rolagem";
  const first = !seen.has(entry.fairplayRollId);
  seen.add(entry.fairplayRollId);
  if (!first || recs.length > 1) return "esta rolagem já foi registrada";
  if (recs.length === 0 || !sameFormula(roll, recs[0])) return "a fórmula registrada não é a da rolagem";
  return sameNumber(recs[0], verdict) ? "" : "o número mostrado não confere com a conta";
}

async function sealForEntry(state, entry, me, seen) {
  const verdict = await verifyFairplayRecord(state, entry.fairplayRollId, entry.fairplayValue);
  const fault = verdict.status === "verified" ? bindsToRoll(state, entry, verdict, seen) : "";
  if (fault) return sealFromVerdict({ status: "unverified", reason: fault });
  const seal = sealFromVerdict(verdict, tookPartIn(state, entry.fairplayRollId, me));
  const bonus = seal.status === "verified" && String(state.fairplay.rolls[entry.fairplayRollId].formula).includes("@");
  return bonus ? { ...seal, detail: `${seal.detail} ${BONUS_NOTE}` } : seal;
}

/**
 * Refaz a conta de cada rolagem Fairplay da crônica neste aparelho.
 * @param {{fairplay?: object, chronicle?: object[]}} state Estado com o bloco `fairplay` e a crônica.
 * @returns {Promise<Record<string, object>>} Selos por id de entrada da crônica.
 */
export async function computeFairplaySeals(state) {
  const seals = {};
  const seen = new Set();
  const me = state?.fairplayViewerId || state?.vttKeypair?.routeId || state?.localActor || "";
  for (const entry of state?.chronicle || []) {
    if (entry?.fairplayRollId && !entry.fairplayFault) seals[entry.id] = await sealForEntry(state, entry, me, seen);
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
  const verdicts = await computeFairplayVerdicts(state);
  const changed = JSON.stringify([next, verdicts]) !== JSON.stringify([state.fairplaySeals || {}, state.fairplayVerdicts || {}]);
  state.fairplaySeals = next;
  state.fairplayVerdicts = verdicts;
  return changed;
}

/** Veredito local (só estado e motivo) de cada rolagem que fechou: base das faltas, refeita neste aparelho. */
async function computeFairplayVerdicts(state) {
  const out = {};
  for (const [rollId, roll] of Object.entries(state?.fairplay?.rolls || {})) {
    if (roll?.phase !== "done") continue;
    const { status, reason } = await verifyFairplayRecord(state, rollId);
    out[rollId] = { status, reason };
  }
  return out;
}

/**
 * Conta, por pessoa, as rolagens que não fecharam: abortadas por falta de compromisso ou anuladas porque
 * o par se comprometeu e não revelou (esta, só com o veredito local da rolagem).
 * @param {object} [fairplay] Bloco `fairplay` do estado.
 * @param {Record<string, {status?: string}>} [verdicts] Vereditos locais por rolagem (`state.fairplayVerdicts`).
 * @returns {Record<string, number>} Contagem por identificador de par.
 */
export function countUnclosedRolls(fairplay, verdicts = {}) {
  const counts = {};
  for (const [rollId, roll] of Object.entries(fairplay?.rolls || {})) {
    for (const r of [...missingReasons(roll || {}), ...fairplayRollFaults(roll, verdicts[rollId])]) counts[r.peer] = (counts[r.peer] || 0) + 1;
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
  const entries = Object.entries(countUnclosedRolls(state?.fairplay, state?.fairplayVerdicts));
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
  if (entry.fairplayFault) return renderFaultEntry(entry, state);
  return renderFairplaySeal(state?.fairplaySeals?.[entry.id]);
}

function nameOf(state, peer) {
  return state?.fairplayNames?.[peer] || peer;
}

function missingReasons(roll) {
  if (roll.phase !== "aborted") return [];
  return (roll.participants || []).filter((p) => !Object.hasOwn(roll.commits || {}, p)).map((peer) => ({ peer, kind: "commit" }));
}

function faultContext(state, rollId, fault) {
  const me = viewerOf(state);
  const driver = state?.fairplayDriver;
  return { name: nameOf(state, fault.peer), mine: fault.peer === me, sent: Boolean(driver?.revealSent?.(rollId)) };
}

function localFaults(state, rollId) {
  const roll = state?.fairplay?.rolls?.[rollId];
  const local = { invalidShares: state?.fairplayDriver?.invalidShares?.(rollId) || "" };
  return fairplayRollFaults(roll, state?.fairplayVerdicts?.[rollId], local);
}

/** Entrada que o Mestre grava ao anular uma rolagem: o texto sai da conta deste aparelho, nunca do payload. */
function renderFaultEntry(entry, state) {
  const rollId = entry.fairplayRollId;
  const faults = localFaults(state, rollId);
  const text = faults.length
    ? faults.map((f) => faultText(f, faultContext(state, rollId, f))).join(" ")
    : "falta registrada pelo Mestre; este aparelho não pôde conferir.";
  return `<p class="dungeon-fairplay-seal is-unverified" role="status">${escapeHtml(text)}</p>`;
}

function viewerOf(state) {
  return state?.fairplayViewerId || state?.vttKeypair?.routeId || state?.localActor || "";
}

/**
 * Motivos, por pessoa, de uma rolagem não ter corrido limpa, como este aparelho a viu no log e na própria conta.
 * @param {object} [state] Estado com `fairplay`, `fairplayVerdicts`, `fairplayDriver` e identidade local.
 * @returns {Array<{rollId: string, peer: string, kind: "commit"|"no_reveal"|"invalid_shares", mine: boolean, sent: boolean}>} Motivos por rolagem e pessoa.
 */
export function fairplayRollReasons(state) {
  const list = [];
  for (const [rollId, roll] of Object.entries(state?.fairplay?.rolls || {})) {
    const faults = [...missingReasons(roll || {}), ...localFaults(state, rollId)];
    for (const r of faults) list.push({ rollId, ...r, ...faultContext(state, rollId, r) });
  }
  return list;
}

function reasonText(r) {
  if (r.kind === "commit") return `${r.mine ? "Você não entrou" : `${r.name} não entrou`} a tempo na rolagem.`;
  return faultText(r, r);
}

/**
 * Aviso de rolagem em andamento ("rolando com a mesa…"), uma linha só.
 * @param {object} state Estado da sessão.
 * @returns {string} HTML ou vazio.
 */
export function renderFairplayPending(state) {
  if (!Object.keys(state?.fairplayPending || {}).length) return "";
  return '<p class="dungeon-fairplay-seal is-pending" role="status">rolando com a mesa…</p>';
}

/**
 * Painel da Crônica: rolagem em andamento, contagem por pessoa e motivo de cada rolagem que não correu limpa.
 * @param {object} state Estado com `fairplay`, `fairplayPending` e identidade local.
 * @returns {string} HTML ou vazio.
 */
export function renderFairplayStatus(state) {
  const items = fairplayRollReasons(state).map((r) => `<li>${escapeHtml(reasonText(r))}</li>`).join("");
  const reasons = items ? `<ul class="dungeon-fairplay-reasons">${items}</ul>` : "";
  return `${renderFairplayPending(state)}${renderFairplayUnclosed(state)}${reasons}`;
}
