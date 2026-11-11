/**
 * @file Chamada de ação (lote 1): a convocação ganha papéis com vagas e quórum mínimo.
 * Lógica pura, sem DOM. Spec: docs/specs/aviso-assinado-v0.md ("Chamada de ação").
 *
 * - Papéis e contagens viajam como **texto no topo** (`"jurídico:2,apoio:5"`): na assinatura v1,
 *   as chaves de dentro de um objeto aninhado ficam fora do que é assinado (`sig-format.js`).
 * - Quem assume um papel manda a resposta **por DM cifrada à coordenação**, nunca pelo gossip.
 *   O público vê só a contagem por papel que a coordenação assina (`aviso-papeis`).
 */

import { isModerator } from "./moderation.js";

export const ROLE_MAX = 6;
export const ROLE_NAME_MAX = 24;
export const ROLE_SLOTS_MAX = 99;
export const QUORUM_MAX = 999;
export const ROLE_CLAIM_TYPE = "aviso-papel";
export const ROLE_COUNT_TYPE = "aviso-papeis";

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;
const ITEM_RE = /^(.+?)\s+(\d{1,2})$/u;

const normalizeName = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const validName = (name) => name.length >= 2 && name.length <= ROLE_NAME_MAX && NAME_RE.test(name);
const validSlots = (n) => Number.isInteger(n) && n >= 1 && n <= ROLE_SLOTS_MAX;

/** "Jurídico 2, comunicação 3" → "jurídico:2,comunicação:3"; vazio → ""; inválido → null. */
export function parseRoleInput(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const items = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!items.length || items.length > ROLE_MAX) return null;
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const m = ITEM_RE.exec(item);
    const name = m ? normalizeName(m[1]) : "";
    const slots = m ? Number(m[2]) : 0;
    if (!validName(name) || !validSlots(slots) || seen.has(name)) return null;
    seen.add(name);
    out.push(`${name}:${slots}`);
  }
  return out.join(",");
}

/** Texto do topo → `[{ role, n }]`. Itens malformados ficam de fora. */
export function decodeRoleList(encoded) {
  return String(encoded ?? "")
    .split(",")
    .map((part) => part.split(":"))
    .filter(([name, n]) => validName(String(name ?? "")) && /^\d{1,3}$/.test(String(n ?? "")))
    .map(([role, n]) => ({ role, n: Number(n) }));
}

const totalSlots = (encoded) => decodeRoleList(encoded).reduce((sum, r) => sum + r.n, 0);

/** Problemas dos campos de papel de um rascunho (vazia = válido). Só convocação leva papéis. */
export function validateRoleFields(draft = {}) {
  const roles = parseRoleInput(draft.roleSlots);
  const quorum = Number(draft.quorumMin || 0);
  const problems = [];
  if (roles === null || (roles && draft.avisoKind !== "convocacao")) problems.push("roleSlots");
  const quorumBad = !Number.isInteger(quorum) || quorum < 0 || quorum > QUORUM_MAX;
  if (quorum && (!roles || quorumBad || quorum > totalSlots(roles))) problems.push("quorumMin");
  return problems;
}

/** Campos de papel prontos para o corpo do aviso (só os que existem). */
export function roleFields(draft = {}) {
  const roleSlots = parseRoleInput(draft.roleSlots);
  if (!roleSlots) return {};
  const quorum = Number(draft.quorumMin || 0);
  return { roleSlots, quorumMin: quorum > 0 ? quorum : totalSlots(roleSlots) };
}

/** Corpo assinado de quem assume um papel (ou desiste, com `role` vazio). Vai só por DM. */
export function buildRoleClaim(aviso, role, { display = "" } = {}, now = Date.now()) {
  if (!aviso?.id || !aviso.communityId) throw new Error("Aviso sem id ou comunidade.");
  const wanted = normalizeName(role);
  if (wanted && !decodeRoleList(aviso.roleSlots).some((r) => r.role === wanted)) {
    throw new Error(`Papel fora do aviso: ${wanted}`);
  }
  return {
    type: ROLE_CLAIM_TYPE,
    communityId: aviso.communityId,
    avisoId: aviso.id,
    role: wanted,
    authorDisplay: String(display || "").slice(0, 60),
    ts: now,
  };
}

/** Carga da DM: `__vox_dm_v2` primeiro, para o leitor antigo mostrar só o texto. */
export function serializeRoleClaimDm(signedClaim, text = "") {
  return JSON.stringify({ __vox_dm_v2: 1, kind: ROLE_CLAIM_TYPE, text: String(text), contextCard: null, claim: signedClaim });
}

