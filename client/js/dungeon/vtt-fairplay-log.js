/**
 * @file Fases do Fairplay na rede da mesa (ADR-040): chave da sessão, abertura, compromisso, partes,
 * revelação, recuperação e fechamento como operações assinadas no log da campanha.
 *
 * O reducer só guarda e recusa o que está fora de fase (síncrono e puro). A conta do dado é refeita
 * em cada aparelho por {@link verifyFairplayRecord}, fora do reducer; ninguém confia no selo de outro par.
 * Toda operação de uma rolagem precisa de `lamport` maior que a última aceita na mesma rolagem, para
 * que a ordem de aplicação e a ordem de releitura do log sejam a mesma (§2.1a).
 * @module dungeon/vtt-fairplay-log
 */
import { isSafeKey, withEntry } from "../shared/safe-key.js";
import { FAIRPLAY_SHARE_ALG, fairplayShareHash, isFairplayPublicKeyOnCurve, isFairplayShareEnvelope } from "./vtt-fairplay-cipher.js";
import { resolveFairplayRoll } from "./vtt-fairplay-roll.js";
import { MAX_ADMIT_EVENTS_PER_ACTOR, MAX_KEYS, MAX_KEY_OPS_PER_ACTOR, MAX_LOGGED_ROLLS, fairplayOf, normalizeFairplayState, seal } from "./vtt-fairplay-state.js";
import { applyFairplayAdmit, applyFairplayRevoke, isAdmitted, isRevokedAt } from "./vtt-fairplay-admission.js";

export { MAX_LOGGED_ROLLS, normalizeFairplayState };
/** Orçamento (bytes de JSON) das ops Fairplay que vão no snapshot a quem entra. */
export const SNAPSHOT_OPS_BUDGET = 256 * 1024;

const HEX64 = /^[0-9a-f]{64}$/;
const DEFAULT_PHASE_MS = 20_000;
const MIN_PHASE_MS = 5000;
const MAX_PHASE_MS = 120_000;
const MAX_SIDES = 1000;
const SHARE_HEX = /^(?:[0-9a-f]{2}){1,64}$/;

/**
 * Quórum Shamir para `n` participantes: cada um entrega uma parte a cada outro (ADR-040 §2.4).
 * Com 2 participantes a divisão Shamir pede ao menos 2 partes, então as duas vão para o outro par:
 * na prática, quórum de 1 pessoa, como o ADR descreve.
 * @param {number} n Participantes da rolagem.
 * @returns {{threshold: number, totalPeers: number}} `M` partes de `max(2, N − 1)`.
 */
export function fairplayQuorum(n) {
  const count = Math.max(2, Math.trunc(Number(n) || 0));
  const totalPeers = Math.max(2, count - 1);
  return { threshold: Math.min(totalPeers, Math.ceil(count / 2) + 1), totalPeers };
}

/**
 * Quantos guardiões distintos precisam receber partes para que nenhum deles tenha o mínimo (`threshold`)
 * para abrir sozinho a semente de outro. Com 2 participantes o quórum de 1 pessoa é o aceito (ADR-040 §2.4).
 * @param {number} totalPeers Partes geradas (`S`).
 * @param {number} threshold Partes necessárias (`T`).
 * @param {number} participants Participantes da rolagem.
 * @returns {number} Mínimo de guardiões distintos.
 */
export function fairplayMinHolders(totalPeers, threshold, participants) {
  if (participants <= 2) return 1;
  return Math.ceil(Number(totalPeers) / Math.max(1, Number(threshold) - 1));
}

function withRoll(state, roll) {
  const fp = fairplayOf(state);
  return { ...state, fairplay: seal({ ...fp, rolls: withEntry(fp.rolls, roll.rollId, roll) }) };
}

function rollFor(state, op) {
  const rollId = String(op.payload?.rollId || "");
  if (!isSafeKey(rollId)) return null;
  const roll = fairplayOf(state).rolls[rollId];
  return roll && Number(op.lamport) > Number(roll.lastLamport) ? roll : null;
}

