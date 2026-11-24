/**
 * @file Renderização pura e validação de links da rota read-first de retorno POSSE (`PM-105`).
 * @module render/posse-return
 */
import { escapeHtml } from "../shared/html.js";
import { honestMessage } from "../honest-errors.js";
import { shortId } from "../short-id.js";

const TOKEN_RE = /^[A-Za-z0-9_-]{3,96}$/;
const FORBIDDEN_TOKENS = new Set(["__proto__", "constructor", "prototype"]);
const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "localhost"]);
const TRACKING_EXACT = new Set(["fbclid", "gclid", "si", "ref"]);

/**
 * Diz se o parâmetro de consulta é de rastreamento (`utm_*`, `fbclid`, `gclid`, `si`, `ref`).
 *
 * @param {string} key Nome do parâmetro.
 * @returns {boolean}
 */
function isTrackingKey(key) {
  const lower = String(key || "").toLowerCase();
  return lower.startsWith("utm_") || TRACKING_EXACT.has(lower);
}

/**
 * Valida se um token de `topicId` ou `communityId` segue a gramática canônica PM-105.
 *
 * @param {unknown} value Valor candidato.
 * @returns {boolean}
 */
export function isValidPosseToken(value) {
  return typeof value === "string" && TOKEN_RE.test(value) && !FORBIDDEN_TOKENS.has(value);
}

/**
 * Confere esquema, credenciais e ausência de rastreadores em uma URL absoluta de retorno.
 *
 * @param {string} rawUrl URL bruta.
 * @returns {{ ok: boolean, parsed?: URL, reason?: string }}
 */
function parseSafeReturnUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return { ok: false, reason: "URL canônica malformada." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL com credenciais embutidas não é permitida." };
  }
  const proto = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const allowed = proto === "https:" || (proto === "http:" && LOCAL_HTTP_HOSTS.has(host));
  if (!allowed) return { ok: false, reason: `Protocolo não permitido: ${proto}` };
  return { ok: true, parsed };
}

/**
 * Extrai `topicId` e `communityId` de um fragmento canônico `#/t/<id>` ou `#/c/<cid>/t/<id>`.
 *
 * @param {string} hash Fragmento da URL.
 * @returns {{ ok: boolean, topicId?: string, communityId?: string, hashQuery?: string, reason?: string }}
 */
function parseCanonicalHash(hash) {
  if (!hash.startsWith("#/")) {
    return { ok: false, reason: "Rota hash canônica deve iniciar com '#/'." };
  }
  const route = hash.slice(1);
  const qIdx = route.indexOf("?");
  const pathPart = qIdx === -1 ? route : route.slice(0, qIdx);
  const hashQuery = qIdx === -1 ? "" : route.slice(qIdx + 1);
  const seg = pathPart.slice(1).split("/");
  if (seg.length === 2 && seg[0] === "t" && isValidPosseToken(seg[1])) {
    return { ok: true, topicId: seg[1], communityId: "", hashQuery };
  }
  if (seg.length === 4 && seg[0] === "c" && seg[2] === "t" && isValidPosseToken(seg[1]) && isValidPosseToken(seg[3])) {
    return { ok: true, communityId: seg[1], topicId: seg[3], hashQuery };
  }
  return { ok: false, reason: "Rota canônica inválida: esperado '#/t/<topicId>' ou '#/c/<communityId>/t/<topicId>'." };
}

/**
 * Verifica se há parâmetros de rastreamento na query principal ou na query do hash.
 *
 * @param {URL} parsed URL analisada.
 * @param {string} hashQuery Query opcional após `?` no fragmento.
 * @returns {string} Mensagem de erro ou string vazia.
 */
function detectTrackingParams(parsed, hashQuery) {
  const keys = [...parsed.searchParams.keys()].filter(isTrackingKey);
  if (hashQuery) {
    keys.push(...[...new URLSearchParams(hashQuery).keys()].filter(isTrackingKey));
  }
  return keys.length ? `Parâmetros de rastreamento proibidos: ${keys.join(", ")}` : "";
}

