/**
 * @file PM-23 — Presença assinável e voto com prazo no Modo Assembleia (v0).
 * Fornece check-in assinado (`assembly-presence`), contagem de presentes únicos,
 * export conferível (JSON/Markdown com SHA-256), voto com prazo (`type: "vote"`)
 * respeitando `assemblyClosesAt` e obrigatoriedade de `blockReason` em bloqueios.
 *
 * @module assembly-presence
 * @see docs/specs/modo-assembleia-v0.md
 * @see client/js/assembly-minutes.js
 */
import {
  ASSEMBLY_SCHEMA_VERSION,
  parseAgendaLines,
  sha256HexClient,
  validateBlockReason,
} from "./assembly-minutes.js";

/** Tamanho máximo da observação opcional no check-in de presença. */
export const MAX_PRESENCE_NOTE_LEN = 140;

/** Escolhas válidas para voto de assembleia (compatível com governança + `block`). */
export const VALID_ASSEMBLY_VOTE_CHOICES = Object.freeze(["yes", "no", "abstain", "block"]);

const VALID_CHOICE_SET = new Set(VALID_ASSEMBLY_VOTE_CHOICES);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Converte valor em string aparada.
 * @param {unknown} value Valor bruto.
 * @returns {string}
 */
const cleanText = (value) => String(value ?? "").trim();

/**
 * Testa se o valor é objeto plano (não nulo e não array).
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Ordena recursivamente chaves de objetos para serialização determinística.
 * @param {unknown} value Valor de entrada.
 * @returns {unknown}
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    if (!FORBIDDEN_KEYS.has(key)) sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

/**
 * Formata timestamp como `AAAA-MM-DD HH:MM:SS UTC`.
 * @param {number} ms Timestamp em ms.
 * @returns {string}
 */