function touched(roll, op, changes) {
  return { ...roll, ...changes, lastLamport: Number(op.lamport) };
}

function enterPhase(roll, op, phase) {
  return touched(roll, op, { phase, phaseStartTs: Number(op.ts) || 0 });
}

function isEcP256PublicJwk(jwk) {
  return Boolean(jwk && jwk.kty === "EC" && jwk.crv === "P-256" && !("d" in jwk) && isFairplayPublicKeyOnCurve(jwk));
}

function applyFairplayKey(state, op) {
  const jwk = op.payload?.publicKeyJwk;
  if (!isSafeKey(op.actor) || !isEcP256PublicJwk(jwk)) return state;
  const fp = fairplayOf(state);
  if (!isAdmitted(state, fp, op)) return state;
  if (!Object.hasOwn(fp.keys, op.actor) && Object.keys(fp.keys).length >= MAX_KEYS) return state;
  const key = { alg: FAIRPLAY_SHARE_ALG, publicKeyJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, keyLamport: Number(op.lamport) };
  return { ...state, fairplay: seal({ ...fp, keys: withEntry(fp.keys, op.actor, key) }) };
}

function openRollDoc(op, participants) {
  const phaseMs = Math.min(MAX_PHASE_MS, Math.max(MIN_PHASE_MS, Math.trunc(Number(op.payload?.phaseMs) || DEFAULT_PHASE_MS)));
  return {
    rollId: String(op.payload.rollId),
    opener: op.actor,
    sides: Math.max(2, Math.trunc(Number(op.payload?.sides) || 20)),
    openedCount: participants.length,
    formula: String(op.payload?.formula || "").slice(0, 80),
    participants,
    phase: "commit",
    phaseMs,
    phaseStartTs: Number(op.ts) || 0,
    lastLamport: Number(op.lamport),
    commits: {},
    shares: {},
    reveals: {},
    released: {},
  };
}

function applyFairplayOpen(state, op) {
  const rollId = String(op.payload?.rollId || "");
  const fp = fairplayOf(state);
  if (!isSafeKey(rollId) || Object.hasOwn(fp.rolls, rollId)) return state;
  if (Math.trunc(Number(op.payload?.sides) || 20) > MAX_SIDES) return state;
  const participants = Object.keys(fp.keys).filter((p) => Number(fp.keys[p].keyLamport) < Number(op.lamport)).sort();
  if (participants.length < 2 || !participants.includes(op.actor)) return state;
  return withRoll(state, openRollDoc(op, participants));
}

function isFreshCommit(roll, op) {
  const commitO = String(op.payload?.commit?.commitO || "");
  if (!HEX64.test(commitO) || Object.hasOwn(roll.commits, op.actor)) return false;
  return !Object.values(roll.commits).some((c) => c.commitO === commitO);
}

function commitDocFor(roll, op) {
  const c = op.payload.commit;
  const { threshold, totalPeers } = fairplayQuorum(roll.participants.length);
  return { peerId: op.actor, rollId: roll.rollId, commitO: String(c.commitO), commitV: String(c.commitV || ""), splitId: String(c.splitId || ""), threshold, totalPeers };
}

function applyFairplayCommit(state, op) {
  const roll = rollFor(state, op);
  if (!roll || roll.phase !== "commit" || !roll.participants.includes(op.actor) || !isFreshCommit(roll, op)) return state;
  const commits = withEntry(roll.commits, op.actor, commitDocFor(roll, op));
  const next = touched(roll, op, { commits });
  return withRoll(state, Object.keys(commits).length === roll.participants.length ? enterPhase(next, op, "shares") : next);
}

function committedPeers(roll) {
  return roll.participants.filter((p) => Object.hasOwn(roll.commits, p));
}

function spreadIsSafe(roll, list, commit) {
  const perTarget = new Map();
  for (const s of list) perTarget.set(s.to, (perTarget.get(s.to) || 0) + 1);
  const n = roll.participants.length;
  if (perTarget.size < fairplayMinHolders(commit.totalPeers, commit.threshold, n)) return false;
  return n <= 2 || [...perTarget.values()].every((c) => c < Number(commit.threshold));
}