/**
 * Valida uma URL absoluta de retorno POSSE e extrai os tokens canônicos.
 *
 * @param {string} rawUrl URL bruta.
 * @returns {{ ok: boolean, topicId?: string, communityId?: string, canonicalHash?: string, reason?: string }}
 */
function parsePosseReturnFromUrl(rawUrl) {
  const urlCheck = parseSafeReturnUrl(rawUrl);
  if (!urlCheck.ok) return urlCheck;
  const hashCheck = parseCanonicalHash(urlCheck.parsed.hash);
  if (!hashCheck.ok) return { ok: false, reason: hashCheck.reason };
  const trackErr = detectTrackingParams(urlCheck.parsed, hashCheck.hashQuery);
  if (trackErr) return { ok: false, reason: trackErr };
  const canonicalHash = hashCheck.communityId
    ? `#/c/${hashCheck.communityId}/t/${hashCheck.topicId}`
    : `#/t/${hashCheck.topicId}`;
  return { ok: true, topicId: hashCheck.topicId, communityId: hashCheck.communityId, canonicalHash };
}

/**
 * Valida `topicId` e `communityId` já separados vindos do roteador.
 *
 * @param {string} rawTopicId Identificador bruto do tópico.
 * @param {string} rawCommunityId Identificador bruto opcional da comunidade.
 * @returns {{ ok: boolean, topicId?: string, communityId?: string, canonicalHash?: string, reason?: string }}
 */
function parsePosseReturnFromIds(rawTopicId, rawCommunityId) {
  const topicId = String(rawTopicId || "").trim();
  const communityId = String(rawCommunityId || "").trim();
  if (!isValidPosseToken(topicId)) {
    return { ok: false, reason: "Identificador de publicação inválido." };
  }
  if (communityId && !isValidPosseToken(communityId)) {
    return { ok: false, reason: "Identificador de comunidade inválido." };
  }
  const canonicalHash = communityId ? `#/c/${communityId}/t/${topicId}` : `#/t/${topicId}`;
  return { ok: true, topicId, communityId, canonicalHash };
}

/**
 * Valida os parâmetros recebidos pela rota `#/c/<cid>/t/<tid>` ou `#/posse?...` (paridade PM-105).
 *
 * @param {{ topicId?: string, communityId?: string, rawUrl?: string }} [params={}] Parâmetros da rota.
 * @returns {{ ok: boolean, topicId?: string, communityId?: string, canonicalHash?: string, reason?: string }}
 */
export function parsePosseReturnTarget(params = {}) {
  const rawUrl = String(params?.rawUrl || "").trim();
  if (rawUrl) return parsePosseReturnFromUrl(rawUrl);
  return parsePosseReturnFromIds(params?.topicId, params?.communityId);
}

/**
 * Formata o selo honesto de verificação criptográfica offline do post original.
 *
 * @param {{ status?: string, authorRouteId?: string, reason?: string }} [verification={}] Resultado de `verifyPayload`.
 * @returns {string} HTML escapado do selo.
 */
export function renderSignatureBadgeHtml(verification = {}) {
  const status = verification?.status || "unsigned";
  if (status === "verified") {
    const signer = verification.authorRouteId ? ` · ${shortId(verification.authorRouteId)}` : "";
    return `<div class="posse-sig-badge posse-sig-verified" data-sig-status="verified" role="status">
      <strong>Assinatura verificada offline</strong>
      <span>Chave pública confere com o autor${escapeHtml(signer)}.</span>
    </div>`;
  }
  if (status === "invalid") {
    const detail = verification.reason || "Assinatura criptográfica inválida ou conteúdo alterado.";
    return `<div class="posse-sig-badge posse-sig-invalid" data-sig-status="invalid" role="alert">
      <strong>Assinatura não verificada (adulteração ou chave divergente)</strong>
      <span>${escapeHtml(detail)}</span>
    </div>`;
  }
  const note = verification.reason || "Esta cópia chegou sem assinatura criptográfica anexada.";
  return `<div class="posse-sig-badge posse-sig-unsigned" data-sig-status="unsigned" role="status">
    <strong>Sem assinatura verificável</strong>
    <span>${escapeHtml(note)}</span>
  </div>`;
}