const formatUtc = (ms) => `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;

/**
 * Monta payload plano de check-in de presença (`assembly-presence`), pronto para `signPayload`.
 * @param {{communityId: string, assemblyId: string, note?: string}} input Dados do check-in.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {object}
 */
export function buildAssemblyPresenceCheckin({ communityId, assemblyId, note = "" }, now = Date.now()) {
  const cleanCommunity = cleanText(communityId);
  const cleanAssembly = cleanText(assemblyId);
  if (!cleanCommunity || !cleanAssembly) {
    throw new TypeError("communityId e assemblyId são obrigatórios.");
  }
  const cleanNote = cleanText(note);
  if (cleanNote.length > MAX_PRESENCE_NOTE_LEN) {
    throw new RangeError(`Observação de presença excede ${MAX_PRESENCE_NOTE_LEN} caracteres.`);
  }
  const payload = {
    type: "assembly-presence",
    communityId: cleanCommunity,
    assemblyId: cleanAssembly,
    present: true,
    ts: now,
  };
  if (cleanNote) payload.note = cleanNote;
  return payload;
}

/**
 * Valida e converte um registro bruto `assembly-presence` em entrada normalizada.
 * @param {object} item Registro bruto.
 * @param {string} targetId ID da assembleia alvo.
 * @returns {object|null}
 */
function parsePresenceRecord(item, targetId) {
  if (item?.type !== "assembly-presence" || item.assemblyId !== targetId || item.present === false) return null;
  const pubkey = cleanText(item.author || item.owner || item.pubkey);
  const sig = cleanText(item.sig);
  if (!pubkey || !sig) return null;
  return {
    pubkey,
    displayName: cleanText(item.authorDisplay || item.displayName),
    signedAt: Number(item.signedAt || item.ts || 0),
    note: cleanText(item.note),
    sig,
  };
}

/**
 * Consolida registros assinados `assembly-presence` em lista de presentes únicos.
 * Mantém o check-in mais recente de cada `pubkey` (em empate, o último).
 * @param {object[]} presences Registros `assembly-presence`.
 * @param {string} assemblyId ID da assembleia.
 * @returns {{assemblyId: string, uniqueCount: number, duplicatesRemoved: number, entries: Array<object>}}
 */
export function summarizeAssemblyPresence(presences = [], assemblyId = "") {
  const targetId = cleanText(assemblyId);
  const byPubkey = new Map();
  let duplicatesRemoved = 0;
  for (const item of presences || []) {
    const entry = parsePresenceRecord(item, targetId);
    if (!entry) continue;
    const prev = byPubkey.get(entry.pubkey);
    if (!prev) {
      byPubkey.set(entry.pubkey, entry);
      continue;
    }
    duplicatesRemoved += 1;
    if (entry.signedAt >= prev.signedAt) byPubkey.set(entry.pubkey, entry);
  }
  const entries = [...byPubkey.values()].sort((a, b) => a.pubkey.localeCompare(b.pubkey));
  return { assemblyId: targetId, uniqueCount: entries.length, duplicatesRemoved, entries };
}

/**
 * Produz estrutura conferível da lista de presença assinada com hashes SHA-256.
 * @param {{convocacao: object, presences?: object[]}} input Dados da assembleia.
 * @returns {Promise<object>}
 */
export async function buildPresenceExportData({ convocacao, presences = [] }) {
  const assemblyId = cleanText(convocacao?.id);
  const summary = summarizeAssemblyPresence(presences, assemblyId);
  const entries = await Promise.all(summary.entries.map(async (entry) => ({
    pubkey: entry.pubkey,
    displayName: entry.displayName || null,
    signedAt: entry.signedAt,
    note: entry.note || "",
    sigHash: await sha256HexClient(entry.sig),
  })));
  const core = {
    schemaVersion: ASSEMBLY_SCHEMA_VERSION,
    assemblyId,
    communityId: cleanText(convocacao?.communityId),
    title: cleanText(convocacao?.title),
    uniqueCount: entries.length,
    duplicatesRemoved: summary.duplicatesRemoved,
    entries,
  };
  const presenceHash = await sha256HexClient(JSON.stringify(canonicalize(core)));
  return { ...core, presenceHash };
}

/**
 * Renderiza a lista de presença assinada em Markdown conferível.
 * @param {object} data Resultado de `buildPresenceExportData`.
 * @returns {string}
 */
export function renderPresenceListMarkdown(data) {
  const rows = (data.entries || []).map((entry) => {
    const who = entry.displayName ? `${entry.displayName} (\`${entry.pubkey}\`)` : `\`${entry.pubkey}\``;
    const note = entry.note ? entry.note.replace(/\|/g, "\\|") : "—";
    return `| ${who} | ${formatUtc(entry.signedAt)} | ${note} | \`${entry.sigHash.slice(0, 16)}…\` |`;
  });
  const table = rows.length
    ? ["| Participante | Assinado em | Observação | Hash SHA-256 da assinatura |", "|---|---|---|---|", ...rows].join("\n")
    : "_Nenhuma presença assinada registrada._";
  return [
    `# Lista de Presença Assinada — ${data.title}`,
    "",
    `- **Assembleia (\`assemblyId\`):** \`${data.assemblyId}\` · **Comunidade:** \`${data.communityId}\``,
    `- **Presentes únicos:** ${data.uniqueCount} (duplicatas removidas: ${data.duplicatesRemoved})`,
    `- **Hash canônico da lista (\`presenceHash\` SHA-256):** \`${data.presenceHash}\``,
    "",
    table,
    "",
  ].join("\n");
}

/**
 * Serializa a lista de presença assinada em JSON formatado.
 * @param {object} data Resultado de `buildPresenceExportData`.
 * @returns {string}
 */
export function serializePresenceListJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Informa se a votação de uma assembleia ainda está dentro do prazo (`assemblyClosesAt`).
 * @param {object} convocacao Post de convocação.
 * @param {number} [now=Date.now()] Instante de referência em ms.
 * @returns {boolean}
 */
export function isAssemblyVotingOpen(convocacao, now = Date.now()) {
  const closesAt = Number(convocacao?.assemblyClosesAt || 0);
  if (!Number.isFinite(closesAt) || closesAt <= 0) return true;
  return now < closesAt;
}