function validShareList(roll, op) {
  const list = Array.isArray(op.payload?.shares) ? op.payload.shares : [];
  const others = committedPeers(roll).filter((p) => p !== op.actor);
  const wellFormed = list.every((s) => others.includes(s?.to) && isFairplayShareEnvelope(s?.share) && HEX64.test(String(s?.shareHash)));
  const commit = roll.commits[op.actor];
  if (!wellFormed || list.length !== Number(commit.totalPeers) || !spreadIsSafe(roll, list, commit)) return null;
  return list.map((s) => ({ to: s.to, share: s.share, shareHash: s.shareHash }));
}

function applyFairplayShares(state, op) {
  const roll = rollFor(state, op);
  if (!roll || roll.phase !== "shares" || !Object.hasOwn(roll.commits, op.actor) || Object.hasOwn(roll.shares, op.actor)) return state;
  const list = validShareList(roll, op);
  if (!list) return state;
  const shares = withEntry(roll.shares, op.actor, list);
  const next = touched(roll, op, { shares });
  return withRoll(state, Object.keys(shares).length === committedPeers(roll).length ? enterPhase(next, op, "reveal") : next);
}

function applyFairplayReveal(state, op) {
  const roll = rollFor(state, op);
  const seedHex = String(op.payload?.seedHex || "");
  if (!roll || roll.phase !== "reveal" || !Object.hasOwn(roll.commits, op.actor) || Object.hasOwn(roll.reveals, op.actor)) return state;
  if (!HEX64.test(seedHex)) return state;
  const reveals = withEntry(roll.reveals, op.actor, seedHex);
  const next = touched(roll, op, { reveals });
  return withRoll(state, Object.keys(reveals).length === committedPeers(roll).length ? enterPhase(next, op, "done") : next);
}

function missingRevealers(roll) {
  return committedPeers(roll).filter((p) => !Object.hasOwn(roll.reveals, p));
}

function heldShares(roll, holder, ofPeer) {
  const list = Array.isArray(roll.shares[ofPeer]) ? roll.shares[ofPeer] : [];
  return list.filter((s) => s.to === holder).map((s) => s.share);
}

function isPlainShare(s) {
  return Boolean(s && typeof s.splitId === "string" && s.splitId.length <= 64 && Number.isInteger(s.x) && typeof s.y === "string" && SHARE_HEX.test(s.y));
}

function applyFairplayShareRelease(state, op) {
  const roll = rollFor(state, op);
  const ofPeer = String(op.payload?.ofPeer || "");
  if (!roll || roll.phase !== "recovery" || !missingRevealers(roll).includes(ofPeer)) return state;
  const held = heldShares(roll, op.actor, ofPeer);
  const mine = { ...(roll.released[ofPeer] || {}) };
  if (!held.length || Object.hasOwn(mine, op.actor)) return state;
  const sent = Array.isArray(op.payload?.shares) ? op.payload.shares.filter(isPlainShare).map((s) => ({ splitId: s.splitId, x: s.x, y: s.y })) : [];
  if (sent.length !== held.length) return state;
  // A recuperação só fecha pelo `FAIRPLAY_CLOSE`: o reducer não confere o hash das partes (SHA-256 é assíncrono),
  // então contar partes aqui fecharia a fase com partes que a conferência final pode descartar.
  return withRoll(state, touched(roll, op, { released: withEntry(roll.released, ofPeer, withEntry(mine, op.actor, sent)) }));
}

/**
 * Depois de um fechamento que reduziu a lista, as partes já geradas (para o N original) são repartidas
 * entre menos pares: só segue se nenhum par ficar com partes suficientes para abrir a semente de outro.
 * Sem redução, vale o quórum do ADR-040 §2.4.
 */
function sharesStaySafe(roll) {
  const peers = committedPeers(roll);
  if (peers.length === Number(roll.openedCount ?? roll.participants.length)) return true;
  return peers.every((p) => Math.ceil(Number(roll.commits[p].totalPeers) / (peers.length - 1)) < Number(roll.commits[p].threshold));
}

