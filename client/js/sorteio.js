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

/** @type {string} Tipo do anúncio de sorteio publicado pela moderação. */
export const SORTEIO_TYPE = "sorteio";
/** @type {string} Tipo do compromisso (hash do segredo da testemunha). */
export const COMMIT_TYPE = "sorteio-compromisso";
/** @type {string} Tipo do fecho dos compromissos publicado pela moderação. */
export const CLOSE_TYPE = "sorteio-fecho";
/** @type {string} Tipo da revelação do segredo da testemunha. */
export const REVEAL_TYPE = "sorteio-revela";
/** @type {string} Tipo da apuração assinada pela moderação. */
export const TALLY_TYPE = "sorteio-apuracao";
/** @type {number} Mínimo de testemunhas válidas para concluir um sorteio. */
export const MIN_REVEALS = 2;
/** @type {number} Limite de membros congelados na lista do sorteio. */
export const ROSTER_MAX = 500;

const HEX64 = /^[0-9a-f]{64}$/;
const ROUTE_RE = /^[A-Za-z0-9_-]{3,80}$/;

async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Serializa a lista de membros elegíveis como texto ordenado e sem duplicatas.
 *
 * @param {string[]} [members=[]] Rotas candidatas ao sorteio.
 * @returns {string} Endereços válidos separados por vírgula.
 */
export function encodeRoster(members = []) {
  return [...new Set([...members].map(String).filter((m) => ROUTE_RE.test(m)))].sort().join(",");
}

/**
 * Converte a lista serializada de membros em vetor de rotas válidas.
 *
 * @param {string} [roster=""] Lista serializada por `encodeRoster`.
 * @returns {string[]} Rotas válidas extraídas.
 */
export const decodeRoster = (roster) => String(roster ?? "").split(",").filter((m) => ROUTE_RE.test(m));

/**
 * Valida o rascunho de um sorteio cívico.
 *
 * @param {object} [draft={}] Dados do rascunho (`title`, `seats`, `members`, `commitUntil`).
 * @param {number} [now=Date.now()] Timestamp de referência em ms.
 * @returns {string[]} Lista de campos inválidos (vazia quando válido).
 */
export function validateSorteioDraft({ title = "", seats = 0, members = [], commitUntil = 0 } = {}, now = Date.now()) {
  const problems = [];
  const n = decodeRoster(encodeRoster(members)).length;
  if (String(title).trim().length < 4) problems.push("title");
  if (!Number.isInteger(Number(seats)) || Number(seats) < 1 || Number(seats) >= n) problems.push("seats");
  if (n < 2 || n > ROSTER_MAX) problems.push("roster");
  if (!(Number(commitUntil) > now)) problems.push("commitUntil");
  return problems;
}

/**
 * Monta o corpo do sorteio que a moderação assina, congelando a lista de membros.
 *
 * @param {object} opts Dados do sorteio (`communityId`, `title`, `seats`, `members`, `commitUntil`, `cycle`).
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {Promise<object>} Payload pronto para assinar.
 * @throws {Error} Quando o rascunho ou a comunidade são inválidos.
 */
export async function buildSorteio({ communityId, title, seats, members, commitUntil, cycle = "" }, now = Date.now()) {
  const problems = validateSorteioDraft({ title, seats, members, commitUntil }, now);
  if (!communityId || problems.length) throw new Error(`Sorteio inválido: ${problems.join(", ") || "sem comunidade"}`);
  const roster = encodeRoster(members);
  return {
    type: SORTEIO_TYPE, communityId, title: String(title).trim().slice(0, 80), cycle: String(cycle).slice(0, 40),
    seats: Number(seats), roster, rosterHash: await sha256Hex(roster), commitUntil: Number(commitUntil), ts: now,
  };
}

/**
 * Gera um segredo aleatório de 32 bytes em hex para a testemunha guardar até a revelação.
 *
 * @returns {string} Segredo hexadecimal de 64 caracteres.
 */
export function newSecret() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Monta o compromisso público da testemunha com o hash do segredo.
 *
 * @param {object} sorteio Registro do sorteio.
 * @param {string} secret Segredo gerado por `newSecret`.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {Promise<object>} Payload de compromisso.
 */
export async function buildCommit(sorteio, secret, now = Date.now()) {
  return { type: COMMIT_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, commit: await sha256Hex(secret), ts: now };
}