/**
 * Resolve a lista de itens de pauta de uma convocação com fallback para pauta única.
 * @param {object} convocacao Post de convocação.
 * @returns {Array<{id: string, title: string, proposalId: string}>}
 */
function resolveAgendaItems(convocacao) {
  const parsed = parseAgendaLines(convocacao?.assemblyAgenda);
  if (parsed.length) return parsed;
  const title = cleanText(convocacao?.title);
  return title ? [{ id: "pauta-1", title, proposalId: "pauta-1" }] : [];
}

/**
 * Monta payload plano de voto de assembleia (`type: "vote"`), respeitando `assemblyClosesAt`
 * e exigindo `blockReason` (1–280 chars) quando `choice === "block"`.
 * @param {{convocacao: object, agendaId: string, choice: string, blockReason?: string}} input Dados do voto.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {object}
 */
export function buildAssemblyVote({ convocacao, agendaId, choice, blockReason = "" }, now = Date.now()) {
  if (!cleanText(convocacao?.id) || !cleanText(convocacao?.communityId)) {
    throw new TypeError("Convocação inválida para votação.");
  }
  if (!isAssemblyVotingOpen(convocacao, now)) {
    throw new Error("Prazo de votação encerrado.");
  }
  const agenda = resolveAgendaItems(convocacao);
  const item = agenda.find((entry) => entry.id === cleanText(agendaId));
  if (!item) throw new RangeError(`Item de pauta não encontrado: ${String(agendaId)}`);
  const cleanChoice = cleanText(choice).toLowerCase();
  if (!VALID_CHOICE_SET.has(cleanChoice)) throw new RangeError(`Escolha de voto inválida: ${String(choice)}`);
  const blockCheck = validateBlockReason(cleanChoice, blockReason);
  if (!blockCheck.ok) {
    throw new Error("Voto de bloqueio exige justificativa (blockReason, 1–280 caracteres).");
  }
  const payload = {
    type: "vote",
    communityId: cleanText(convocacao.communityId),
    assemblyId: cleanText(convocacao.id),
    agendaId: item.id,
    proposalId: item.proposalId || item.id,
    choice: cleanChoice,
    ts: now,
  };
  if (cleanChoice === "block") payload.blockReason = blockCheck.reason;
  return payload;
}

/**
 * Confere se o voto pertence à convocação e foi assinado dentro do prazo.
 * @param {object} vote Voto bruto.
 * @param {object} convocacao Convocação alvo.
 * @param {number} signedAt Timestamp do voto em ms.
 * @returns {boolean}
 */
function isVoteForAssemblyInTime(vote, convocacao, signedAt) {
  const voteAsmId = cleanText(vote.assemblyId);
  if (voteAsmId && voteAsmId !== cleanText(convocacao?.id)) return false;
  const closesAt = Number(convocacao?.assemblyClosesAt || 0);
  return !(closesAt > 0 && signedAt > closesAt);
}

/**
 * Valida e normaliza um voto de assembleia contra pauta e prazo (`assemblyClosesAt`).
 * @param {object} vote Voto bruto.
 * @param {object} convocacao Convocação alvo.
 * @param {Set<string>} agendaIds IDs válidos de pauta.
 * @returns {object|null}
 */
function normalizeAssemblyVote(vote, convocacao, agendaIds) {
  if (!isPlainObject(vote)) return null;
  const signedAt = Number(vote.signedAt || vote.ts || 0);
  if (!isVoteForAssemblyInTime(vote, convocacao, signedAt)) return null;
  const agendaId = cleanText(vote.agendaId);
  const voterPubkey = cleanText(vote.voterPubkey || vote.author || vote.owner);
  const choice = cleanText(vote.choice).toLowerCase();
  const sig = cleanText(vote.sig);
  if (!agendaIds.has(agendaId) || !voterPubkey || !VALID_CHOICE_SET.has(choice) || !sig) return null;
  const blockCheck = validateBlockReason(choice, vote.blockReason);
  if (!blockCheck.ok) return null;
  return { agendaId, voterPubkey, choice, blockReason: blockCheck.reason, signedAt, sig };
}

