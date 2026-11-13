/**
 * @file Chamada de ação (civic lote 1) e competências (civic lote 2): a convocação ganha papéis com vagas
 * e quórum mínimo, e cada pessoa pode marcar no próprio aparelho o que sabe fazer.
 *
 * - Papéis e contagens viajam como **texto no primeiro nível** (`"jurídico:2,apoio:5"`): na assinatura v1,
 *   as chaves de dentro de um objeto aninhado ficam fora do que é assinado (`sig-format.js`, PM-85).
 * - Quem assume um papel manda a resposta **por DM cifrada à coordenação**, nunca pelo gossip.
 *   O público vê só a contagem por papel que a coordenação assina (`aviso-papeis`).
 * - Competências nunca saem do aparelho; servem só para sugerir papéis.
 *
 * Lógica pura, sem DOM.
 *
 * @module aviso-roles
 * @see docs/specs/aviso-assinado-v0.md (seção "Chamada de ação")
 * @see client/js/app/aviso-roles-dm.js (envio e recebimento por DM)
 */

import { isModerator } from "./moderation.js";

/**
 * Número máximo de papéis numa chamada.
 *
 * @type {number}
 */
export const ROLE_MAX = 6;

/**
 * Nome de papel: máximo de caracteres (mínimo 2; letras, números, espaço e hífen).
 *
 * @type {number}
 */
export const ROLE_NAME_MAX = 24;

/**
 * Vagas máximas por papel (dois dígitos no texto do formulário).
 *
 * @type {number}
 */
export const ROLE_SLOTS_MAX = 99;

/**
 * Quórum máximo aceito. Na prática o quórum também não passa da soma das vagas.
 *
 * @type {number}
 */
export const QUORUM_MAX = 999;

/**
 * Tipo do corpo assinado de quem assume um papel. Só viaja por DM.
 *
 * @type {string}
 */
export const ROLE_CLAIM_TYPE = "aviso-papel";

/**
 * Tipo do corpo assinado da contagem por papel, publicado pela coordenação.
 *
 * @type {string}
 */
export const ROLE_COUNT_TYPE = "aviso-papeis";

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;
const ITEM_RE = /^(.+?)\s+(\d{1,2})$/u;

const normalizeName = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const validName = (name) => name.length >= 2 && name.length <= ROLE_NAME_MAX && NAME_RE.test(name);
const validSlots = (n) => Number.isInteger(n) && n >= 1 && n <= ROLE_SLOTS_MAX;

/**
 * Converte o texto do formulário na lista de papéis que vai no corpo do aviso.
 *
 * @param {string} input Texto como `"Jurídico 2, comunicação 3"`.
 * @returns {string|null} `"jurídico:2,comunicação:3"`; `""` se vazio; `null` se inválido (nome ruim, vagas fora de 1–99, papel repetido ou mais de {@link ROLE_MAX}).
 */
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

/**
 * Lê a lista de papéis do corpo do aviso.
 *
 * @param {string} encoded Texto como `"jurídico:2,apoio:5"`.
 * @returns {Array<{role: string, n: number}>} Papéis com o número de vagas; itens malformados ficam de fora.
 */
export function decodeRoleList(encoded) {
  return String(encoded ?? "")
    .split(",")
    .map((part) => part.split(":"))
    .filter(([name, n]) => validName(String(name ?? "")) && /^\d{1,3}$/.test(String(n ?? "")))
    .map(([role, n]) => ({ role, n: Number(n) }));
}

const totalSlots = (encoded) => decodeRoleList(encoded).reduce((sum, r) => sum + r.n, 0);

/**
 * Valida os campos de papel de um rascunho. Só convocação leva papéis.
 *
 * @param {object} [draft={}] Rascunho do aviso.
 * @param {string} [draft.roleSlots] Texto do formulário (ver {@link parseRoleInput}).
 * @param {number|string} [draft.quorumMin] Quórum mínimo; não pode passar da soma das vagas.
 * @param {string} [draft.avisoKind] Tipo do aviso.
 * @returns {string[]} Campos com problema (`roleSlots`, `quorumMin`); vazia quando válido.
 */
