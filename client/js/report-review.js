/**
 * @file PM-69 — "uma denúncia arquiva" (ADR-020 §2.1), lógica pura.
 *
 * Quem denuncia manda ao moderador, por DM cifrada, a denúncia **assinada pela própria conta**
 * (o envelope da DM não autentica o remetente; a assinatura sim). O aparelho do moderador confere
 * a assinatura e as salvaguardas e, se passar, publica a ação assinada `review-hide`
 * ("arquivado, aguardando revisão"). Quem denuncia continua anônimo na malha: a denúncia
 * assinada só existe dentro da DM.
 */

import { findReason, isGraveReason } from "./report.js";

export const REVIEW_HIDE_ACTION = "review-hide";
export const REVIEW_QUEUE_KEY = "vox-report-review-v1";
export const REVIEW_DEADLINE_MS = 48 * 60 * 60 * 1000;
export const MAX_PENDING_PER_REPORTER = 3;
export const REJECTED_STREAK_LIMIT = 3;
export const REPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SIGNED_REPORT_TYPE = "vox-report";
const CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_CASES = 300;
const OPEN_STATUSES = new Set(["pending", "manual"]);

/** Corpo da denúncia que quem denuncia assina (sem o texto livre: ele vai só na mensagem). */
export function buildSignedReportBody(report) {
  return {
    type: SIGNED_REPORT_TYPE,
    reportId: String(report?.id || ""),
    postId: String(report?.postId || ""),
    communityId: String(report?.communityId || ""),
    reason: String(report?.reason || ""),
    ts: Number(report?.ts) || 0,
  };
}

/** Texto e cartão que a DM mostra no fio de quem denuncia e de quem modera. */
export function buildReportDmMessage(report) {
  const label = findReason(report?.reason)?.label || "publicação";
  const detail = String(report?.detail || "").trim();
  return {
    text: detail ? `Denúncia: ${label}\n${detail}` : `Denúncia: ${label}`,
    contextCard: { type: "topic", id: String(report?.postId || ""), title: `Denúncia: ${label}`, communityId: report?.communityId || "" },
  };
}

/** Carga da DM. `__vox_dm_v2` vem primeiro para o leitor antigo tratar como mensagem com texto e cartão. */
export function serializeReportDm(signedReport, { text = "", contextCard = null } = {}) {
  return JSON.stringify({ __vox_dm_v2: 1, kind: "report", text: String(text), contextCard, report: signedReport });
}

function isWellFormedSignedReport(r) {
  if (!r || typeof r !== "object" || r.type !== SIGNED_REPORT_TYPE) return false;
  if (!r.reportId || !r.postId || !r.communityId || !r.author) return false;
  return Boolean(findReason(r.reason)) && Number(r.ts) > 0;
}

/** Devolve a denúncia assinada contida na DM, ou null se a DM não for uma denúncia bem formada. */
export function parseReportDm(raw) {
  const str = String(raw ?? "");
  if (!str.startsWith('{"__vox_dm_v2":1')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed?.kind !== "report") return null;
    return isWellFormedSignedReport(parsed.report) ? parsed.report : null;
  } catch {
    return null;
  }
}

/** Assinatura válida e data plausível (nem velha demais, nem no futuro). */
export async function verifySignedReport(signed, { verify, now = Date.now() } = {}) {
  if (!isWellFormedSignedReport(signed) || typeof verify !== "function") return false;
  const ts = Number(signed.ts);
  if (ts > now + CLOCK_SKEW_MS || now - ts > REPORT_MAX_AGE_MS) return false;
  return Boolean(await verify(signed));
}

export function listCases(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(REVIEW_QUEUE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((c) => c && c.reportId && c.postId) : [];
  } catch {
    return [];
  }
}