/**
 * Filtra votos válidos de uma assembleia (respeitando `assemblyClosesAt` e `blockReason`)
 * e deduplica mantendo o voto mais recente por `(agendaId, voterPubkey)`.
 * @param {object[]} votes Votos recebidos.
 * @param {object} convocacao Convocação alvo.
 * @returns {Array<object>}
 */
export function filterAssemblyVotes(votes = [], convocacao = {}) {
  const agendaIds = new Set(resolveAgendaItems(convocacao).map((item) => item.id));
  const byKey = new Map();
  for (const raw of votes || []) {
    const normalized = normalizeAssemblyVote(raw, convocacao, agendaIds);
    if (!normalized) continue;
    const key = `${normalized.agendaId}\u0000${normalized.voterPubkey}`;
    const prev = byKey.get(key);
    if (!prev || normalized.signedAt >= prev.signedAt) byKey.set(key, normalized);
  }
  return [...byKey.values()].sort(
    (a, b) => a.agendaId.localeCompare(b.agendaId) || a.voterPubkey.localeCompare(b.voterPubkey),
  );
}

/**
 * Apura votos de um único item de pauta.
 * @param {object} item Item da pauta.
 * @param {object[]} itemVotes Votos filtrados do item.
 * @param {boolean} quorumMet Quórum atingido.
 * @param {string} myRouteId Rota do usuário atual.
 * @returns {object}
 */
function tallySingleAgendaItem(item, itemVotes, quorumMet, myRouteId) {
  const counts = { yes: 0, no: 0, abstain: 0, block: 0, total: 0 };
  const blockReasons = [];
  let myVote = null;
  for (const vote of itemVotes) {
    counts[vote.choice] += 1;
    counts.total += 1;
    if (vote.choice === "block") {
      blockReasons.push({ voterPubkey: vote.voterPubkey, reason: vote.blockReason, signedAt: vote.signedAt });
    }
    if (myRouteId && vote.voterPubkey === myRouteId) {
      myVote = { choice: vote.choice, blockReason: vote.blockReason };
    }
  }
  let decisionStatus = "rejected";
  if (!quorumMet) decisionStatus = "no_quorum";
  else if (counts.block > 0) decisionStatus = "blocked";
  else if (counts.yes > counts.no) decisionStatus = "approved";
  return { id: item.id, title: item.title, proposalId: item.proposalId, counts, blockReasons, decisionStatus, myVote };
}

/**
 * Apura todos os itens da pauta de uma assembleia para exibição no painel.
 * @param {object} convocacao Post de convocação.
 * @param {object[]} [votes=[]] Votos locais.
 * @param {{quorumMet?: boolean, myRouteId?: string}} [options={}] Opções de apuração.
 * @returns {{items: Array<object>, totalVotes: number, overallDecisionStatus: string}}
 */
export function tallyAssemblyAgendaVotes(convocacao, votes = [], { quorumMet = true, myRouteId = "" } = {}) {
  const agenda = resolveAgendaItems(convocacao);
  const validVotes = filterAssemblyVotes(votes, convocacao);
  const byAgenda = new Map(agenda.map((item) => [item.id, []]));
  for (const vote of validVotes) byAgenda.get(vote.agendaId)?.push(vote);
  const items = agenda.map((item) => tallySingleAgendaItem(item, byAgenda.get(item.id) || [], quorumMet, myRouteId));
  let overallDecisionStatus = "rejected";
  if (!quorumMet) overallDecisionStatus = "no_quorum";
  else if (items.some((i) => i.decisionStatus === "blocked")) overallDecisionStatus = "blocked";
  else if (items.length && items.every((i) => i.decisionStatus === "approved")) overallDecisionStatus = "approved";
  return { items, totalVotes: validVotes.length, overallDecisionStatus };
}
