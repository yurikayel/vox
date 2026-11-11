/**
 * @file Aviso assinado v0 — lógica pura (lotes A, B e chamada de ação).
 *
 * O aviso é um `topic` com campos de aviso no topo do corpo, porque a assinatura v1 só cobre o primeiro
 * nível (PM-85). O selo "Aviso da coordenação" só vale para dono ou moderação da comunidade (PM-09).
 * Sem DOM e sem IndexedDB: quem chama assina (`signPayload`), guarda e espalha.
 *
 * @module aviso
 * @see docs/specs/aviso-assinado-v0.md
 * @see client/js/aviso-roles.js (papéis, vagas e quórum)
 */

import { avisoExpiresAt, isAvisoTopic } from "../aviso/aviso-link.js";
import { isModerator } from "./moderation.js";
import { roleFields, validateRoleFields } from "./aviso-roles.js";

export { AVISO_LINK_MAX, avisoCode, avisoExpiresAt, decodeAvisoFragment, encodeAvisoFragment, isAvisoTopic, personCode } from "../aviso/aviso-link.js";

/**
 * Tipos de aviso aceitos. `convocacao` exige data do evento; `informe` e `alerta` não podem ter data.
 *
 * @type {ReadonlyArray<"convocacao" | "informe" | "alerta">}
 */
export const AVISO_KINDS = Object.freeze(["convocacao", "informe", "alerta"]);

/** Reservado até o parecer jurídico: recusado na montagem e sem selo na leitura. */
export const AVISO_KIND_BLOCKED = "cobranca";

/**
 * Respostas que um membro pode dar. Sem data de evento, a interface só oferece `ciente`.
 *
 * @type {ReadonlyArray<"ciente" | "vou" | "talvez" | "nao-vou">}
 */
export const AVISO_CHOICES = Object.freeze(["ciente", "vou", "talvez", "nao-vou"]);

/**
 * Título mínimo, em caracteres (depois de `trim`). Evita aviso sem assunto.
 *
 * @type {number}
 */
export const AVISO_TITLE_MIN = 8;

/**
 * Título máximo, em caracteres. Cabe numa linha de notificação do WhatsApp.
 *
 * @type {number}
 */
export const AVISO_TITLE_MAX = 80;

/**
 * Corpo máximo, em caracteres. Aviso é curto por desenho; texto longo vai num post comum.
 *
 * @type {number}
 */
export const AVISO_BODY_MAX = 280;

/**
 * Local do evento, máximo em caracteres.
 *
 * @type {number}
 */
export const AVISO_PLACE_MAX = 80;


const text = (v) => String(v ?? "").trim();

/**
 * Valida um rascunho de aviso, incluindo os campos de chamada de ação.
 *
 * @param {object} [draft={}] Rascunho vindo do formulário.
 * @param {string} draft.communityId Comunidade onde o aviso vale.
 * @param {string} draft.avisoKind Um de {@link AVISO_KINDS}.
 * @param {string} draft.title Título ({@link AVISO_TITLE_MIN}–{@link AVISO_TITLE_MAX} caracteres).
 * @param {string} [draft.body] Corpo (até {@link AVISO_BODY_MAX}).
 * @param {number} [draft.eventAt] Data do evento em ms; obrigatória só em `convocacao`.
 * @param {string} [draft.eventPlace] Local do evento.
 * @returns {string[]} Nomes dos campos com problema; lista vazia quando o rascunho é válido.
 */
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

/**
 * Monta o corpo do tópico-aviso, pronto para `signPayload`.
 *
 * Campos opcionais (data, local, validade, cancelamento, papéis) só entram quando preenchidos, para a
 * assinatura cobrir exatamente o que foi mostrado.
 *
 * @param {object} [draft={}] Rascunho aceito por {@link validateAvisoDraft}.
 * @param {number} [now=Date.now()] Instante da criação, em ms.
 * @returns {object} Corpo `type: "topic"` com `avisoKind`, título, corpo e campos opcionais.
 * @throws {Error} Se o rascunho é inválido; a mensagem lista os campos.
 */
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

/**
 * Diz se o post merece o selo "Aviso da coordenação".
 *
 * Exige tipo conhecido, a mesma comunidade de `meta` e autor dono ou moderação. Um aviso de
 * `cobranca` ({@link AVISO_KIND_BLOCKED}) nunca recebe selo.
 *
 * @param {object} post Post já verificado (assinatura conferida por quem chama).
 * @param {{id?: string, owner?: string, moderators?: string[]}} meta Metadados da comunidade.
 * @returns {boolean} `true` quando o selo vale.
 */
export function hasAvisoSeal(post, meta) {
  if (!isAvisoTopic(post) || !AVISO_KINDS.includes(post.avisoKind)) return false;
  if (meta?.id && post.communityId !== meta.id) return false;
  return isModAuthor(post, meta);
}

/** Ids cancelados por avisos com selo. */
function cancelledIds(sealed) {
  return new Set(sealed.map((p) => p.cancels).filter(Boolean));
}

