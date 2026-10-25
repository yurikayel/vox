/** @file Shared HTML/time/author helpers for Vox render layer. */
import * as mock from "../mock.js";
import * as localAccount from "../local-account.js";
import * as profileDirectory from "../profile-directory.js";

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
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function normAuthorToken(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

/** Nome + @handle ou ID curto uma vez (title = routeId completo). */
export function resolvePostAuthorLabels(author, { authorDisplay: override = "", isOwnLocalPost = false } = {}) {
  const routeId = String(author || "");
  const profileName = routeId ? mock.getAuthorDisplay(routeId) : "";
  const profileHandle = routeId ? mock.getAuthorHandle(routeId) : "";
  let fullName = override || profileName || "";
  if (!fullName && isOwnLocalPost) {
    fullName = localAccount.getDisplayName() || "";
  }
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

export function renderPostAuthorMetaLines(author, labels, timeLabel) {
  const { primary, secondaryHandle, routeTitle } = labels;
  const titleAttr = routeTitle ? ` title="${escapeHtml(routeTitle)}"` : "";
  const handleHtml = secondaryHandle
    ? `<span class="post-handle"${titleAttr}>@${escapeHtml(secondaryHandle)}</span><span class="post-dot">·</span>`
    : "";
  return `<div class="post-header-meta">
          <a class="post-author" href="#/u/${encodeURIComponent(author)}"${titleAttr}>${escapeHtml(primary)}</a>
          ${handleHtml}
          <span class="post-time">${escapeHtml(timeLabel)}</span>
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
  if (avatarUrl) {
    return `<span class="avatar-wrap ${sizeClass}"><img class="avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar avatar-fallback" style="display:none;">${authorInitial}</span></span>`;
  }
  return `<span class="avatar ${sizeClass}">${authorInitial}</span>`;
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
  return `${Math.floor(days / 30)}mês`;
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