export function validateRoleFields(draft = {}) {
  const roles = parseRoleInput(draft.roleSlots);
  const quorum = Number(draft.quorumMin || 0);
  const problems = [];
  if (roles === null || (roles && draft.avisoKind !== "convocacao")) problems.push("roleSlots");
  const quorumBad = !Number.isInteger(quorum) || quorum < 0 || quorum > QUORUM_MAX;
  if (quorum && (!roles || quorumBad || quorum > totalSlots(roles))) problems.push("quorumMin");
  return problems;
}

/**
 * Campos de papel prontos para o corpo do aviso; só os que existem.
 *
 * Sem quórum informado, o quórum é a soma das vagas.
 *
 * @param {object} [draft={}] Rascunho já validado.
 * @returns {{roleSlots?: string, quorumMin?: number}} Objeto vazio quando não há papéis.
 */
export function roleFields(draft = {}) {
  const roleSlots = parseRoleInput(draft.roleSlots);
  if (!roleSlots) return {};
  const quorum = Number(draft.quorumMin || 0);
  return { roleSlots, quorumMin: quorum > 0 ? quorum : totalSlots(roleSlots) };
}

/**
 * Monta o corpo assinado de quem assume um papel, ou desiste dele (`role` vazio).
 *
 * Vai só por DM cifrada à coordenação.
 *
 * @param {{id: string, communityId: string, roleSlots: string}} aviso Aviso da chamada.
 * @param {string} role Papel escolhido; vazio para desistir.
 * @param {object} [options={}]
 * @param {string} [options.display=""] Nome mostrado à coordenação (até 60 caracteres).
 * @param {number} [now=Date.now()] Instante, em ms.
 * @returns {object} Corpo `type: "aviso-papel"`, pronto para `signPayload`.
 * @throws {Error} Se o aviso não tem id ou comunidade, ou se o papel não existe nele.
 */
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

/**
 * Monta a carga da DM que leva a resposta assinada.
 *
 * `__vox_dm_v2` vem primeiro para o leitor antigo reconhecer o formato e mostrar só o texto.
 *
 * @param {object} signedClaim Resposta já assinada.
 * @param {string} [text=""] Texto legível que acompanha.
 * @returns {string} JSON da carga.
 */
export function serializeRoleClaimDm(signedClaim, text = "") {
  return JSON.stringify({ __vox_dm_v2: 1, kind: ROLE_CLAIM_TYPE, text: String(text), contextCard: null, claim: signedClaim });
}

function isWellFormedClaim(c) {
  if (!c || typeof c !== "object" || c.type !== ROLE_CLAIM_TYPE) return false;
  if (!c.avisoId || !c.communityId || !c.author || !(Number(c.ts) > 0)) return false;
  return c.role === "" || validName(String(c.role ?? ""));
}

/**
 * Extrai a resposta assinada de uma DM recebida.
 *
 * @param {string} raw Texto decifrado da DM.
 * @returns {object|null} A resposta, se a carga é deste tipo e está bem formada; senão `null`. A assinatura é conferida por quem chama.
 */
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

/**
 * Última resposta de cada pessoa para um aviso. Quem desistiu fica com `role` vazio.
 *
 * @param {object[]} [claims=[]] Respostas recebidas.
 * @param {string} [avisoId=""] Aviso da chamada.
 * @returns {Map<string, object>} Rota da pessoa → resposta mais recente.
 */
export function latestClaims(claims = [], avisoId = "") {
  const latest = new Map();
  for (const c of claims) {
    if (!isWellFormedClaim(c) || c.avisoId !== avisoId) continue;
    const prev = latest.get(c.author);
    if (!prev || Number(c.ts) >= Number(prev.ts)) latest.set(c.author, c);
  }
  return latest;
}

/**
 * Conta quantas pessoas estão em cada papel. Roda só no aparelho da coordenação.
 *
 * @param {object[]} [claims=[]] Respostas recebidas por DM.
 * @param {string} [avisoId=""] Aviso da chamada.
 * @returns {Object<string, number>} Papel → número de pessoas.
 */
export function tallyRoles(claims = [], avisoId = "") {
  const counts = {};
  for (const c of latestClaims(claims, avisoId).values()) {
    if (c.role) counts[c.role] = (counts[c.role] || 0) + 1;
  }
  return counts;
}

