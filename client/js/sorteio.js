/**
 * @file Sorteio cívico (lote 4): escolhe N pessoas de uma lista congelada sem que ninguém controle o resultado.
 * Lógica pura, sem DOM. Spec: docs/specs/aviso-assinado-v0.md ("Sorteio cívico").
 *
 * 1. A moderação publica o sorteio (`sorteio`): lista congelada, N vagas, ciclo e prazo dos compromissos.
 * 2. Testemunhas publicam o hash de um segredo (`sorteio-compromisso`).
 * 3. A moderação fecha os compromissos (`sorteio-fecho`); só depois disso alguém revela.
 * 4. Testemunhas revelam (`sorteio-revela`).
 * 5. A moderação apura (`sorteio-apuracao`): fixa quais revelações entram. Com 2 ou mais, todo aparelho
 *    calcula o mesmo resultado; revelação válida deixada de fora aparece como "ignorada".
 * Basta uma testemunha honesta para ninguém prever o resultado. Quem não revela fica apontado.
 * Listas viajam como texto no topo (assinatura v1).
 */

import { isModerator } from "./moderation.js";

export const SORTEIO_TYPE = "sorteio";
export const COMMIT_TYPE = "sorteio-compromisso";
export const CLOSE_TYPE = "sorteio-fecho";
export const REVEAL_TYPE = "sorteio-revela";
export const TALLY_TYPE = "sorteio-apuracao";
export const MIN_REVEALS = 2;
export const ROSTER_MAX = 500;

const HEX64 = /^[0-9a-f]{64}$/;
const ROUTE_RE = /^[A-Za-z0-9_-]{3,80}$/;

async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lista de membros como texto: endereços válidos, sem repetir, em ordem. */
export function encodeRoster(members = []) {
  return [...new Set([...members].map(String).filter((m) => ROUTE_RE.test(m)))].sort().join(",");
}

export const decodeRoster = (roster) => String(roster ?? "").split(",").filter((m) => ROUTE_RE.test(m));

/** Problemas do rascunho do sorteio (vazia = válido). */
export function validateSorteioDraft({ title = "", seats = 0, members = [], commitUntil = 0 } = {}, now = Date.now()) {
  const problems = [];
  const n = decodeRoster(encodeRoster(members)).length;
  if (String(title).trim().length < 4) problems.push("title");
  if (!Number.isInteger(Number(seats)) || Number(seats) < 1 || Number(seats) >= n) problems.push("seats");
  if (n < 2 || n > ROSTER_MAX) problems.push("roster");
  if (!(Number(commitUntil) > now)) problems.push("commitUntil");
  return problems;
}

/** Corpo do sorteio que a moderação assina: a lista fica congelada aqui. */
export async function buildSorteio({ communityId, title, seats, members, commitUntil, cycle = "" }, now = Date.now()) {
  const problems = validateSorteioDraft({ title, seats, members, commitUntil }, now);
  if (!communityId || problems.length) throw new Error(`Sorteio inválido: ${problems.join(", ") || "sem comunidade"}`);
  const roster = encodeRoster(members);
  return {
    type: SORTEIO_TYPE, communityId, title: String(title).trim().slice(0, 80), cycle: String(cycle).slice(0, 40),
    seats: Number(seats), roster, rosterHash: await sha256Hex(roster), commitUntil: Number(commitUntil), ts: now,
  };
}

/** Segredo novo da testemunha (fica só no aparelho até a revelação). */
export function newSecret() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compromisso: só o hash do segredo vai a público. */
export async function buildCommit(sorteio, secret, now = Date.now()) {
  return { type: COMMIT_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, commit: await sha256Hex(secret), ts: now };
}

/** Fecho da moderação: os compromissos aceitos, como "autor:hash,…". */
export function buildClose(sorteio, commits = [], now = Date.now()) {
  const latest = latestByAuthor(commits.filter((c) => isCommitFor(c, sorteio)));
  const commitList = [...latest.values()].map((c) => `${c.author}:${c.commit}`).sort().join(",");
  return { type: CLOSE_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, commits: commitList, ts: now };
}

export function buildReveal(sorteio, secret, now = Date.now()) {
  return { type: REVEAL_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, secret: String(secret), ts: now };
}

function isCommitFor(c, sorteio) {
  return c?.type === COMMIT_TYPE && c.sorteioId === sorteio.id && HEX64.test(String(c.commit)) && ROUTE_RE.test(String(c.author));
}

