/**
 * @file Aviso assinado v0 — lógica pura (lote A). Spec: docs/specs/aviso-assinado-v0.md.
 * O aviso é um `topic` com campos de aviso no topo (PM-85); o selo só vale para dono ou moderação (PM-09).
 * Sem DOM e sem IndexedDB: quem chama assina (`signPayload`), guarda e espalha.
 */

import { avisoExpiresAt, isAvisoTopic } from "../aviso/aviso-link.js";
import { isModerator } from "./moderation.js";
import { roleFields, validateRoleFields } from "./aviso-roles.js";

export { AVISO_LINK_MAX, avisoCode, avisoExpiresAt, decodeAvisoFragment, encodeAvisoFragment, isAvisoTopic, personCode } from "../aviso/aviso-link.js";

export const AVISO_KINDS = Object.freeze(["convocacao", "informe", "alerta"]);
/** Reservado até o parecer jurídico: recusado na montagem e sem selo na leitura. */
export const AVISO_KIND_BLOCKED = "cobranca";
export const AVISO_CHOICES = Object.freeze(["ciente", "vou", "talvez", "nao-vou"]);
export const AVISO_TITLE_MIN = 8;
export const AVISO_TITLE_MAX = 80;
export const AVISO_BODY_MAX = 280;
export const AVISO_PLACE_MAX = 80;


const text = (v) => String(v ?? "").trim();

/** Lista dos problemas de um rascunho de aviso (vazia = válido). */
export function validateAvisoDraft(draft = {}) {
  const problems = [];
  const kind = draft.avisoKind;
  if (!text(draft.communityId)) problems.push("communityId");
  if (!AVISO_KINDS.includes(kind)) problems.push("avisoKind");
  const title = text(draft.title);
  if (title.length < AVISO_TITLE_MIN || title.length > AVISO_TITLE_MAX) problems.push("title");
  if (text(draft.body).length > AVISO_BODY_MAX) problems.push("body");
  if (text(draft.eventPlace).length > AVISO_PLACE_MAX) problems.push("eventPlace");
  const hasEvent = Number(draft.eventAt) > 0;
  if (kind === "convocacao" && !hasEvent) problems.push("eventAt");
  if (kind !== "convocacao" && hasEvent) problems.push("eventAt");
  return [...problems, ...validateRoleFields(draft)];
}

function optionalFields(draft) {
  const out = {};
  if (Number(draft.eventAt) > 0) out.eventAt = Number(draft.eventAt);
  if (text(draft.eventPlace)) out.eventPlace = text(draft.eventPlace);
  if (Number(draft.expiresAt) > 0) out.expiresAt = Number(draft.expiresAt);
  if (text(draft.cancels)) out.cancels = text(draft.cancels);
  return { ...out, ...roleFields(draft) };
}

/** Corpo do tópico-aviso, pronto para `signPayload`. Lança se o rascunho é inválido. */
export function buildAviso(draft = {}, now = Date.now()) {
  const problems = validateAvisoDraft(draft);
  if (problems.length) throw new Error(`Aviso inválido: ${problems.join(", ")}`);
  return {
    type: "topic",
    communityId: text(draft.communityId),
    avisoKind: draft.avisoKind,
    title: text(draft.title),
    body: text(draft.body),
    ...optionalFields(draft),
    authorAvatar: "",
    ts: now,
  };
}

const authorOf = (post) => String(post?.author || post?.owner || "");
const isModAuthor = (post, meta) => isModerator(authorOf(post), meta?.owner, meta?.moderators);

/** Selo "Aviso da coordenação": tipo conhecido, mesma comunidade e autor dono ou moderação. */
export function hasAvisoSeal(post, meta) {
  if (!isAvisoTopic(post) || !AVISO_KINDS.includes(post.avisoKind)) return false;
  if (meta?.id && post.communityId !== meta.id) return false;
  return isModAuthor(post, meta);
}

/** Ids cancelados por avisos com selo. */
function cancelledIds(sealed) {
  return new Set(sealed.map((p) => p.cancels).filter(Boolean));
}

/** Estado de cada aviso com selo: `ativo`, `encerrado` ou `cancelado` (mais novo primeiro). */
export function classifyAvisos(posts = [], meta = {}, now = Date.now()) {
  const sealed = posts.filter((p) => hasAvisoSeal(p, meta));
  const cancelled = cancelledIds(sealed);
  const stateOf = (p) => {
    if (cancelled.has(p.id)) return "cancelado";
    return avisoExpiresAt(p) <= now ? "encerrado" : "ativo";
  };
  return sealed
    .map((p) => ({ ...p, avisoState: stateOf(p) }))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}