/**
 * Classifica os avisos com selo de uma comunidade.
 *
 * Um aviso cancelado por outro aviso com selo fica `cancelado`; um aviso vencido fica `encerrado`.
 *
 * @param {object[]} [posts=[]] Posts da comunidade (os sem selo são descartados).
 * @param {object} [meta={}] Metadados da comunidade (dono e moderação).
 * @param {number} [now=Date.now()] Instante de referência, em ms.
 * @returns {Array<object>} Cópias dos avisos com `avisoState` (`ativo` | `encerrado` | `cancelado`), do mais novo ao mais antigo.
 */
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

/**
 * Escolhe o aviso que fica fixado no topo da comunidade.
 *
 * @param {object[]} [posts=[]] Posts da comunidade.
 * @param {object} [meta={}] Metadados da comunidade.
 * @param {number} [now=Date.now()] Instante de referência, em ms.
 * @returns {object|null} O aviso ativo mais recente, ou `null`.
 */
export function pinnedAviso(posts = [], meta = {}, now = Date.now()) {
  return classifyAvisos(posts, meta, now).find((p) => p.avisoState === "ativo") || null;
}

/**
 * Monta o corpo da resposta de um membro, pronto para `signPayload`.
 *
 * @param {{id: string, communityId: string}} aviso Aviso respondido.
 * @param {string} choice Uma de {@link AVISO_CHOICES}.
 * @param {number} [now=Date.now()] Instante da resposta, em ms.
 * @returns {{type: "aviso-resposta", communityId: string, avisoId: string, choice: string, ts: number}} Corpo da resposta.
 * @throws {Error} Se o aviso não tem id ou comunidade, ou se a resposta é desconhecida.
 */
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

/**
 * Conta as respostas assinadas de um aviso.
 *
 * Vale a última resposta de cada autor. Quem é membro entra no total; quem não é fica à parte
 * (`outsiders`), para a coordenação ver sem inflar a contagem.
 *
 * @param {object[]} [responses=[]] Respostas já verificadas (`type: "aviso-resposta"`).
 * @param {string} [avisoId=""] Aviso contado.
 * @param {Set<string>|string[]} [members=new Set()] Rotas dos membros.
 * @returns {{members: Object<string, number>, outsiders: Object<string, number>, total: number}} Contagem por resposta e total de membros.
 */
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

/**
 * Monta o corpo da contagem colada do WhatsApp, pronto para `signPayload`.
 *
 * Só números: nenhuma mensagem, nome ou telefone do grupo entra no corpo.
 *
 * @param {{id: string, communityId: string}} aviso Aviso contado.
 * @param {Object<string, number>} [counts={}] Contagem por resposta (`ciente`, `vou`, `talvez`, `nao-vou`).
 * @param {number} [now=Date.now()] Instante da contagem, em ms.
 * @returns {object} Corpo `type: "aviso-contagem"` com um campo numérico por resposta.
 * @throws {Error} Se o aviso não tem id ou comunidade.
 */
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

/**
 * Escolhe a contagem que vale: a mais recente feita por dono ou moderação.
 *
 * @param {object[]} [items=[]] Contagens já verificadas.
 * @param {string} [avisoId=""] Aviso contado.
 * @param {object} [meta={}] Metadados da comunidade (dono e moderação).
 * @returns {object|null} A contagem que vale, ou `null`.
 */
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

/**
 * Monta o texto do aviso para colar no WhatsApp, sem link.
 *
 * O link de conferência vai à parte, sob demanda ({@link buildAvisoLinkMessage}), para o grupo não
 * receber link em toda mensagem.
 *
 * @param {object} options
 * @param {object} options.aviso Aviso com título, corpo e, se houver, data e local.
 * @param {string} [options.communityName=""] Nome mostrado no cabeçalho.
 * @param {string} [options.code=""] Código curto do aviso, para quem quiser conferir depois.
 * @returns {string} Texto em várias linhas, com marcação do WhatsApp.
 */
export function buildAvisoShareText({ aviso, communityName = "", code = "" }) {
  const lines = [`📣 *Aviso — ${communityName || "comunidade"}*`, `*${aviso.title}*`];
  if (aviso.body) lines.push(aviso.body);
  if (aviso.eventAt) lines.push(`Quando: ${formatWhen(aviso.eventAt)}${aviso.eventPlace ? ` · ${aviso.eventPlace}` : ""}`);
  const options = aviso.eventAt ? "✅ Ciente · 🙋 Vou · 🤔 Talvez · ❌ Não vou" : "✅ Ciente";
  lines.push(`Responda aqui: ${options}`);
  if (code) lines.push(`Código do aviso: ${code}`);
  return lines.join("\n");
}

/**
 * Monta a segunda mensagem, gerada só quando a coordenação pede: o link de conferência.
 *
 * @param {object} options
 * @param {string} [options.code=""] Código curto do aviso.
 * @param {string} options.link Link de conferência (página leve).
 * @returns {string} Mensagem de uma linha.
 * @throws {Error} Se o link está vazio.
 */
export function buildAvisoLinkMessage({ code = "", link }) {
  if (!link) throw new Error("Link de conferência vazio.");
  const which = code ? `o aviso ${code}` : "o aviso";
  return `🔒 Conferir se ${which} veio da coordenação: ${link}`;
}
