/**
 * LAN-12 — denúncia de publicação (lógica pura, sem DOM).
 * A denúncia fica registrada no aparelho, o post é ocultado para quem denunciou e,
 * quando há comunidade com moderador conhecido, a pessoa pode enviar a denúncia por DM cifrada.
 * A identidade de quem denuncia NUNCA vai para o gossip público (risco de retaliação).
 */

export const REPORTS_STORAGE_KEY = "vox-reports-v1";
export const MAX_REPORTS = 200;
export const MAX_DETAIL_LEN = 500;

export const REPORT_REASONS = Object.freeze([
  { id: "spam", label: "Spam, golpe ou fraude", grave: false },
  { id: "assedio", label: "Assédio ou ameaça a uma pessoa", grave: false },
  { id: "odio", label: "Discurso de ódio ou discriminação", grave: false },
  { id: "falso", label: "Perfil falso ou se passando por alguém", grave: false },
  { id: "intimo", label: "Imagem íntima sem consentimento", grave: true },
  { id: "crianca", label: "Abuso ou exploração sexual de criança ou adolescente", grave: true },
  { id: "violencia", label: "Terrorismo, incitação à violência ou ameaça grave", grave: true },
  { id: "outro", label: "Outro motivo", grave: false },
]);

/** Canais oficiais para casos graves (o Vox não substitui as autoridades). */
export const OFFICIAL_CHANNELS_PT = Object.freeze([
  { label: "SaferNet Brasil — denúncia anônima de crimes na internet", href: "https://new.safernet.org.br/denuncie" },
  { label: "Disque 100 — Direitos Humanos (crianças, adolescentes e outras violações)", href: "tel:100" },
  { label: "Ligue 180 — Central de Atendimento à Mulher", href: "tel:180" },
  { label: "190 — Polícia Militar, em emergência", href: "tel:190" },
]);

export function findReason(reasonId) {
  return REPORT_REASONS.find((r) => r.id === reasonId) || null;
}

export function isGraveReason(reasonId) {
  return Boolean(findReason(reasonId)?.grave);
}

/** Valida e normaliza; lança Error com mensagem em português. */
export function buildReport({ postId, authorRoute = "", communityId = "", reason, detail = "" } = {}, now = Date.now()) {
  if (!postId) throw new Error("Publicação não identificada.");
  if (!findReason(reason)) throw new Error("Escolha um motivo para a denúncia.");
  return {
    id: `rep_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    postId: String(postId),
    authorRoute: String(authorRoute || ""),
    communityId: String(communityId || ""),
    reason,
    detail: String(detail || "").trim().slice(0, MAX_DETAIL_LEN),
    ts: now,
  };
}

export function listReports() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(REPORTS_STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveReport(report) {
  const next = [report, ...listReports().filter((r) => r.id !== report.id)].slice(0, MAX_REPORTS);
  try {
    globalThis.localStorage?.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function hasReported(postId) {
  return listReports().some((r) => r.postId === postId);
}

/** Hash da DM para o moderador, com cartão de contexto do post (sem dados de quem denuncia na URL). */
export function buildModeratorDmHash(moderatorRoute, report) {
  if (!moderatorRoute || !report) return "";
  const q = new URLSearchParams({
    ctxType: "topic",
    ctxId: report.postId,
    ctxTitle: `Denúncia: ${findReason(report.reason)?.label || "publicação"}`,
  });
  if (report.communityId) q.set("c", report.communityId);
  return `#/dm/${encodeURIComponent(moderatorRoute)}?${q.toString()}`;
}