export function saveCases(cases, storage = globalThis.localStorage) {
  const next = cases.slice(0, MAX_CASES);
  try {
    storage?.setItem(REVIEW_QUEUE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function pendingCountFor(cases, reporter) {
  return cases.filter((c) => c.reporter === reporter && c.status === "pending").length;
}

/** Quantas denúncias resolvidas mais recentes da pessoa foram rejeitadas em sequência. */
export function rejectedStreak(cases, reporter) {
  const resolved = cases
    .filter((c) => c.reporter === reporter && !OPEN_STATUSES.has(c.status))
    .sort((a, b) => (Number(b.resolvedAt) || 0) - (Number(a.resolvedAt) || 0));
  let streak = 0;
  for (const c of resolved) {
    if (c.status !== "restored") break;
    streak++;
  }
  return streak;
}

/**
 * Decide se a denúncia arquiva para todos. Ordem: repetida, membro, conflito de interesse,
 * já em revisão, limite de pendentes, sequência de rejeitadas.
 */
export function decideAutoArchive({ cases = [], reportId, postId, reporter, isMember, targetIsModerator }) {
  if (cases.some((c) => c.reportId === reportId)) return { archive: false, why: "duplicate" };
  if (!isMember) return { archive: false, why: "not-member" };
  if (targetIsModerator) return { archive: false, why: "moderator-target" };
  if (cases.some((c) => c.postId === postId && c.status === "pending")) return { archive: false, why: "already-in-review" };
  if (pendingCountFor(cases, reporter) >= MAX_PENDING_PER_REPORTER) return { archive: false, why: "too-many-pending" };
  if (rejectedStreak(cases, reporter) >= REJECTED_STREAK_LIMIT) return { archive: false, why: "rejected-streak" };
  return { archive: true, why: "ok" };
}

const SKIP_TEXT = Object.freeze({
  "not-member": "quem denunciou não é membro desta comunidade",
  "moderator-target": "a publicação é de alguém da moderação (conflito de interesse: precisa de outra pessoa)",
  "already-in-review": "a publicação já está arquivada, aguardando revisão",
  "too-many-pending": `quem denunciou já tem ${MAX_PENDING_PER_REPORTER} denúncias pendentes`,
  "rejected-streak": `as últimas ${REJECTED_STREAK_LIMIT} denúncias dessa pessoa foram rejeitadas`,
});

/** Por que a denúncia não arquivou sozinha (texto para quem modera). */
export function describeSkip(why) {
  return SKIP_TEXT[why] || "";
}

/** Caso da fila. "pending" = arquivado aguardando revisão; "manual" = não arquivou, a moderação decide. */
export function buildCase(signed, decision, now = Date.now()) {
  const inReview = decision.archive || decision.why === "already-in-review";
  return {
    reportId: signed.reportId,
    postId: signed.postId,
    communityId: signed.communityId,
    reason: signed.reason,
    grave: isGraveReason(signed.reason),
    reporter: signed.author,
    reportedAt: Number(signed.ts),
    receivedAt: now,
    status: inReview ? "pending" : "manual",
    why: decision.why,
  };
}

export function addCase(kase, storage = globalThis.localStorage) {
  return saveCases([kase, ...listCases(storage).filter((c) => c.reportId !== kase.reportId)], storage);
}

/** Fecha todos os casos abertos da publicação: "restored" (volta) ou "kept" (mantém arquivado). */
export function resolveCasesForPost(postId, outcome, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!["restored", "kept"].includes(outcome)) throw new Error("Decisão de revisão inválida.");
  let changed = 0;
  const next = listCases(storage).map((c) => {
    if (c.postId !== postId || !OPEN_STATUSES.has(c.status)) return c;
    changed++;
    return { ...c, status: outcome, resolvedAt: now };
  });
  saveCases(next, storage);
  return changed;
}

export function openCasesForPost(postId, storage = globalThis.localStorage) {
  return listCases(storage).filter((c) => c.postId === postId && OPEN_STATUSES.has(c.status));
}

export function openCasesForCommunity(communityId, storage = globalThis.localStorage) {
  return listCases(storage).filter((c) => c.communityId === communityId && OPEN_STATUSES.has(c.status));
}

/** "faltam 5 h" / "venceu há 2 h", contando o prazo a partir de `sinceTs`. */
export function describeDeadline(sinceTs, now = Date.now()) {
  const left = Number(sinceTs) + REVIEW_DEADLINE_MS - now;
  const hours = Math.max(1, Math.round(Math.abs(left) / 3_600_000));
  return left >= 0 ? `faltam ${hours} h` : `venceu há ${hours} h`;
}