/**
 * Descreve de forma honesta de onde o conteúdo foi lido (local, malha P2P ou gateway).
 *
 * @param {{ kind?: string, label?: string }} [source={}] Origem da leitura.
 * @returns {string} Texto seguro para exibição.
 */
export function formatSourceLabel(source = {}) {
  const kind = source?.kind || "local";
  if (kind === "mesh") return "Malha P2P";
  if (kind === "gateway") {
    return source?.label ? `Gateway (${source.label})` : "Gateway remoto";
  }
  return "Cache local (neste aparelho)";
}

/**
 * Converte texto simples em parágrafos escapados contra XSS.
 *
 * @param {string} text Corpo do texto.
 * @returns {string} HTML seguro.
 */
function renderSafeParagraphs(text) {
  const raw = String(text || "").trim();
  if (!raw) return `<p class="posse-empty-body">Sem texto adicional.</p>`;
  return raw
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Renderiza a lista de respostas da conversa associada ao post original.
 *
 * @param {Array<{ id?: string, author?: string, authorDisplay?: string, body?: string }>} [replies=[]] Respostas.
 * @returns {string} HTML da seção de conversa.
 */
function renderRepliesSectionHtml(replies = []) {
  const list = Array.isArray(replies) ? replies : [];
  const itemsHtml = list.length
    ? list
        .map((r) => {
          const author = r?.authorDisplay || (r?.author ? shortId(r.author) : "Participante");
          return `<li class="posse-reply-item" data-reply-id="${escapeHtml(r?.id || "")}">
            <div class="posse-reply-meta"><strong>${escapeHtml(author)}</strong></div>
            <div class="posse-reply-body">${renderSafeParagraphs(r?.body || "")}</div>
          </li>`;
        })
        .join("")
    : `<li class="posse-reply-empty">Nenhuma resposta registrada ainda.</li>`;
  return `<section class="posse-return-replies" aria-label="Conversa associada">
    <h2>Conversa (${list.length})</h2>
    <ul class="posse-reply-list">${itemsHtml}</ul>
  </section>`;
}

/**
 * Renderiza o convite discreto para participar sem bloquear a leitura.
 *
 * @param {{ topicId: string, communityId?: string, hasAccount?: boolean }} opts Contexto da conversa.
 * @returns {string} HTML do CTA não-intrusivo.
 */
function renderParticipateCtaHtml({ topicId, communityId = "", hasAccount = false }) {
  const topicHref = communityId
    ? `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(communityId)}`
    : `#/t/${encodeURIComponent(topicId)}`;
  if (hasAccount) {
    return `<aside class="posse-return-cta" aria-label="Participar da conversa">
      <p>Sua chave local já está ativa neste aparelho.</p>
      <a class="btn btn-primary btn-sm" href="${escapeHtml(topicHref)}">Responder na conversa completa</a>
    </aside>`;
  }
  return `<aside class="posse-return-cta" aria-label="Participar da conversa">
    <p>Você está lendo sem conta. Para responder ou curtir, crie sua chave local em segundos — sem e-mail nem CPF.</p>
    <div class="posse-cta-actions">
      <button type="button" id="btn-posse-participate" class="btn btn-primary btn-sm" data-requires-entry="1">Participar da conversa</button>
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(topicHref)}">Abrir conversa completa</a>
    </div>
  </aside>`;
}

/**
 * Renderiza estados honestos de erro, ausência ou link inválido (`LAN-21`).
 *
 * @param {{ status: string, errorKind?: string, errorReason?: string }} state Estado da tela.
 * @returns {string} HTML do estado degradado.
 */
function renderDegradedStateHtml({ status, errorKind = "", errorReason = "" }) {
  const titleMap = {
    "invalid-link": "Link de retorno inválido",
    "not-found": "Publicação não encontrada",
    error: "Não foi possível carregar agora",
  };
  const fallbackMsg =
    status === "not-found"
      ? "Esta publicação não foi encontrada neste aparelho nem nos gateways consultados, ou ainda aguarda propagação."
      : "Não foi possível validar ou abrir esta publicação.";
  const msg = errorReason || honestMessage(errorKind) || fallbackMsg;
  const retryBtn =
    status === "invalid-link"
      ? ""
      : `<button type="button" id="btn-posse-retry" class="btn btn-primary btn-sm">Tentar novamente</button>`;
  return `<section class="posse-return-view posse-return-degraded" data-posse-status="${escapeHtml(status)}">
    <h1>${escapeHtml(titleMap[status] || "Publicação indisponível")}</h1>
    <p class="posse-return-message" role="alert">${escapeHtml(msg)}</p>
    <div class="posse-return-actions">
      ${retryBtn}
      <a class="btn btn-secondary btn-sm" href="#/">Voltar à Ágora</a>
    </div>
  </section>`;
}

/**
 * Renderiza a trilha de contexto da publicação (Ágora / comunidade).
 *
 * @param {string} communityId Identificador opcional da comunidade.
 * @returns {string} HTML da barra de contexto.
 */
function renderContextNavHtml(communityId) {
  const commLabel = communityId
    ? `<a class="posse-comm-link" href="#/c/${encodeURIComponent(communityId)}">Comunidade: ${escapeHtml(communityId)}</a>`
    : `<span class="posse-comm-link">Ágora pública</span>`;
  return `<nav class="posse-return-context" aria-label="Contexto da publicação">
    <a href="#/">Ágora</a>
    <span aria-hidden="true">/</span>
    ${commLabel}
  </nav>`;
}

/**
 * Renderiza o cartão do post original com selo de assinatura e origem da leitura.
 *
 * @param {{ post: object, source?: object, verification?: object }} data Dados do post original.
 * @returns {string} HTML escapado do cartão.
 */
function renderOriginalCardHtml({ post, source, verification }) {
  const authorLabel = post.authorDisplay || (post.author ? shortId(post.author) : "Autor desconhecido");
  const sourceKind = source?.kind || "local";
  const sourceText = formatSourceLabel(source);
  return `<article class="card posse-original-card">
    <header class="posse-original-header">
      <h1>${escapeHtml(post.title || "Publicação no Vox")}</h1>
      <div class="posse-original-meta">
        <span class="posse-author">Por <strong>${escapeHtml(authorLabel)}</strong></span>
        <span class="posse-source" data-source-kind="${escapeHtml(sourceKind)}">Origem: ${escapeHtml(sourceText)}</span>
      </div>
      ${renderSignatureBadgeHtml(verification)}
    </header>
    <div class="posse-original-body">${renderSafeParagraphs(post.body || "")}</div>
  </article>`;
}

/**
 * Renderiza a tela completa de retorno POSSE read-first (`PM-105`).
 *
 * @param {object} [state={}] Estado resolvido da publicação e da conversa.
 * @returns {string} HTML escapado pronto para injeção no contêiner principal.
 */
export function renderPosseReturnHtml(state = {}) {
  const status = state?.status || "not-found";
  if (status !== "ok" || !state?.post) {
    return renderDegradedStateHtml({
      status,
      errorKind: state?.errorKind || "",
      errorReason: state?.errorReason || "",
    });
  }
  const topicId = state.topicId || state.post.id || "";
  const communityId = state.communityId || "";
  return `<section class="posse-return-view" data-posse-status="ok" data-topic-id="${escapeHtml(topicId)}">
    ${renderContextNavHtml(communityId)}
    ${renderOriginalCardHtml({ post: state.post, source: state.source, verification: state.verification })}
    ${renderRepliesSectionHtml(state.replies)}
    ${renderParticipateCtaHtml({ topicId, communityId, hasAccount: Boolean(state.hasAccount) })}
  </section>`;
}