/**
 * Monta o fecho dos compromissos aceitos pela moderação (`autor:hash,…`).
 *
 * @param {object} sorteio Registro do sorteio.
 * @param {object[]} [commits=[]] Compromissos recebidos.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {object} Payload de fecho.
 */
export function buildClose(sorteio, commits = [], now = Date.now()) {
  const latest = latestByAuthor(commits.filter((c) => isCommitFor(c, sorteio)));
  const commitList = [...latest.values()].map((c) => `${c.author}:${c.commit}`).sort().join(",");
  return { type: CLOSE_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, commits: commitList, ts: now };
}

/**
 * Monta a revelação do segredo de uma testemunha após o fecho.
 *
 * @param {object} sorteio Registro do sorteio.
 * @param {string} secret Segredo guardado pela testemunha.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {object} Payload de revelação.
 */
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

/**
 * Retorna o primeiro evento oficial publicado pela moderação (fecho ou apuração).
 *
 * @param {object[]} [items=[]] Lista de eventos do tipo alvo.
 * @param {string} [type=CLOSE_TYPE] Tipo esperado (`CLOSE_TYPE` ou `TALLY_TYPE`).
 * @param {object} [sorteio={}] Registro do sorteio.
 * @param {object} [meta={}] Metadados da comunidade (`owner`, `moderators`).
 * @returns {object|null} Evento válido mais antigo da moderação, ou `null`.
 */
export function firstByModeration(items = [], type = CLOSE_TYPE, sorteio = {}, meta = {}) {
  const found = items.filter((c) => c?.type === type && c.sorteioId === sorteio.id && byModeration(c, meta));
  return found.sort((a, b) => Number(a.ts) - Number(b.ts))[0] || null;
}

/**
 * Decodifica a lista serializada de compromissos (`autor:hash,…`).
 *
 * @param {string} [list=""] Texto serializado em `close.commits`.
 * @returns {Array<[string, string]>} Pares `[autor, hash]`.
 */
export function decodeCommits(list) {
  return String(list ?? "").split(",").map((p) => p.split(":")).filter(([a, h]) => ROUTE_RE.test(String(a)) && HEX64.test(String(h)));
}

/**
 * Confere quais revelações batem com os hashes do fecho.
 *
 * @param {object|null} close Registro de fecho.
 * @param {object[]} [reveals=[]] Revelações publicadas.
 * @returns {Promise<{valid: Map<string, string>, missing: string[]}>} Revelações válidas e autores faltantes.
 */
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

/**
 * Monta a apuração da moderação com as testemunhas cujas revelações bateram.
 *
 * @param {object} sorteio Registro do sorteio.
 * @param {Map<string, string>} valid Mapa autor → segredo validado.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {object} Payload de apuração.
 */
export function buildTally(sorteio, valid, now = Date.now()) {
  return { type: TALLY_TYPE, communityId: sorteio.communityId, sorteioId: sorteio.id, revealed: [...valid.keys()].sort().join(","), ts: now };
}

/**
 * Calcula a semente determinística: `SHA-256(revelações ordenadas | comunidade | ciclo | rosterHash)`.
 *
 * @param {object} sorteio Registro do sorteio.
 * @param {Map<string, string>} valid Mapa autor → segredo validado.
 * @returns {Promise<string>} Semente em hex (64 caracteres).
 */
export async function drawSeed(sorteio, valid) {
  const reveals = [...valid].sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, s]) => `${a}:${s}`).join("|");
  return sha256Hex(`${reveals}|${sorteio.communityId}|${sorteio.cycle || ""}|${sorteio.rosterHash}`);
}

/**
 * Escolhe `seats` nomes da lista por embaralhamento determinístico a partir da semente.
 *
 * @param {string} roster Lista serializada por `encodeRoster`.
 * @param {number} seats Quantidade de vagas.
 * @param {string} seed Semente hexadecimal gerada por `drawSeed`.
 * @returns {Promise<string[]>} Rotas sorteadas em ordem de seleção.
 */
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
 * Calcula a fase atual e os vencedores (quando apurado) de um sorteio.
 *
 * @param {object} sorteio Registro do sorteio.
 * @param {object} [events={}] Eventos associados (`close`, `reveals`, `tally`).
 * @returns {Promise<object>} Estado consolidado do sorteio.
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