function phaseAfterClose(roll) {
  if (roll.phase === "commit") return committedPeers(roll).length >= 2 && sharesStaySafe(roll) ? "shares" : "aborted";
  if (roll.phase === "shares") return "reveal";
  if (roll.phase === "reveal") return missingRevealers(roll).length ? "recovery" : "done";
  return roll.phase === "recovery" ? "done" : "";
}

function canClose(state, roll, op) {
  const byRightPerson = op.actor === roll.opener || (state.gmRouteId && op.actor === state.gmRouteId);
  const afterDeadline = (Number(op.ts) || 0) >= Number(roll.phaseStartTs) + Number(roll.phaseMs);
  return Boolean(byRightPerson && afterDeadline && op.payload?.phase === roll.phase);
}

function applyFairplayClose(state, op) {
  const roll = rollFor(state, op);
  if (!roll || !canClose(state, roll, op)) return state;
  const phase = phaseAfterClose(roll);
  if (!phase) return state;
  const closed = phase === "shares" ? { ...roll, participants: committedPeers(roll) } : roll;
  return withRoll(state, enterPhase(closed, op, phase));
}

function slimOp(op) {
  return { opId: op.opId, type: op.type, payload: op.payload, actor: op.actor, lamport: op.lamport, ts: op.ts, pubKeyJwk: op.pubKeyJwk, sig: op.sig };
}

function evictOldestRoll(rolls) {
  const ids = Object.keys(rolls);
  if (ids.length <= MAX_LOGGED_ROLLS) return rolls;
  const oldest = ids.reduce((min, id) => (rolls[id].seq < rolls[min].seq ? id : min), ids[0]);
  return Object.fromEntries(Object.entries(rolls).filter(([id]) => id !== oldest));
}

function addRollOp(ops, op, slim) {
  const rollId = String(op.payload?.rollId || "");
  if (!isSafeKey(rollId)) return ops;
  const entry = Object.hasOwn(ops.rolls, rollId) ? ops.rolls[rollId] : null;
  const seq = entry ? entry.seq : ops.seq + 1;
  const all = withEntry(ops.rolls, rollId, { seq, ops: [...(entry?.ops || []), slim] });
  const rolls = evictOldestRoll(all);
  const next = { ...ops, seq: Math.max(ops.seq, seq), rolls };
  return rolls === all ? next : { ...next, keys: pruneKeysInForce(next.keys, rolls) };
}

/** Descarta trocas de chave que nenhuma rolagem guardada mais usa (a vigente de cada par fica sempre). */
function pruneKeysInForce(keys, rolls) {
  const spans = rollSpans(Object.values(rolls));
  return Object.fromEntries(Object.entries(keys).map(([actor, list]) => [actor, keyOpsInForce(list, spans)]));
}

function addLoggedOp(ops, op) {
  const slim = slimOp(op);
  if (op.type === "FAIRPLAY_ADMIT" || op.type === "FAIRPLAY_REVOKE") {
    const target = String(op.payload.actor);
    return { ...ops, admit: withEntry(ops.admit, target, [...(ops.admit[target] || []), slim].slice(-MAX_ADMIT_EVENTS_PER_ACTOR)) };
  }
  if (op.type === "FAIRPLAY_KEY") return { ...ops, keys: withEntry(ops.keys, op.actor, [...(ops.keys[op.actor] || []), slim].slice(-MAX_KEY_OPS_PER_ACTOR)) };
  return addRollOp(ops, op, slim);
}

/** Guarda a op assinada que o reducer aceitou, para o estado poder ser refeito (recarga do Mestre, quem entra tarde). */
function logged(handler, { guardRevoked = true } = {}) {
  return (state, op) => {
    if (guardRevoked && isRevokedAt(fairplayOf(state), op)) return state;
    const next = handler(state, op);
    if (next === state) return state;
    const fp = fairplayOf(next);
    return { ...next, fairplay: seal({ ...fp, ops: addLoggedOp(fp.ops, op) }) };
  };
}

