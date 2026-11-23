/**
 * @file PM-23 — Lógica de domínio do Modo Assembleia (v0) no cliente.
 * Estende `aviso` (`convocacao`) com campos planos compatíveis com `sigv` 1/2,
 * valida `blockReason` e `decisionStatus`, calcula recorrência de rituais
 * e produz atas em JSON e Markdown com paridade exata a `scripts/assembly-minutes.mjs`.
 *
 * @module assembly-minutes
 * @see docs/specs/modo-assembleia-v0.md
 * @see scripts/assembly-minutes.mjs
 */
import * as aviso from "./aviso.js";

/** Versão canônica do esquema da ata exportada (PM-23). */
export const ASSEMBLY_SCHEMA_VERSION = "1.0.0";

/** Status pós-decisão permitidos pela spec (Decidim / Brasil Participativo). */
export const POST_DECISION_STATUSES = Object.freeze(["em_andamento", "cumprida", "arquivada"]);

/** Regras de ritual recorrente aceitas no v0.1. */
export const VALID_RITUAL_RULES = Object.freeze(["monthly"]);

/** Tamanho máximo do motivo de bloqueio (`blockReason`). */
export const MAX_BLOCK_REASON_LEN = 280;

const VALID_VOTE_CHOICES = new Set(["yes", "no", "abstain", "block"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DEFAULT_DURATION_MS = 7_200_000;

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
 * Converte linhas de texto ou array em itens de pauta normalizados.
 * @param {string|Array<object>} raw Texto multilinha ou lista de itens.
 * @returns {Array<{id: string, title: string, proposalId: string}>}
 */
export function parseAgendaLines(raw) {
  if (Array.isArray(raw)) {
    return raw
      .filter((item) => isPlainObject(item) && cleanText(item.title))
      .map((item, idx) => {
        const id = cleanText(item.id) || `pauta-${idx + 1}`;
        return { id, title: cleanText(item.title), proposalId: cleanText(item.proposalId) || id };
      });
  }
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean)
    .map((title, idx) => ({ id: `pauta-${idx + 1}`, title, proposalId: `pauta-${idx + 1}` }));
}

/**
 * Valida motivo de bloqueio; obrigatório (1..280 chars) quando `choice === "block"`.
 * @param {string} choice Escolha do voto.
 * @param {unknown} rawReason Motivo informado.
 * @returns {{ok: boolean, reason: string}}
 */
export function validateBlockReason(choice, rawReason) {
  if (choice !== "block") return { ok: true, reason: "" };
  const reason = cleanText(rawReason);
  if (!reason || reason.length > MAX_BLOCK_REASON_LEN) return { ok: false, reason: "" };
  return { ok: true, reason };
}

/**
 * Valida status pós-decisão (`em_andamento`, `cumprida`, `arquivada`).
 * @param {unknown} status Status bruto.
 * @returns {string|null} Status válido ou `null`.
 */
export function validatePostDecisionStatus(status) {
  const clean = cleanText(status);
  return POST_DECISION_STATUSES.includes(clean) ? clean : null;
}

/**
 * Monta payload plano de atualização pós-decisão (`decisionStatus`), pronto para `signPayload`.
 * @param {{communityId: string, assemblyId: string, decisionStatus: string}} input Dados da atualização.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {object}
 */
export function buildDecisionStatusUpdate({ communityId, assemblyId, decisionStatus }, now = Date.now()) {
  const validStatus = validatePostDecisionStatus(decisionStatus);
  if (!validStatus) throw new RangeError(`decisionStatus inválido: ${String(decisionStatus)}`);
  if (!cleanText(communityId) || !cleanText(assemblyId)) {
    throw new TypeError("communityId e assemblyId são obrigatórios.");
  }
  return {
    type: "assembly-status",
    communityId: cleanText(communityId),
    assemblyId: cleanText(assemblyId),
    decisionStatus: validStatus,
    ts: now,
  };
}

/**
 * Monta convocação de assembleia estendendo `aviso` (`convocacao`) com campos planos.
 * @param {object} draft Rascunho da convocação com pauta, data, quórum e ritual opcional.
 * @param {number} [now=Date.now()] Instante de criação em ms.
 * @returns {object} Payload pronto para `signPayload`.
 */
export function buildAssemblyConvocacao(draft = {}, now = Date.now()) {
  const agenda = parseAgendaLines(draft.assemblyAgenda ?? draft.agenda);
  if (!agenda.length) throw new Error("Assembleia precisa de pelo menos 1 item de pauta.");
  const rule = cleanText(draft.ritualRule);
  if (rule && !VALID_RITUAL_RULES.includes(rule)) throw new RangeError(`ritualRule inválida: ${rule}`);
  const quorum = draft.quorumMin == null || draft.quorumMin === "" ? 1 : Number(draft.quorumMin);
  if (!Number.isInteger(quorum) || quorum < 0) throw new RangeError("quorumMin deve ser inteiro >= 0.");
  const base = aviso.buildAviso({
    communityId: draft.communityId,
    avisoKind: "convocacao",
    title: draft.title,
    body: draft.body || "",
    eventAt: draft.eventAt,
    eventPlace: draft.eventPlace || "",
  }, now);
  const closesAt = Number(draft.assemblyClosesAt) > 0 ? Number(draft.assemblyClosesAt) : base.eventAt + DEFAULT_DURATION_MS;
  const out = { ...base, assemblyAgenda: agenda.map((a) => a.title).join("\n"), assemblyQuorumMin: quorum, assemblyClosesAt: closesAt };
  if (rule) out.ritualRule = rule;
  return out;
}

/**
 * Identifica se um post é uma convocação do Modo Assembleia.
 * @param {object} post Post verificado.
 * @returns {boolean}
 */
export function isAssemblyConvocacao(post) {
  return post?.type === "topic" && post.avisoKind === "convocacao" && (Boolean(cleanText(post.assemblyAgenda)) || Boolean(cleanText(post.ritualRule)));
}

/**
 * Calcula a próxima ocorrência de um ritual recorrente a partir do último `eventAt`.
 * @param {number} eventAt Timestamp base do encontro em ms.
 * @param {string} ritualRule Regra de recorrência (ex.: `"monthly"`).
 * @param {number} [now=Date.now()] Instante de referência em ms.
 * @returns {{nextAt: number, label: string}|null}
 */
export function nextRitualOccurrence(eventAt, ritualRule, now = Date.now()) {
  if (ritualRule !== "monthly" || !Number.isFinite(Number(eventAt)) || Number(eventAt) <= 0) return null;
  const dt = new Date(Number(eventAt));
  let guard = 0;
  while (dt.getTime() <= now && guard < 120) {
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    guard += 1;
  }
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return { nextAt: dt.getTime(), label: `Todo mês · Próximo: ${dd}/${mm}` };
}

/**
 * Calcula SHA-256 em hexadecimal minúsculo via Web Crypto API.
 * @param {string} text Texto em UTF-8.
 * @returns {Promise<string>}
 */
export async function sha256HexClient(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ordena recursivamente chaves de objetos para serialização determinística.
 * @param {unknown} value Valor de entrada.
 * @returns {unknown}
 */
function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!isPlainObject(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    if (!FORBIDDEN_KEYS.has(key)) sorted[key] = canonicalizeValue(value[key]);
  }
  return sorted;
}

/**
 * Deduplica registros mantendo o de maior `signedAt` (em empate, o último).
 * @param {object[]} items Registros de entrada.
 * @param {(item: object) => string} keyFn Extrator de chave.
 * @returns {{items: object[], duplicatesRemoved: number}}
 */
function deduplicateByLatest(items, keyFn) {
  const byKey = new Map();
  let duplicatesRemoved = 0;
  for (const item of items) {
    const key = keyFn(item);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    duplicatesRemoved += 1;
    if (item.signedAt >= prev.signedAt) byKey.set(key, item);
  }
  return { items: [...byKey.values()], duplicatesRemoved };
}

/**
 * Converte respostas `aviso-resposta` em entradas de presença assinada para a ata.
 * @param {object[]} responses Respostas da comunidade.
 * @param {string} assemblyId ID da convocação.
 * @returns {Array<{pubkey: string, displayName: string, signedAt: number, sig: string}>}
 */
function responsesToAttendance(responses, assemblyId) {
  return (responses || [])
    .filter((r) => r?.type === "aviso-resposta" && r.avisoId === assemblyId && (r.choice === "vou" || r.choice === "ciente") && cleanText(r.sig))
    .map((r) => ({
      pubkey: cleanText(r.author || r.owner),
      displayName: cleanText(r.authorDisplay),
      signedAt: Number(r.ts || 0),
      sig: cleanText(r.sig),
    }))
    .filter((a) => a.pubkey && a.signedAt >= 0);
}

/**
 * Normaliza e valida um único voto contra a pauta; retorna `null` se inválido.
 * @param {object} vote Voto bruto.
 * @param {Set<string>} agendaIds Ids da pauta.
 * @returns {object|null}
 */
function normalizeSingleVote(vote, agendaIds) {
  if (!isPlainObject(vote)) return null;
  const agendaId = cleanText(vote.agendaId);
  const voterPubkey = cleanText(vote.voterPubkey || vote.author || vote.owner);
  const choice = cleanText(vote.choice);
  const sig = cleanText(vote.sig);
  if (!agendaIds.has(agendaId) || !voterPubkey || !VALID_VOTE_CHOICES.has(choice) || !sig) return null;
  const blockCheck = validateBlockReason(choice, vote.blockReason);
  if (!blockCheck.ok) return null;
  return { agendaId, voterPubkey, choice, blockReason: blockCheck.reason, signedAt: Number(vote.signedAt || vote.ts || 0), sig };
}

/**
 * Converte votos locais em entradas válidas do bundle, rejeitando `block` sem `blockReason`.
 * @param {object[]} votes Votos recebidos.
 * @param {Set<string>} agendaIds Ids da pauta.
 * @returns {Array<object>}
 */
function normalizeAssemblyVotes(votes, agendaIds) {
  return (votes || []).map((vote) => normalizeSingleVote(vote, agendaIds)).filter(Boolean);
}

/**
 * Monta o bundle compatível com `scripts/assembly-minutes.mjs` a partir dos posts locais.
 * @param {{convocacao: object, responses?: object[], votes?: object[]}} input Dados da assembleia.
 * @returns {object}
 */
export function buildAssemblyBundleFromPosts({ convocacao, responses = [], votes = [] }) {
  const parsedAgenda = parseAgendaLines(convocacao.assemblyAgenda);
  const agenda = parsedAgenda.length
    ? parsedAgenda
    : [{ id: "pauta-1", title: cleanText(convocacao.title) || "Pauta única", proposalId: "pauta-1" }];
  const agendaIds = new Set(agenda.map((item) => item.id));
  const convenedAt = Number(convocacao.eventAt || convocacao.ts || 0);
  const closedAt = Math.max(convenedAt, Number(convocacao.assemblyClosesAt || convenedAt + DEFAULT_DURATION_MS));
  const quorumMin = Number.isInteger(convocacao.assemblyQuorumMin) ? convocacao.assemblyQuorumMin : Number(convocacao.quorumMin || 0);
  return {
    assemblyId: cleanText(convocacao.id),
    communityId: cleanText(convocacao.communityId),
    title: cleanText(convocacao.title),
    convenedAt,
    closedAt,
    quorumMin,
    agenda,
    attendance: responsesToAttendance(responses, convocacao.id),
    votes: normalizeAssemblyVotes(votes, agendaIds),
  };
}

/**
 * Decide o status de um item da pauta conforme quórum e votos.
 * @param {boolean} quorumMet Quórum atingido.
 * @param {{yes: number, no: number, block: number}} counts Contagem do item.
 * @returns {"no_quorum"|"blocked"|"approved"|"rejected"}
 */
function resolveAgendaStatus(quorumMet, counts) {
  if (!quorumMet) return "no_quorum";
  if (counts.block > 0) return "blocked";
  return counts.yes > counts.no ? "approved" : "rejected";
}

/**
 * Decide o status geral da assembleia.
 * @param {boolean} quorumMet Quórum atingido.
 * @param {object[]} agendaTallies Itens apurados.
 * @returns {"no_quorum"|"blocked"|"approved"|"rejected"}
 */
function resolveOverallStatus(quorumMet, agendaTallies) {
  if (!quorumMet) return "no_quorum";
  if (agendaTallies.some((item) => item.decisionStatus === "blocked")) return "blocked";
  return agendaTallies.every((item) => item.decisionStatus === "approved") ? "approved" : "rejected";
}

/**
 * Apura um item de pauta.
 * @param {object} item Item da pauta.
 * @param {object[]} itemVotes Votos do item.
 * @param {boolean} quorumMet Quórum atingido.
 * @returns {object}
 */
function tallyAgendaItem(item, itemVotes, quorumMet) {
  const counts = { yes: 0, no: 0, abstain: 0, block: 0, total: 0 };
  const blockReasons = [];
  for (const vote of itemVotes) {
    counts[vote.choice] += 1;
    counts.total += 1;
    if (vote.choice === "block") {
      blockReasons.push({ voterPubkey: vote.voterPubkey, reason: vote.blockReason, signedAt: vote.signedAt });
    }
  }
  blockReasons.sort((a, b) => a.signedAt - b.signedAt || a.voterPubkey.localeCompare(b.voterPubkey));
  return { id: item.id, title: item.title, proposalId: item.proposalId, counts, blockReasons, decisionStatus: resolveAgendaStatus(quorumMet, counts) };
}

/**
 * Apura o bundle no cliente gerando o mesmo núcleo e `minutesHash` SHA-256 de `scripts/assembly-minutes.mjs`.
 * @param {object} bundle Bundle no formato canônico PM-23.
 * @returns {Promise<object>}
 */
export async function tallyAssemblyClient(bundle) {
  const agenda = parseAgendaLines(bundle.agenda);
  const agendaIds = new Set(agenda.map((i) => i.id));
  const dedupAtt = deduplicateByLatest(bundle.attendance || [], (e) => e.pubkey);
  const dedupVotes = deduplicateByLatest(normalizeAssemblyVotes(bundle.votes, agendaIds), (v) => `${v.agendaId}\u0000${v.voterPubkey}`);
  const attendance = dedupAtt.items.sort((a, b) => a.pubkey.localeCompare(b.pubkey));
  const votes = dedupVotes.items.sort((a, b) => a.agendaId.localeCompare(b.agendaId) || a.voterPubkey.localeCompare(b.voterPubkey));
  const quorumMet = attendance.length >= bundle.quorumMin;
  const byAgenda = new Map(agenda.map((i) => [i.id, []]));
  for (const v of votes) byAgenda.get(v.agendaId).push(v);
  const agendaTallies = agenda.map((i) => tallyAgendaItem(i, byAgenda.get(i.id), quorumMet));
  const attRecords = await Promise.all(attendance.map(async (e) => ({ pubkey: e.pubkey, displayName: e.displayName || null, signedAt: e.signedAt, sigHash: await sha256HexClient(e.sig) })));
  const voteSigHashes = await Promise.all(votes.map(async (v) => ({ agendaId: v.agendaId, voterPubkey: v.voterPubkey, signedAt: v.signedAt, sigHash: await sha256HexClient(v.sig) })));
  const core = {
    schemaVersion: ASSEMBLY_SCHEMA_VERSION, assemblyId: bundle.assemblyId, communityId: bundle.communityId, title: bundle.title,
    convenedAt: bundle.convenedAt, closedAt: bundle.closedAt, quorumMin: bundle.quorumMin, attendanceCount: attendance.length, quorumMet,
    decisionStatus: resolveOverallStatus(quorumMet, agendaTallies), agenda: agendaTallies,
    blockReasons: agendaTallies.flatMap((i) => i.blockReasons.map((br) => ({ agendaId: i.id, ...br }))),
    attendance: attRecords, voteSigHashes, duplicateAttendanceRemoved: dedupAtt.duplicatesRemoved, duplicateVotesRemoved: dedupVotes.duplicatesRemoved,
    signatureVerification: { scope: "structural_presence_only", cryptographicVerified: false, attendanceSigCount: attendance.length, voteSigCount: votes.length },
  };
  return { ...core, minutesHash: await sha256HexClient(JSON.stringify(canonicalizeValue(core))) };
}

/**
 * Formata timestamp como `AAAA-MM-DD HH:MM:SS UTC`.
 * @param {number} ms Timestamp em ms.
 * @returns {string}
 */
const formatUtc = (ms) => `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;

/**
 * Renderiza seção de presença da ata em Markdown.
 * @param {object[]} attendance Registros de presença.
 * @returns {string}
 */
function renderAttendanceMd(attendance) {
  if (!attendance.length) return "_Nenhuma assinatura de presença registrada._";
  const rows = attendance.map((e) => {
    const label = e.displayName ? `${e.displayName} (\`${e.pubkey}\`)` : `\`${e.pubkey}\``;
    return `| ${label} | ${formatUtc(e.signedAt)} | \`${e.sigHash.slice(0, 16)}…\` |`;
  });
  return ["| Participante | Assinado em | Hash SHA-256 da assinatura |", "|---|---|---|", ...rows].join("\n");
}