function isWellFormedClaim(c) {
  if (!c || typeof c !== "object" || c.type !== ROLE_CLAIM_TYPE) return false;
  if (!c.avisoId || !c.communityId || !c.author || !(Number(c.ts) > 0)) return false;
  return c.role === "" || validName(String(c.role ?? ""));
}

/** A resposta assinada contida na DM, ou null. */
export function parseRoleClaimDm(raw) {
  const str = String(raw ?? "");
  if (!str.startsWith('{"__vox_dm_v2":1')) return null;
  try {
    const parsed = JSON.parse(str);
    return parsed?.kind === ROLE_CLAIM_TYPE && isWellFormedClaim(parsed.claim) ? parsed.claim : null;
  } catch {
    return null;
  }
}

/** Última resposta de cada pessoa para o aviso (quem desistiu fica com `role` vazio). */
export function latestClaims(claims = [], avisoId = "") {
  const latest = new Map();
  for (const c of claims) {
    if (!isWellFormedClaim(c) || c.avisoId !== avisoId) continue;
    const prev = latest.get(c.author);
    if (!prev || Number(c.ts) >= Number(prev.ts)) latest.set(c.author, c);
  }
  return latest;
}

/** Quantas pessoas em cada papel (só no aparelho da coordenação). */
export function tallyRoles(claims = [], avisoId = "") {
  const counts = {};
  for (const c of latestClaims(claims, avisoId).values()) {
    if (c.role) counts[c.role] = (counts[c.role] || 0) + 1;
  }
  return counts;
}

/** Corpo da contagem por papel que a coordenação assina e publica: só números. */
export function buildRoleCount(aviso, counts = {}, now = Date.now()) {
  if (!aviso?.id || !aviso.communityId) throw new Error("Aviso sem id ou comunidade.");
  const countRoles = decodeRoleList(aviso.roleSlots)
    .map(({ role }) => `${role}:${Math.max(0, Math.floor(Number(counts[role]) || 0))}`)
    .join(",");
  return { type: ROLE_COUNT_TYPE, communityId: aviso.communityId, avisoId: aviso.id, countRoles, countedAt: now, ts: now };
}

function isCountByModeration(c, avisoId, meta) {
  if (c?.type !== ROLE_COUNT_TYPE || c.avisoId !== avisoId) return false;
  return isModerator(String(c.author || c.owner || ""), meta?.owner, meta?.moderators);
}

/** Contagem por papel que vale: a mais recente de dono ou moderação. */
export function latestRoleCount(items = [], avisoId = "", meta = {}) {
  let best = null;
  for (const c of items) {
    if (!isCountByModeration(c, avisoId, meta)) continue;
    if (!best || Number(c.countedAt || 0) >= Number(best.countedAt || 0)) best = c;
  }
  return best;
}

function stateOf(filled, quorum, eventAt, now) {
  if (filled >= quorum) return "quorum";
  return Number(eventAt) > 0 && now >= Number(eventAt) ? "sem-quorum" : "aberta";
}

/** Situação da chamada: vagas preenchidas por papel, total e estado (`aberta`, `quorum`, `sem-quorum`). */
export function actionCallState(aviso, roleCount = null, now = Date.now()) {
  const slots = decodeRoleList(aviso?.roleSlots);
  if (!slots.length) return null;
  const filledBy = Object.fromEntries(decodeRoleList(roleCount?.countRoles).map((r) => [r.role, r.n]));
  const roles = slots.map(({ role, n }) => ({ role, slots: n, filled: filledBy[role] || 0 }));
  const filled = roles.reduce((sum, r) => sum + Math.min(r.filled, r.slots), 0);
  const quorum = Number(aviso.quorumMin) > 0 ? Number(aviso.quorumMin) : totalSlots(aviso.roleSlots);
  return { roles, filled, quorum, counted: Boolean(roleCount), state: stateOf(filled, quorum, aviso.eventAt, now) };
}

/** "jurídico" → "Jurídico". */
export function roleLabel(role) {
  const s = String(role ?? "");
  return s ? s[0].toLocaleUpperCase("pt-BR") + s.slice(1) : "";
}

export const SKILL_MAX = 12;

/** Competências (lote 2): "Jurídico, comunicação" → ["jurídico", "comunicação"]; vazio → []; inválido → null. */
export function parseSkillsInput(input) {
  const names = String(input ?? "").split(",").map(normalizeName).filter(Boolean);
  if (names.length > SKILL_MAX || !names.every(validName)) return null;
  return [...new Set(names)];
}

/** Papéis da chamada que batem com as competências marcadas no aparelho e ainda têm vaga. */
export function suggestedRoles(skills = [], call = null) {
  const mine = new Set(skills);
  return (call?.roles || []).filter((r) => mine.has(r.role) && r.filled < r.slots).map((r) => r.role);
}