/**
 * Chaves de um par que as rolagens guardadas ainda usam: a vigente, a que valia na abertura de cada rolagem e as
 * trocadas durante ela. Assim o estado refeito tem os mesmos participantes, por mais trocas que o par tenha feito.
 */
function keyOpsInForce(list, spans) {
  const keep = new Set([list[list.length - 1]]);
  for (const { lo, hi } of spans) {
    let before = null;
    for (const k of list) {
      const lamport = Number(k.lamport) || 0;
      if (lamport < lo) before = k;
      else if (lamport <= hi) keep.add(k);
    }
    if (before) keep.add(before);
  }
  return list.filter((k) => keep.has(k));
}

function byLamport(a, b) {
  return (Number(a.lamport) || 0) - (Number(b.lamport) || 0) || String(a.opId).localeCompare(String(b.opId));
}

/**
 * Ops assinadas guardadas, na ordem de aplicação: todas as admissões e chaves vigentes e as rolagens mais novas, inteiras.
 * Se passar do orçamento de bytes, as rolagens mais antigas saem primeiro (admissões e chaves vigentes ficam).
 * @param {object} [fairplay] Bloco `fairplay` do estado.
 * @param {number} [maxBytes] Orçamento do JSON das ops (padrão: `SNAPSHOT_OPS_BUDGET`).
 * @returns {object[]} Ops ordenadas por `lamport` e `opId`.
 */
export function collectFairplayOps(fairplay, maxBytes = SNAPSHOT_OPS_BUDGET) {
  const { ops } = normalizeFairplayState(fairplay);
  const entries = Object.values(ops.rolls).sort((a, b) => a.seq - b.seq);
  let list = opsFor(ops, entries);
  while (entries.length && JSON.stringify(list).length > maxBytes) {
    entries.shift();
    list = opsFor(ops, entries);
  }
  return list;
}

function rollSpans(entries) {
  return entries.map((e) => ({ lo: Math.min(...e.ops.map((o) => Number(o.lamport) || 0)), hi: Math.max(...e.ops.map((o) => Number(o.lamport) || 0)) }));
}

function opsFor(ops, entries) {
  const spans = rollSpans(entries);
  const keys = Object.values(ops.keys).flatMap((list) => keyOpsInForce(list, spans));
  return [...Object.values(ops.admit).flat(), ...keys, ...entries.flatMap((e) => e.ops)].sort(byLamport);
}

/** Admissões, revogações e chaves valem para a mesa toda e nunca entram na conta de "rolagens mais novas". */
function isStandingOp(o) {
  return o.type === "FAIRPLAY_ADMIT" || o.type === "FAIRPLAY_REVOKE" || o.type === "FAIRPLAY_KEY";
}

/**
 * Aplica o mesmo teto do Mestre a uma lista recebida: admissões e chaves ficam, e só as rolagens mais novas (inteiras).
 * @param {unknown} list Ops recebidas (não confiáveis).
 * @returns {object[]} Ops de Fairplay dentro do teto, ordenadas por `lamport` e `opId`.
 */
export function limitFairplayOps(list) {
  const ops = (Array.isArray(list) ? list : []).filter((o) => o && typeof o === "object" && String(o.type).startsWith("FAIRPLAY_"));
  const base = ops.filter(isStandingOp).slice(0, MAX_KEYS * (MAX_KEY_OPS_PER_ACTOR + MAX_ADMIT_EVENTS_PER_ACTOR));
  const groups = new Map();
  for (const o of ops) {
    const id = String(o.payload?.rollId || "");
    if (!groups.has(id)) groups.set(id, []);
    if (!isStandingOp(o)) groups.get(id).push(o);
  }
  const opened = [...groups.values()].filter((g) => g.length).map((g) => ({ g, first: Math.min(...g.map((o) => Number(o.lamport) || 0)) }));
  const newest = opened.sort((x, y) => x.first - y.first).slice(-MAX_LOGGED_ROLLS);
  return [...base, ...newest.flatMap((e) => e.g)].sort(byLamport);
}