/**
 * Renderiza item de pauta em Markdown.
 * @param {object} item Item apurado.
 * @param {number} index Índice (0-based).
 * @returns {string}
 */
function renderAgendaItemMd(item, index) {
  const c = item.counts;
  const lines = [
    `### ${index + 1}. ${item.title} (\`${item.id}\`)`, "",
    `- **Proposta:** \`${item.proposalId}\` · **Status da decisão (\`decisionStatus\`):** \`${item.decisionStatus}\``,
    `- **Votos:** Sim: **${c.yes}** · Não: **${c.no}** · Abstenção: **${c.abstain}** · Bloqueio: **${c.block}** (Total: ${c.total})`,
  ];
  if (item.blockReasons.length) {
    lines.push("- **Motivos de bloqueio (`blockReason`):**");
    for (const br of item.blockReasons) lines.push(`  - \`${br.voterPubkey}\` (${formatUtc(br.signedAt)}): ${br.reason}`);
  }
  return lines.join("\n");
}

/**
 * Renderiza ata apurada em Markdown idêntico ao de `scripts/assembly-minutes.mjs`.
 * @param {object} tally Resultado de `tallyAssemblyClient`.
 * @returns {string}
 */
export function renderAssemblyMinutesMarkdownClient(tally) {
  const sigInfo = tally.signatureVerification || {};
  return [
    `# Ata de Assembleia — ${tally.title}`, "",
    `- **Assembleia (\`assemblyId\`):** \`${tally.assemblyId}\` · **Comunidade:** \`${tally.communityId}\``,
    `- **Convocação:** ${formatUtc(tally.convenedAt)} · **Encerramento:** ${formatUtc(tally.closedAt)}`,
    `- **Presença / Quórum:** ${tally.attendanceCount} / ${tally.quorumMin} (**${tally.quorumMet ? "Quórum atingido" : "Sem quórum"}**)`,
    `- **Resultado geral (\`decisionStatus\`):** \`${tally.decisionStatus}\``,
    `- **Hash canônico da ata (\`minutesHash\` SHA-256):** \`${tally.minutesHash}\``, "",
    "## Escopo de verificação de assinaturas", "",
    "- **Verificação estrutural offline (`structural_presence_only`):** este validador verifica presença obrigatória de `sig`, `pubkey`/`voterPubkey`, `blockReason` em bloqueios e deduplica pelo último `signedAt`.",
    "- **Verificação criptográfica completa:** assinaturas Ed25519 contra chaves da comunidade devem ser conferidas pelo cliente/verificador (`verifyPayload`).", "",
    "## Lista de presença assinada", "", renderAttendanceMd(tally.attendance), "",
    "## Pauta e deliberações", "", tally.agenda.map(renderAgendaItemMd).join("\n\n"), "",
    "## Registro de auditoria", "",
    `- **Duplicatas removidas:** ${tally.duplicateAttendanceRemoved} presença(s), ${tally.duplicateVotesRemoved} voto(s).`,
    `- **Assinaturas indexadas:** ${sigInfo.attendanceSigCount ?? tally.attendance.length} presença(s), ${sigInfo.voteSigCount ?? 0} voto(s).`, "",
  ].join("\n");
}

/**
 * Serializa a ata apurada em JSON formatado.
 * @param {object} tally Resultado de `tallyAssemblyClient`.
 * @returns {string}
 */
export function serializeAssemblyMinutesJson(tally) {
  return `${JSON.stringify(tally, null, 2)}\n`;
}