/**
 * Monta o corpo da contagem por papel que a coordenação assina e publica. Só números.
 *
 * @param {{id: string, communityId: string, roleSlots: string}} aviso Aviso da chamada.
 * @param {Object<string, number>} [counts={}] Papel → número de pessoas ({@link tallyRoles}).
 * @param {number} [now=Date.now()] Instante da contagem, em ms.
 * @returns {object} Corpo `type: "aviso-papeis"` com `countRoles` em texto.
 * @throws {Error} Se o aviso não tem id ou comunidade.
 */
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

/**
 * Escolhe a contagem por papel que vale: a mais recente de dono ou moderação.
 *
 * @param {object[]} [items=[]] Contagens já verificadas.
 * @param {string} [avisoId=""] Aviso da chamada.
 * @param {object} [meta={}] Metadados da comunidade (dono e moderação).
 * @returns {object|null} A contagem que vale, ou `null`.
 */
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

/**
 * Situação de uma chamada de ação.
 *
 * Vagas preenchidas além do número pedido não contam para o quórum. Depois da data do evento, uma
 * chamada sem quórum fica `sem-quorum`.
 *
 * @param {object} aviso Aviso com `roleSlots`, `quorumMin` e `eventAt`.
 * @param {object|null} [roleCount=null] Contagem que vale ({@link latestRoleCount}).
 * @param {number} [now=Date.now()] Instante de referência, em ms.
 * @returns {{roles: Array<{role: string, slots: number, filled: number}>, filled: number, quorum: number, counted: boolean, state: "aberta"|"quorum"|"sem-quorum"}|null} `null` quando o aviso não tem papéis.
 */
export function actionCallState(aviso, roleCount = null, now = Date.now()) {
  const slots = decodeRoleList(aviso?.roleSlots);
  if (!slots.length) return null;
  const filledBy = Object.fromEntries(decodeRoleList(roleCount?.countRoles).map((r) => [r.role, r.n]));
  const roles = slots.map(({ role, n }) => ({ role, slots: n, filled: filledBy[role] || 0 }));
  const filled = roles.reduce((sum, r) => sum + Math.min(r.filled, r.slots), 0);
  const quorum = Number(aviso.quorumMin) > 0 ? Number(aviso.quorumMin) : totalSlots(aviso.roleSlots);
  return { roles, filled, quorum, counted: Boolean(roleCount), state: stateOf(filled, quorum, aviso.eventAt, now) };
}

/**
 * Nome do papel para mostrar: primeira letra maiúscula.
 *
 * @param {string} role Nome normalizado (`"jurídico"`).
 * @returns {string} `"Jurídico"`.
 */
export function roleLabel(role) {
  const s = String(role ?? "");
  return s ? s[0].toLocaleUpperCase("pt-BR") + s.slice(1) : "";
}

/**
 * Número máximo de competências marcadas no aparelho.
 *
 * @type {number}
 */
export const SKILL_MAX = 12;

/**
 * Converte o texto de competências do formulário em lista normalizada.
 *
 * @param {string} input Texto como `"Jurídico, comunicação"`.
 * @returns {string[]|null} `["jurídico", "comunicação"]` sem repetição; `[]` se vazio; `null` se algum nome é inválido ou passa de {@link SKILL_MAX}.
 */
export function parseSkillsInput(input) {
  const names = String(input ?? "").split(",").map(normalizeName).filter(Boolean);
  if (names.length > SKILL_MAX || !names.every(validName)) return null;
  return [...new Set(names)];
}

/**
 * Papéis da chamada que batem com as competências do aparelho e ainda têm vaga.
 *
 * @param {string[]} [skills=[]] Competências marcadas no aparelho.
 * @param {{roles: Array<{role: string, slots: number, filled: number}>}|null} [call=null] Resultado de {@link actionCallState}.
 * @returns {string[]} Papéis sugeridos, na ordem da chamada.
 */
export function suggestedRoles(skills = [], call = null) {
  const mine = new Set(skills);
  return (call?.roles || []).filter((r) => mine.has(r.role) && r.filled < r.slots).map((r) => r.role);
}