/** Manipuladores das operações Fairplay para o reducer da campanha (ADR-040 §2.1). */
export const FAIRPLAY_OP_HANDLERS = {
  FAIRPLAY_ADMIT: logged(applyFairplayAdmit, { guardRevoked: false }),
  FAIRPLAY_REVOKE: logged(applyFairplayRevoke, { guardRevoked: false }),
  FAIRPLAY_KEY: logged(applyFairplayKey),
  FAIRPLAY_OPEN: logged(applyFairplayOpen),
  FAIRPLAY_COMMIT: logged(applyFairplayCommit),
  FAIRPLAY_SHARES: logged(applyFairplayShares),
  FAIRPLAY_REVEAL: logged(applyFairplayReveal),
  FAIRPLAY_SHARE: logged(applyFairplayShareRelease),
  FAIRPLAY_CLOSE: logged(applyFairplayClose),
};

function hexToBytes(hex) {
  return Uint8Array.from(String(hex).match(/../g) || [], (h) => Number.parseInt(h, 16));
}

function heldHashes(roll, holder, ofPeer) {
  const list = Array.isArray(roll.shares[ofPeer]) ? roll.shares[ofPeer] : [];
  return new Set(list.filter((s) => s.to === holder).map((s) => s.shareHash));
}

/** Só entram na conta as partes liberadas cujo hash foi publicado em `FAIRPLAY_SHARES` para aquele guardião. */
async function recoveriesChecked(roll) {
  const out = {};
  for (const ofPeer of missingRevealers(roll)) {
    out[ofPeer] = [];
    for (const [holder, shares] of Object.entries(roll.released[ofPeer] || {})) {
      const promised = heldHashes(roll, holder, ofPeer);
      for (const s of shares) {
        if (promised.has(await fairplayShareHash(s))) out[ofPeer].push({ splitId: s.splitId, x: s.x, y: hexToBytes(s.y) });
      }
    }
  }
  return out;
}

async function resolverInput(roll) {
  const peers = committedPeers(roll);
  return {
    rollId: roll.rollId,
    sides: roll.sides,
    commits: peers.map((p) => roll.commits[p]),
    reveals: peers.filter((p) => Object.hasOwn(roll.reveals, p)).map((p) => ({ peerId: p, rollId: roll.rollId, seedBytes: hexToBytes(roll.reveals[p]) })),
    recoveries: await recoveriesChecked(roll),
  };
}

/**
 * Refaz, neste aparelho, a conta de uma rolagem Fairplay a partir do log e compara com o valor registrado.
 * Nunca devolve "verified" para rolagem que não fechou, foi abortada ou não confere (ADR-040 §2.2).
 * @param {object} state Estado da campanha deste aparelho.
 * @param {string} rollId Rolagem a conferir.
 * @param {number} [recordedValue] Valor anunciado no `ROLL_RECORDED`, quando houver.
 * @returns {Promise<{status: "verified"|"pending"|"unverified", reason: string, value?: number, recoveredPeerIds?: string[]}>} Veredito local.
 */
export async function verifyFairplayRecord(state, rollId, recordedValue) {
  const roll = isSafeKey(rollId) ? fairplayOf(state || {}).rolls[rollId] : null;
  if (!roll) return { status: "unverified", reason: "rolagem desconhecida neste aparelho" };
  if (roll.phase === "aborted") return { status: "unverified", reason: "rolagem não fechou: faltaram compromissos" };
  if (roll.phase !== "done") return { status: "pending", reason: `aguardando a fase ${roll.phase}` };
  const res = await resolveFairplayRoll(await resolverInput(roll));
  if (!res.ok) return { status: "unverified", reason: res.error };
  if (recordedValue !== undefined && Number(recordedValue) !== res.value) {
    return { status: "unverified", reason: "o valor registrado não confere com a conta", value: res.value };
  }
  return { status: "verified", reason: "conta refeita neste aparelho", value: res.value, recoveredPeerIds: res.recoveredPeerIds };
}