/** O aviso que fica no topo: o ativo mais recente, ou `null`. */
export function pinnedAviso(posts = [], meta = {}, now = Date.now()) {
  return classifyAvisos(posts, meta, now).find((p) => p.avisoState === "ativo") || null;
}

/** Corpo da resposta assinada de um membro. */
export function buildAvisoResponse(aviso, choice, now = Date.now()) {
  if (!aviso?.id || !aviso.communityId) throw new Error("Aviso sem id ou comunidade.");
  if (!AVISO_CHOICES.includes(choice)) throw new Error(`Resposta inválida: ${choice}`);
  return { type: "aviso-resposta", communityId: aviso.communityId, avisoId: aviso.id, choice, ts: now };
}

function latestPerAuthor(responses, avisoId) {
  const latest = new Map();
  for (const r of responses) {
    if (r?.type !== "aviso-resposta" || r.avisoId !== avisoId) continue;
    if (!r.author || !AVISO_CHOICES.includes(r.choice)) continue;
    const prev = latest.get(r.author);
    if (!prev || Number(r.ts || 0) >= Number(prev.ts || 0)) latest.set(r.author, r);
  }
  return latest;
}

const emptyCounts = () => Object.fromEntries(AVISO_CHOICES.map((c) => [c, 0]));

/** Respostas assinadas: última por autor; membros contam no total, os demais à parte. */
export function tallyAvisoResponses(responses = [], avisoId = "", members = new Set()) {
  const members_ = members instanceof Set ? members : new Set(members);
  const result = { members: emptyCounts(), outsiders: emptyCounts(), total: 0 };
  for (const r of latestPerAuthor(responses, avisoId).values()) {
    const bucket = members_.has(r.author) ? result.members : result.outsiders;
    bucket[r.choice] += 1;
    if (bucket === result.members) result.total += 1;
  }
  return result;
}

const toCount = (n) => Math.max(0, Math.floor(Number(n) || 0));

/** Corpo da contagem colada do WhatsApp: só números. */
export function buildAvisoCount(aviso, counts = {}, now = Date.now()) {
  if (!aviso?.id || !aviso.communityId) throw new Error("Aviso sem id ou comunidade.");
  return {
    type: "aviso-contagem",
    communityId: aviso.communityId,
    avisoId: aviso.id,
    countCiente: toCount(counts.ciente),
    countVou: toCount(counts.vou),
    countTalvez: toCount(counts.talvez),
    countNaoVou: toCount(counts["nao-vou"]),
    countedAt: now,
    ts: now,
  };
}

/** Contagem que vale: a mais recente de dono ou moderação para o aviso. */
export function latestAvisoCount(items = [], avisoId = "", meta = {}) {
  let best = null;
  for (const c of items) {
    if (c?.type !== "aviso-contagem" || c.avisoId !== avisoId || !isModAuthor(c, meta)) continue;
    if (!best || Number(c.countedAt || 0) >= Number(best.countedAt || 0)) best = c;
  }
  return best;
}


function formatWhen(eventAt) {
  return new Date(eventAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Texto pronto para o WhatsApp, sem link (o link de conferência vai à parte, sob demanda). */
export function buildAvisoShareText({ aviso, communityName = "", code = "" }) {
  const lines = [`📣 *Aviso — ${communityName || "comunidade"}*`, `*${aviso.title}*`];
  if (aviso.body) lines.push(aviso.body);
  if (aviso.eventAt) lines.push(`Quando: ${formatWhen(aviso.eventAt)}${aviso.eventPlace ? ` · ${aviso.eventPlace}` : ""}`);
  const options = aviso.eventAt ? "✅ Ciente · 🙋 Vou · 🤔 Talvez · ❌ Não vou" : "✅ Ciente";
  lines.push(`Responda aqui: ${options}`);
  if (code) lines.push(`Código do aviso: ${code}`);
  return lines.join("\n");
}

/** Segunda mensagem, gerada só quando a coordenação pede: o link de conferência. */
export function buildAvisoLinkMessage({ code = "", link }) {
  if (!link) throw new Error("Link de conferência vazio.");
  const which = code ? `o aviso ${code}` : "o aviso";
  return `🔒 Conferir se ${which} veio da coordenação: ${link}`;
}
