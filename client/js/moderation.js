export async function fetchModActions(communityId) {
  const { fetchModActions: gqlFetchModActions } = await import("./graphql.js");
  return gqlFetchModActions(communityId);
}

export function parseModerators(rawModerators = "") {
  if (!rawModerators) return [];
  return rawModerators
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isModerator(userAddress, communityOwner, rawModerators = "") {
  if (!userAddress) return false;
  if (communityOwner && userAddress.toLowerCase() === communityOwner.toLowerCase()) {
    return true;
  }
  const list = parseModerators(rawModerators);
  return list.some((m) => m.toLowerCase() === userAddress.toLowerCase());
}

export function applyFilters(items, actions = [], communityOwner = "", rawModerators = "") {
  if (!Array.isArray(items) || !items.length) return [];
  if (!Array.isArray(actions) || !actions.length) return items;

  const validModerators = new Set();
  if (communityOwner) validModerators.add(communityOwner.toLowerCase());
  for (const m of parseModerators(rawModerators)) {
    validModerators.add(m.toLowerCase());
  }

  const hiddenTargets = new Set();
  const bannedOwners = new Set();

  for (const act of actions) {
    const actOwner = (act.owner || "").toLowerCase();
    // Ação só tem efeito se partiu de um moderador legítimo
    if (validModerators.size > 0 && !validModerators.has(actOwner)) {
      continue;
    }

    if (act.action === "hide" && act.target) {
      hiddenTargets.add(act.target);
    } else if (act.action === "ban" && act.target) {
      bannedOwners.add(act.target.toLowerCase());
    }
  }

  return items.filter((item) => {
    if (hiddenTargets.has(item.id)) return false;
    if (item.owner && bannedOwners.has(item.owner.toLowerCase())) return false;
    return true;
  });
}


const BLOCKED_STORAGE = "vox-moderation-blocked-v1";
const MUTED_STORAGE = "vox-moderation-muted-v1";
export const QUARANTINE_STORAGE_KEY = "vox-quarantine-posts-v1";
export const QUARANTINE_ACTION_LABEL = "Quarentena local / não ecoar";
export const QUARANTINE_HINT =
  "Só neste aparelho. Não apaga o permaweb nem é ban da plataforma.";

function loadStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStorage(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

export function getBlockedUsers() {
  return loadStorage(BLOCKED_STORAGE);
}

export function isUserBlocked(routeId) {
  if (!routeId) return false;
  const list = getBlockedUsers();
  return list.some((b) => b.routeId === routeId);
}

export function blockUser(routeId, reason = "") {
  if (!routeId) return false;
  const list = getBlockedUsers().filter((b) => b.routeId !== routeId);
  list.push({ routeId, reason: String(reason || "").slice(0, 100), blockedAt: Date.now() });
  saveStorage(BLOCKED_STORAGE, list);
  return true;
}

export function unblockUser(routeId) {
  if (!routeId) return false;
  const list = getBlockedUsers().filter((b) => b.routeId !== routeId);
  saveStorage(BLOCKED_STORAGE, list);
  return true;
}

export function getMutedUsers() {
  return loadStorage(MUTED_STORAGE);
}

export function isUserMuted(routeId) {
  if (!routeId) return false;
  const list = getMutedUsers();
  return list.some((m) => m.routeId === routeId);
}

export function muteUser(routeId) {
  if (!routeId) return false;
  const list = getMutedUsers().filter((m) => m.routeId !== routeId);
  list.push({ routeId, mutedAt: Date.now() });
  saveStorage(MUTED_STORAGE, list);
  return true;
}

export function unmuteUser(routeId) {
  if (!routeId) return false;
  const list = getMutedUsers().filter((m) => m.routeId !== routeId);
  saveStorage(MUTED_STORAGE, list);
  return true;
}

export function shouldDropGossip(authorRouteId) {
  if (!authorRouteId) return false;
  return isUserBlocked(authorRouteId);
}

function asPostIdList(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item : item?.id;
    if (id) ids.push(id);
  }
  return ids;
}

export function getQuarantinedPostIds() {
  return asPostIdList(loadStorage(QUARANTINE_STORAGE_KEY));
}

export function isPostQuarantined(postId) {
  if (!postId) return false;
  return getQuarantinedPostIds().includes(postId);
}

export function canEchoPost(postId) {
  return Boolean(postId) && !isPostQuarantined(postId);
}

export function quarantinePost(postId) {
  if (!postId) return false;
  const ids = getQuarantinedPostIds().filter((id) => id !== postId);
  ids.push(postId);
  saveStorage(QUARANTINE_STORAGE_KEY, ids);
  return true;
}

export function unquarantinePost(postId) {
  if (!postId) return false;
  const ids = getQuarantinedPostIds().filter((id) => id !== postId);
  saveStorage(QUARANTINE_STORAGE_KEY, ids);
  return true;
}

function hiddenAuthorSet() {
  const blocked = getBlockedUsers().map((b) => b.routeId);
  const muted = getMutedUsers().map((m) => m.routeId);
  return new Set([...blocked, ...muted]);
}

function isFeedPostVisible(post, hiddenAuthors, hiddenIds) {
  if (post?.id && hiddenIds.has(post.id)) return false;
  const author = post?.author || post?.owner || "";
  return !author || !hiddenAuthors.has(author);
}

export function filterFeedPosts(posts) {
  if (!Array.isArray(posts)) return [];
  const hiddenAuthors = hiddenAuthorSet();
  const hiddenIds = new Set(getQuarantinedPostIds());
  return posts.filter((post) => isFeedPostVisible(post, hiddenAuthors, hiddenIds));
}

export function exportModerationBundle() {
  return JSON.stringify({
    voxVersion: 1,
    kind: "vox-moderation-list",
    blocked: getBlockedUsers(),
    muted: getMutedUsers(),
    exportedAt: Date.now(),
  }, null, 2);
}

export function importModerationBundle(bundleInput) {
  let parsed = null;
  if (typeof bundleInput === "string") {
    try { parsed = JSON.parse(bundleInput); } catch { return false; }
  } else if (bundleInput && typeof bundleInput === "object") {
    parsed = bundleInput;
  }
  if (!parsed || parsed.kind !== "vox-moderation-list") return false;

  if (Array.isArray(parsed.blocked)) {
    const current = getBlockedUsers();
    const map = new Map(current.map((b) => [b.routeId, b]));
    for (const b of parsed.blocked) {
      if (b?.routeId) map.set(b.routeId, b);
    }
    saveStorage(BLOCKED_STORAGE, Array.from(map.values()));
  }

  if (Array.isArray(parsed.muted)) {
    const current = getMutedUsers();
    const map = new Map(current.map((m) => [m.routeId, m]));
    for (const m of parsed.muted) {
      if (m?.routeId) map.set(m.routeId, m);
    }
    saveStorage(MUTED_STORAGE, Array.from(map.values()));
  }

  return true;
}
