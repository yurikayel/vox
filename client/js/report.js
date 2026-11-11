/**
 * @file Denúncia de publicação (LAN-12) e pedido de mediação (civic lote 3) — lógica pura, sem DOM.
 *
 * A denúncia fica registrada no aparelho e o post é ocultado para quem denunciou. Quando a comunidade
 * tem moderação conhecida, a pessoa pode mandar a denúncia por DM cifrada (`app/report-dm.js`).
 * A identidade de quem denuncia NUNCA vai para o gossip público, por risco de retaliação.
 * Motivos graves levam aos canais oficiais e não seguem o fluxo de moderação comunitária.
 *
 * @module report
 * @see docs/THREAT-MODEL.md
 * @see docs/adr/023-moderacao-em-camadas-e-moderador-natural.md
 */

/**
 * Chave em `localStorage` das denúncias feitas neste aparelho.
 *
 * @type {string}
 */
export const REPORTS_STORAGE_KEY = "vox-reports-v1";

/**
 * Quantas denúncias o aparelho guarda; as mais antigas saem primeiro.
 *
 * @type {number}
 */
export const MAX_REPORTS = 200;

/**
 * Tamanho máximo do detalhe escrito por quem denuncia, em caracteres.
 *
 * @type {number}
 */
export const MAX_DETAIL_LEN = 500;

/**
 * Motivos de denúncia. `grave: true` mostra os canais oficiais ({@link OFFICIAL_CHANNELS_PT}) e fica
 * fora da moderação comunitária e do moderador natural.
 *
 * @type {ReadonlyArray<{id: string, label: string, grave: boolean}>}
 */
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

/**
 * Canais oficiais para casos graves; o Vox não substitui as autoridades.
 *
 * @type {ReadonlyArray<{label: string, href: string}>}
 */
export const OFFICIAL_CHANNELS_PT = Object.freeze([
  { label: "SaferNet Brasil — denúncia anônima de crimes na internet", href: "https://new.safernet.org.br/denuncie" },
  { label: "Disque 100 — Direitos Humanos (crianças, adolescentes e outras violações)", href: "tel:100" },
  { label: "Ligue 180 — Central de Atendimento à Mulher", href: "tel:180" },
  { label: "190 — Polícia Militar, em emergência", href: "tel:190" },
]);

/**
 * Procura um motivo pelo id.
 *
 * @param {string} reasonId Id do motivo (ex.: `"spam"`).
 * @returns {{id: string, label: string, grave: boolean}|null} O motivo, ou `null` se não existe.
 */
export function findReason(reasonId) {
  return REPORT_REASONS.find((r) => r.id === reasonId) || null;
}

/**
 * Diz se o motivo é grave (vai aos canais oficiais, não à moderação comunitária).
 *
 * @param {string} reasonId Id do motivo.
 * @returns {boolean} `false` também para motivo desconhecido.
 */
export function isGraveReason(reasonId) {
  return Boolean(findReason(reasonId)?.grave);
}

/**
 * Valida e normaliza uma denúncia.
 *
 * @param {object} [fields={}]
 * @param {string} fields.postId Publicação denunciada.
 * @param {string} [fields.authorRoute=""] Autor da publicação.
 * @param {string} [fields.communityId=""] Comunidade, se houver.
 * @param {string} fields.reason Id de um motivo de {@link REPORT_REASONS}.
 * @param {string} [fields.detail=""] Texto livre (cortado em {@link MAX_DETAIL_LEN}).
 * @param {number} [now=Date.now()] Instante, em ms.
 * @returns {{id: string, postId: string, authorRoute: string, communityId: string, reason: string, detail: string, ts: number}} Denúncia pronta para guardar.
 * @throws {Error} Sem publicação ou com motivo desconhecido; mensagem em português para mostrar.
 */
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

/**
 * Denúncias feitas neste aparelho, da mais nova à mais antiga.
 *
 * @returns {object[]} Lista vazia se o armazenamento está vazio, corrompido ou bloqueado.
 */
export function listReports() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(REPORTS_STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Guarda uma denúncia (substitui a de mesmo id) e corta a lista em {@link MAX_REPORTS}.
 *
 * @param {object} report Denúncia de {@link buildReport}.
 * @returns {object[]} A lista como ficou.
 */
export function saveReport(report) {
  const next = [report, ...listReports().filter((r) => r.id !== report.id)].slice(0, MAX_REPORTS);
  try {
    globalThis.localStorage?.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/**
 * Diz se este aparelho já denunciou a publicação.
 *
 * @param {string} postId Publicação.
 * @returns {boolean}
 */
export function hasReported(postId) {
  return listReports().some((r) => r.postId === postId);
}

/**
 * Rota da conversa cifrada com a moderação para pedir mediação, já com o cartão da publicação.
 *
 * Diferente da denúncia, não oculta nem arquiva nada; congelar a discussão continua poder da moderação.
 * Nada de quem pede vai na URL.
 *
 * @param {string} moderatorRoute Rota de quem modera.
 * @param {object} [context={}]
 * @param {string} [context.postId=""] Publicação em discussão.
 * @param {string} [context.communityId=""] Comunidade.
 * @returns {string} Hash `#/dm/<rota>?…`, ou `""` sem moderação ou sem publicação.
 */
export function buildMediationDmHash(moderatorRoute, { postId = "", communityId = "" } = {}) {
  if (!moderatorRoute || !postId) return "";
  const q = new URLSearchParams({ ctxType: "topic", ctxId: postId, ctxTitle: "Pedido de mediação" });
  if (communityId) q.set("c", communityId);
  return `#/dm/${encodeURIComponent(moderatorRoute)}?${q.toString()}`;
}

/**
 * Rota da conversa cifrada com a moderação para mandar a denúncia, com o cartão da publicação.
 *
 * Nada de quem denuncia vai na URL.
 *
 * @param {string} moderatorRoute Rota de quem modera.
 * @param {{postId: string, reason: string, communityId?: string}} report Denúncia.
 * @returns {string} Hash `#/dm/<rota>?…`, ou `""` sem moderação ou sem denúncia.
 */
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
