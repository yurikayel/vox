/**
 * @file Utilitários de renderização: HTML, tempo relativo, autores e avatares.
 *
 * Reexporta `escapeHtml` e `shortId` só para a camada de UI (domínio importa da origem).
 * @module render/util
 */
import * as mock from "../mock.js";
import * as localAccount from "../identity/index.js";
import * as profileDirectory from "../profile-directory.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";
import { escapeHtml } from "../shared/html.js";
import { formatAbsoluteDate, parseInstant } from "../shared/date-format.js";
import { shortId } from "../short-id.js";

// Reexportados para a UI. O domínio importa da origem, nunca daqui (docs/ARCHITECTURE.md, "Camadas").
export { escapeHtml, shortId };

const POST_ASPECTS = new Set(["original", "1:1", "4:5", "3:4", "4:3", "16:9", "9:16"]);

/**
 * Formato da foto do post como valor conhecido. O formato vem de quem publicou (malha ou Arweave), então
 * qualquer outro valor vira "original" antes de entrar em classe ou atributo do HTML.
 * @param {unknown} aspect Formato declarado no post.
 * @returns {string} Um dos formatos conhecidos.
 */
export function normalizePostAspect(aspect) {
  return POST_ASPECTS.has(aspect) ? aspect : "original";
}

/**
 * Raiz da aplicação no DOM (`#app-root`).
 * @returns {HTMLElement|null}
 */
export const root = () => document.getElementById("app-root");

/**
 * Trilha de navegação no padrão do guia de design ("Comunidades / Vila Teste / Tópico").
 * @param {Array<{label: string, href?: string}>} items Do mais geral ao atual; item sem `href` é a página atual.
 * @returns {string} HTML do `<nav class="agora-breadcrumb">` com os rótulos escapados.
 */
export function renderAgoraBreadcrumbHtml(items) {
  const sep = `<span class="agora-breadcrumb-sep" aria-hidden="true">/</span>`;
  const parts = items.map((it) => (it.href
    ? `<a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a>`
    : `<span aria-current="page">${escapeHtml(it.label)}</span>`));
  return `<nav class="agora-breadcrumb" aria-label="Você está em">${parts.join(sep)}</nav>`;
}

/**
 * Normaliza um nome para comparação (minúsculas, sem acento).
 *
 * @param {string} s
 * @returns {string}
 */