function latestByAuthor(items) {
  const latest = new Map();
  for (const it of items) {
    const prev = latest.get(it.author);
    if (!prev || Number(it.ts) >= Number(prev.ts)) latest.set(it.author, it);
  }
  return latest;
}

const byModeration = (item, meta) => isModerator(String(item?.author || ""), meta?.owner, meta?.moderators);

/** O fecho (ou a apuração) que vale: o primeiro publicado pela moderação; depois dele, nada muda. */
export function firstByModeration(items = [], type = CLOSE_TYPE, sorteio = {}, meta = {}) {
  const found = items.filter((c) => c?.type === type && c.sorteioId === sorteio.id && byModeration(c, meta));
  return found.sort((a, b) => Number(a.ts) - Number(b.ts))[0] || null;
}

export function decodeCommits(list) {
  return String(list ?? "").split(",").map((p) => p.split(":")).filter(([a, h]) => ROUTE_RE.test(String(a)) && HEX64.test(String(h)));
}

/** Revelações que batem com o fecho: `{ valid: Map autor→segredo, missing: [autores] }`. */
export async function matchReveals(close, reveals = []) {
  const valid = new Map();
  for (const [author, commit] of decodeCommits(close?.commits)) {
    const mine = reveals.filter((r) => r?.type === REVEAL_TYPE && r.sorteioId === close.sorteioId && r.author === author);
    for (const r of mine) {
      if ((await sha256Hex(r.secret)) === commit) { valid.set(author, String(r.secret)); break; }
    }
  }
  const missing = decodeCommits(close?.commits).map(([a]) => a).filter((a) => !valid.has(a));
  return { valid, missing };
}

/** Apuração da moderação: quem revelou e bateu com o fecho, como "autor,autor". */
export function buildTally(sorteio, valid, now = Date.now()) {
  return { type: TALLY_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, revealed: [...valid.keys()].sort().join(","), ts: now };
}

/** Semente: SHA-256(revelações ordenadas ‖ comunidade ‖ ciclo ‖ hash da lista). */
export async function drawSeed(sorteio, valid) {
  const reveals = [...valid].sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, s]) => `${a}:${s}`).join("|");
  return sha256Hex(`${reveals}|${sorteio.communityId}|${sorteio.cycle || ""}|${sorteio.rosterHash}`);
}

/** Escolhe `seats` nomes da lista: embaralhamento determinístico a partir da semente. */
export async function pickWinners(roster, seats, seed) {
  const pool = decodeRoster(roster);
  const chosen = [];
  for (let i = 0; i < Math.min(seats, pool.length); i += 1) {
    const r = BigInt(`0x${await sha256Hex(`${seed}:${i}`)}`);
    chosen.push(pool.splice(Number(r % BigInt(pool.length)), 1)[0]);
  }
  return chosen;
}

function tallied(valid, tally) {
  const listed = new Set(decodeRoster(tally.revealed));
  const kept = new Map([...valid].filter(([a]) => listed.has(a)));
  return { kept, ignored: [...valid.keys()].filter((a) => !listed.has(a)) };
}

/**
 * Situação: `compromissos`, `sem-testemunhas`, `revelacao` (esperando a apuração) ou `sorteado` (com nomes).
 * `missing`: quem se comprometeu e não revelou; `ignored`: revelação válida que a apuração deixou de fora.
 */
export async function sorteioState(sorteio, { close = null, reveals = [], tally = null } = {}) {
  if (!close) return { phase: "compromissos", witnesses: 0 };
  const witnesses = decodeCommits(close.commits).length;
  const { valid, missing } = await matchReveals(close, reveals);
  if (witnesses < MIN_REVEALS) return { phase: "sem-testemunhas", witnesses, revealed: valid.size, missing };
  if (!tally) return { phase: "revelacao", witnesses, revealed: valid.size, missing };
  const { kept, ignored } = tallied(valid, tally);
  if (kept.size < MIN_REVEALS) return { phase: "sem-testemunhas", witnesses, revealed: kept.size, missing, ignored };
  const seed = await drawSeed(sorteio, kept);
  const winners = await pickWinners(sorteio.roster, sorteio.seats, seed);
  return { phase: "sorteado", witnesses, revealed: kept.size, missing, ignored, seed, winners };
}
