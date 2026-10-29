/** @file Shared HTML/time/author helpers for Vox render layer. */
import * as mock from "../mock.js";
import * as localAccount from "../local-account.js";
import * as profileDirectory from "../profile-directory.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";

export const root = () => document.getElementById("app-root");

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shortId(id) {
  if (!id) return "—";
  if (isWelcomeRouteId(id)) return "vox";
  if (id.length <= 10) return id;
  if (id.startsWith("vx_")) return id.slice(0, 9);
  if (id.startsWith("0x")) return id.slice(0, 8);
  return id.slice(0, 8);
}

function normAuthorToken(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

function resolveAuthorFullName(routeId, override, isOwnLocalPost) {
  const rawOverride = String(override || "").trim();
  if (rawOverride && !rawOverride.startsWith("vx_") && !rawOverride.startsWith("0x")) {
    return rawOverride;
  }
  const myId = localAccount.getCachedRouteIdSync();
  const isSelf = Boolean(isOwnLocalPost) || (Boolean(routeId) && Boolean(myId) && routeId === myId);
  if (isSelf) {
    const selfName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
    if (selfName) return selfName;
  }
  if (routeId) {
    const dirName = profileDirectory.getAuthorDisplaySync(routeId);
    if (dirName && !dirName.startsWith("vx_") && !dirName.startsWith("0x")) return dirName;
    if (typeof localAccount.listVaultAccountsSync === "function") {
      const match = localAccount.listVaultAccountsSync().find((v) => v.routeId === routeId);
      if (match?.displayName && !match.displayName.startsWith("vx_")) return match.displayName;
    }
    const mockName = mock.getAuthorDisplay(routeId);
    if (mockName) return mockName;
  }
  return "";
}

function resolveAuthorHandle(routeId) {
  if (!routeId) return "";
  const card = profileDirectory.getProfileCard(routeId);
  if (card?.handle) return card.handle;
  return mock.getAuthorHandle(routeId) || "";
}

function formatAuthorResult(routeId, fullName, profileHandle) {
  const shortRoute = routeId ? shortId(routeId) : "";
  const firstName = (fullName.split(/\s+/).filter(Boolean)[0] || fullName || "").trim();

  if (!firstName && routeId) {
    return {
      primary: shortRoute || "—",
      secondaryHandle: "",
      authorDisplay: shortRoute || "—",
      authorHandle: profileHandle || shortRoute,
      routeTitle: routeId,
    };
  }

  const primary = firstName || shortRoute || "—";
  let secondaryHandle = "";
  if (profileHandle) {
    secondaryHandle = profileHandle;
  } else if (routeId && normAuthorToken(shortRoute) !== normAuthorToken(firstName)) {
    secondaryHandle = shortRoute;
  }

  if (
    secondaryHandle &&
    normAuthorToken(primary) === normAuthorToken(shortRoute) &&
    normAuthorToken(secondaryHandle) === normAuthorToken(shortRoute)
  ) {
    secondaryHandle = "";
  }

  const authorDisplay = fullName || primary;
  const authorHandle = profileHandle || secondaryHandle || shortRoute;

  return { primary, secondaryHandle, authorDisplay, authorHandle, routeTitle: routeId };
}

/** Nome + @handle ou ID curto uma vez (title = routeId completo). */
export function resolvePostAuthorLabels(author, { authorDisplay: override = "", isOwnLocalPost = false } = {}) {
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
  const profileHandle = resolveAuthorHandle(routeId);
  return formatAuthorResult(routeId, fullName, profileHandle);
}

function parseTsDate(ts) {
  if (!ts || isNaN(Number(ts))) return null;
  const d = new Date(Number(ts));
  return isNaN(d.getTime()) ? null : d;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatAbsoluteDate(ts) {
  const d = parseTsDate(ts);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatAbsoluteDateTime(ts) {
  const d = parseTsDate(ts);
  if (!d) return "";
  return `${formatAbsoluteDate(ts)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatIsoTimestamp(ts) {
  const d = parseTsDate(ts);
  return d ? d.toISOString() : "";
}

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

export function renderPostAuthorMetaLines(author, labels, timeLabel, options = {}) {
  const { primary, secondaryHandle, routeTitle } = labels;
  const titleAttr = routeTitle ? ` title="${escapeHtml(routeTitle)}"` : "";
  const handleHtml = secondaryHandle
    ? `<span class="post-handle"${titleAttr}>@${escapeHtml(secondaryHandle)}</span><span class="post-dot">·</span>`
    : "";
  const parts = postTimeParts(options?.ts);
  const absDate = options?.absDate || parts.absDate;
  const timeTitle = options?.absDateTime
    ? ` title="${escapeHtml(options.absDateTime)}"`
    : parts.titleAttr;
  const dateSuffix = absDate ? `<span class="post-time-abs"> · ${escapeHtml(absDate)}</span>` : "";
  return `<div class="post-header-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(author)}"${titleAttr}>${escapeHtml(primary)}</a>
          ${handleHtml}
          <span class="post-time"${timeTitle}>${escapeHtml(timeLabel)}${dateSuffix}</span>
        </div>`;
}

export function getCommunityColor(id = "") {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}
export function renderAvatarHtml(author, authorDisplay, sizeClass = "") {
  const avatarUrl = profileDirectory.getAuthorAvatarSync(author) || mock.getAuthorAvatar(author);
  const display =
    authorDisplay || profileDirectory.getAuthorDisplaySync(author) || mock.getAuthorDisplay(author) || author;
  const authorInitial = (display || "V").slice(0, 1).toUpperCase();
  const squircle = isWelcomeRouteId(author) ? " avatar-squircle" : "";
  if (avatarUrl) {
    return `<span class="avatar-wrap${squircle} ${sizeClass}"><img class="avatar-img${squircle}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar avatar-fallback${squircle}" style="display:none;">${authorInitial}</span></span>`;
  }
  return `<span class="avatar${squircle} ${sizeClass}">${authorInitial}</span>`;
}

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
function formatInlineMd(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdownLight(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  const out = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = escapeHtml(rawLine);
    const trimmed = line.trim();

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

    if (trimmed.startsWith("### ")) {
      out.push(`<h4>${trimmed.slice(4)}</h4>`);
    } else if (trimmed.startsWith("## ")) {
      out.push(`<h3>${trimmed.slice(3)}</h3>`);
    } else if (trimmed.startsWith("# ")) {
      out.push(`<h2>${trimmed.slice(2)}</h2>`);
    } else if (!trimmed) {
      // blank line
    } else {
      out.push(`<p>${formatInlineMd(trimmed)}</p>`);
    }
  }

  if (inList) out.push("</ul>");
  return out.join("");
}