function normAuthorToken(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

/**
 * Diz se o texto é só um endereço bruto, e não um nome.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isRawAddressToken(str) {
  if (!str || typeof str !== "string") return true;
  return str.startsWith("vx_") || str.startsWith("0x") || str.startsWith("did:") || (str.length >= 20 && !str.includes(" "));
}

/**
 * Nome da própria conta quando o autor é ela.
 *
 * @param {string} routeId
 * @param {boolean} isOwnLocalPost
 * @returns {string}
 */
function resolveSelfName(routeId, isOwnLocalPost) {
  const myId = localAccount.getCachedRouteIdSync();
  const isSelf = Boolean(isOwnLocalPost) || (Boolean(routeId) && Boolean(myId) && routeId === myId);
  if (!isSelf) return "";
  return localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
}

/**
 * Nome do diretório de perfis ou do cofre local para a rota.
 *
 * @param {string} routeId
 * @returns {string}
 */
function resolveDirectoryOrVaultName(routeId) {
  if (!routeId) return "";
  const dirName = profileDirectory.getAuthorDisplaySync(routeId);
  if (dirName && !isRawAddressToken(dirName)) return dirName;

  if (typeof localAccount.listVaultAccountsSync === "function") {
    const match = localAccount.listVaultAccountsSync().find((v) => v.routeId === routeId);
    if (match?.displayName && !isRawAddressToken(match.displayName)) return match.displayName;
  }
  return mock.getAuthorDisplay(routeId) || (!isRawAddressToken(routeId) ? routeId : "");
}

/**
 * Nome completo do autor, preferindo o informado pelo post.
 *
 * @param {string} routeId
 * @param {string} override
 * @param {boolean} isOwnLocalPost
 * @returns {string}
 */
function resolveAuthorFullName(routeId, override, isOwnLocalPost) {
  const rawOverride = String(override || "").trim();
  if (rawOverride && !isRawAddressToken(rawOverride)) {
    return rawOverride;
  }
  const selfName = resolveSelfName(routeId, isOwnLocalPost);
  if (selfName) return selfName;
  return resolveDirectoryOrVaultName(routeId);
}

/**
 * Handle do autor a partir do diretório de perfis.
 *
 * @param {string} routeId
 * @returns {string}
 */
function resolveAuthorHandle(routeId) {
  if (!routeId) return "";
  const card = profileDirectory.getProfileCard(routeId);
  if (card?.handle) return card.handle;
  return mock.getAuthorHandle(routeId) || "";
}

/**
 * Handle secundário a exibir ao lado do nome.
 *
 * @param {string} routeId
 * @param {string} displayName
 * @param {string} shortRoute
 * @param {string} profileHandle
 * @returns {string}
 */
function resolveSecondaryHandle(routeId, displayName, shortRoute, profileHandle) {
  if (profileHandle) {
    return profileHandle.replace(/^@/, "");
  }
  if (routeId && normAuthorToken(shortRoute) !== normAuthorToken(displayName)) {
    return shortRoute.replace(/^@/, "");
  }
  return "";
}

/**
 * Diz se o handle secundário repete o nome e deve sumir.
 *
 * @param {string} primary
 * @param {string} secondaryHandle
 * @param {string} shortRoute
 * @returns {boolean}
 */
function shouldClearSecondaryHandle(primary, secondaryHandle, shortRoute) {
  if (!secondaryHandle) return false;
  const normShort = normAuthorToken(shortRoute);
  return normAuthorToken(primary) === normShort && normAuthorToken(secondaryHandle) === normShort;
}

/**
 * Monta o resultado final de rótulos do autor.
 *
 * @param {string} routeId
 * @param {string} fullName
 * @param {string} profileHandle
 * @returns {object}
 */
function formatAuthorResult(routeId, fullName, profileHandle) {
  const shortRoute = routeId ? shortId(routeId) : "";
  const displayName = String(fullName || "").trim();

  if (!displayName && routeId) {
    return {
      primary: shortRoute || "—",
      secondaryHandle: "",
      authorDisplay: shortRoute || "—",
      authorHandle: profileHandle || shortRoute,
      routeTitle: routeId,
    };
  }

  const primary = displayName || shortRoute || "—";
  let secondaryHandle = resolveSecondaryHandle(routeId, displayName, shortRoute, profileHandle);
  if (shouldClearSecondaryHandle(primary, secondaryHandle, shortRoute)) {
    secondaryHandle = "";
  }

  const authorDisplay = displayName || primary;
  const cleanProfileHandle = profileHandle ? profileHandle.replace(/^@/, "") : "";
  const authorHandle = secondaryHandle || cleanProfileHandle || shortRoute;

  return { primary, secondaryHandle, authorDisplay, authorHandle, routeTitle: routeId };
}

/**
 * Rótulos de autor para cabeçalho de post (nome, @handle, routeId no title).
 * @param {string} author `routeId` do autor.
 * @param {object} [options={}]
 * @param {string} [options.authorDisplay=""] Nome forçado.
 * @param {string} [options.authorHandle=""] Handle forçado.
 * @param {boolean} [options.isOwnLocalPost=false] Trata como post do usuário local.
 * @returns {{primary: string, secondaryHandle: string, authorDisplay: string, authorHandle: string, routeTitle: string}}
 */
export function resolvePostAuthorLabels(author, { authorDisplay: override = "", authorHandle: optHandle = "", isOwnLocalPost = false } = {}) {
  const routeId = String(author || "");
  if (isWelcomeRouteId(routeId)) {
    return {
      primary: "Vox",
      secondaryHandle: "vox",
      authorDisplay: "Vox",
      authorHandle: "vox",
      routeTitle: "Vox (Conta Oficial)",
    };
  }
  const fullName = resolveAuthorFullName(routeId, override, isOwnLocalPost);
  const profileHandle = optHandle || resolveAuthorHandle(routeId);
  return formatAuthorResult(routeId, fullName, profileHandle);
}

export { formatAbsoluteDate, formatAbsoluteDateTime } from "../shared/date-format.js";

/**
 * ISO 8601 do instantâneo ou `""` se inválido.
 * @param {number|string} ts
 * @returns {string}
 */
export function formatIsoTimestamp(ts) {
  const d = parseInstant(ts);
  return d ? d.toISOString() : "";
}

/**
 * Partes de exibição temporal de um post (relativo, absoluto, ISO, title attr).
 * @param {number|string} ts
 * @returns {{relative: string, absDate: string, iso: string, display: string, titleAttr: string}}
 */
export function postTimeParts(ts) {
  const relative = formatTimeAgo(ts);
  const absDate = formatAbsoluteDate(ts);
  const iso = formatIsoTimestamp(ts);
  return {
    relative,
    absDate,
    iso,
    display: absDate ? `${relative} · ${absDate}` : relative,
    titleAttr: iso ? ` title="${escapeHtml(iso)}"` : "",
  };
}

/**
 * Bloco de meta do autor (nome, handle, tempo) abaixo do avatar no post.
 * @param {string} author `routeId` para link do perfil.
 * @param {object} labels Saída de {@link resolvePostAuthorLabels}.
 * @param {string} timeLabel Texto relativo já formatado.
 * @param {object} [options={}] `ts`, `absDate`, `absDateTime` opcionais.
 * @returns {string}
 */
export function renderPostAuthorMetaLines(author, labels, timeLabel, options = {}) {
  const { primary, secondaryHandle, routeTitle } = labels;
  const titleAttr = routeTitle ? ` title="${escapeHtml(routeTitle)}"` : "";
  const cleanHandle = (secondaryHandle || "").replace(/^@/, "");
  const handleHtml = cleanHandle
    ? `<span class="post-handle"${titleAttr}>@${escapeHtml(cleanHandle)}</span>`
    : "";
  const parts = postTimeParts(options?.ts);
  const absDate = options?.absDate || parts.absDate;
  const timeTitle = options?.absDateTime
    ? ` title="${escapeHtml(options.absDateTime)}"`
    : parts.titleAttr;
  const dateSuffix = absDate ? `<span class="post-time-abs"> · ${escapeHtml(absDate)}</span>` : "";
  return `<div class="post-header-meta">
          <div class="post-author-line">
            <a class="post-author" href="#/u/${encodeURIComponent(author)}"${titleAttr}>${escapeHtml(primary)}</a>
          </div>
          <div class="post-meta-sub">
            ${handleHtml}
            ${handleHtml ? '<span class="post-dot">·</span>' : ''}
            <span class="post-time"${timeTitle}>${escapeHtml(timeLabel)}${dateSuffix}</span>
          </div>
        </div>`;
}

/**
 * Cor HSL estável derivada do hash do ID da comunidade (selos e avatares).
 * @param {string} [id=""]
 * @returns {string} Valor CSS `hsl(...)`.
 */
export function getCommunityColor(id = "") {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}
/**
 * Avatar com imagem e fallback de inicial, ou só inicial.
 * @param {string} author `routeId`.
 * @param {string} authorDisplay Nome para alt/título.
 * @param {string} [sizeClass=""] Classes de tamanho.
 * @param {string} [avatarOverride=""] URL forçada.
 * @returns {string}
 */
export function renderAvatarHtml(author, authorDisplay, sizeClass = "", avatarOverride = "") {
  const avatarUrl =
    avatarOverride || profileDirectory.getAuthorAvatarSync(author) || mock.getAuthorAvatar(author);
  const display =
    authorDisplay || profileDirectory.getAuthorDisplaySync(author) || mock.getAuthorDisplay(author) || author;
  const authorInitial = escapeHtml((display || "V").slice(0, 1).toUpperCase());
  const squircle = "";
  if (avatarUrl) {
    return `<span class="avatar-wrap${squircle} ${sizeClass}"><img class="avatar-img${squircle}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" data-fallback-next="1" /><span class="avatar avatar-fallback${squircle}" style="display:none;">${authorInitial}</span></span>`;
  }
  return `<span class="avatar${squircle} ${sizeClass}">${authorInitial}</span>`;
}

/**
 * Tempo relativo curto (`agora`, `5m`, `2h`, `3d`, meses/anos).
 * @param {number|string} ts
 * @returns {string}
 */
export function formatTimeAgo(ts) {
  if (!ts || isNaN(Number(ts))) return "recente";
  const diff = Math.max(0, Date.now() - Number(ts));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "ano" : "anos"}`;
}
/**
 * Converte Markdown simples em linha (negrito, itálico, código) para HTML.
 *
 * @param {string} str
 * @returns {string}
 */
function formatInlineMd(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Converte uma linha em título ou parágrafo HTML.
 *
 * @param {string} trimmed
 * @returns {string}
 */
function formatHeadingOrParagraph(trimmed) {
  if (trimmed.startsWith("### ")) return `<h4>${trimmed.slice(4)}</h4>`;
  if (trimmed.startsWith("## ")) return `<h3>${trimmed.slice(3)}</h3>`;
  if (trimmed.startsWith("# ")) return `<h2>${trimmed.slice(2)}</h2>`;
  if (!trimmed) return "";
  return `<p>${formatInlineMd(trimmed)}</p>`;
}

/**
 * Subconjunto de markdown: títulos, listas, negrito/itálico/código inline.
 * @param {string} md
 * @returns {string}
 */
export function renderMarkdownLight(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  const out = [];
  let inList = false;

  for (const rawLine of lines) {
    const trimmed = escapeHtml(rawLine).trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${formatInlineMd(trimmed.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    const block = formatHeadingOrParagraph(trimmed);
    if (block) out.push(block);
  }

  if (inList) out.push("</ul>");
  return out.join("");
}

/**
 * Item "Denunciar" dos menus ⋯ (LAN-12; clique tratado em report-flow).
 * @param {string} postId ID do post.
 * @param {string} [author=""] Autor para o fluxo.
 * @param {string} [communityId=""] Comunidade de contexto.
 * @returns {string}
 */
export function renderReportMenuItem(postId, author = "", communityId = "") {
  return `<button type="button" class="action-btn btn-report-post" data-id="${escapeHtml(postId)}" data-author="${escapeHtml(author)}" data-comm="${escapeHtml(communityId)}" role="menuitem" aria-label="Denunciar publicação">
    <span aria-hidden="true">⚑</span>
    <span class="toolbar-overflow-label">Denunciar</span>
  </button>`;
}

/**
 * Cartão compacto "Convide amigos" com chave cidadã, botão de compartilhar e link técnico recolhido em `<details>`.
 *
 * @param {object} [opts={}] Opções de renderização.
 * @param {string} [opts.routeId=""] `routeId` do usuário autenticado.
 * @param {string} [opts.inviteLink=""] Link completo de convite; quando vazio, deriva `#/connect/<routeId>`.
 * @param {string} [opts.buttonId="btn-share-connect"] ID do botão de compartilhar.
 * @param {string} [opts.codeId="invite-connect-url"] ID do `<code>` com o link técnico.
 * @param {string} [opts.className="card people-invite-card"] Classes CSS do contêiner.
 * @returns {string} HTML do cartão (vazio quando `routeId` não é informado).
 */
export function renderInviteFriendsCard({
  routeId = "",
  inviteLink = "",
  buttonId = "btn-share-connect",
  codeId = "invite-connect-url",
  className = "card people-invite-card",
} = {}) {
  if (!routeId) return "";
  const basePath = typeof location !== "undefined" ? location.origin + location.pathname : "";
  const link = inviteLink || `${basePath}#/connect/${encodeURIComponent(routeId)}`;
  return `<section class="${escapeHtml(className)}" aria-label="Convide amigos">
    <div class="invite-friends-head">
      <div>
        <strong class="invite-friends-title">Convide amigos</strong>
        <p class="desc invite-friends-lead">Chave <code>${escapeHtml(shortId(routeId))}</code> · Mande seu convite do Vox.</p>
      </div>
      <button type="button" id="${escapeHtml(buttonId)}" class="btn btn-primary btn-sm" data-route="${escapeHtml(routeId)}">Compartilhar</button>
    </div>
    <details class="dm-advanced">
      <summary class="dm-advanced-summary">Ver link técnico</summary>
      <p class="meta">Só se precisar copiar manualmente:</p>
      <p class="meta modal-connect-url"><code id="${escapeHtml(codeId)}">${escapeHtml(link)}</code></p>
    </details>
  </section>`;
}
