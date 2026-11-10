import { REVIEW_HIDE_ACTION } from "./report-review.js";

export async function fetchModActions(communityId) {
  let localActions = [];
  try {
    const { getLocalPosts } = await import("./cache-node.js");
    localActions = await getLocalPosts({ type: "mod-action", communityId });
  } catch {}

  let remoteActions = [];
  try {
    const { fetchModActions: gqlFetchModActions } = await import("./graphql.js");
    remoteActions = await gqlFetchModActions(communityId);
  } catch {}

  const seen = new Set();
  const merged = [];
  for (const a of localActions) {
    seen.add(a.id);
    merged.push({ ...a, owner: a.author || a.owner });
  }
  for (const a of remoteActions) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      merged.push(a);
    }
  }
  return merged;
}

export function parseModerators(rawModerators = "") {
  if (!rawModerators) return [];
  if (Array.isArray(rawModerators)) {
    return rawModerators.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof rawModerators !== "string") return [];
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

function buildValidModeratorsSet(communityOwner = "", rawModerators = "") {
  const validModerators = new Set();
  if (communityOwner) validModerators.add(communityOwner.toLowerCase());
  for (const m of parseModerators(rawModerators)) {
    validModerators.add(m.toLowerCase());
  }
  return validModerators;
}

const MOD_ACTION_APPLY = Object.freeze({
  hide: (s, t) => { s.hiddenTargets.add(t); s.reviewTargets.delete(t); },
  [REVIEW_HIDE_ACTION]: (s, t, ts) => { s.hiddenTargets.add(t); s.reviewTargets.set(t, ts); },
  unhide: (s, t) => { s.hiddenTargets.delete(t); s.reviewTargets.delete(t); },
  ban: (s, t) => s.bannedOwners.add(t.toLowerCase()),
  unban: (s, t) => s.bannedOwners.delete(t.toLowerCase()),
  pin: (s, t) => s.pinState.set(t, true),
  unpin: (s, t) => s.pinState.set(t, false),
  lock: (s, t) => s.lockState.set(t, true),
  unlock: (s, t) => s.lockState.set(t, false),
});

/** Fail-closed: sem dono/moderadores conhecidos, nenhuma ação de terceiros é aplicada. */
function collectModerationState(actions, validModerators) {
  const state = { hiddenTargets: new Set(), reviewTargets: new Map(), bannedOwners: new Set(), pinState: new Map(), lockState: new Map() };
  const sortedActions = [...actions].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  for (const act of sortedActions) {
    const actOwner = (act.owner || act.author || "").toLowerCase();
    const apply = Object.hasOwn(MOD_ACTION_APPLY, act.action) ? MOD_ACTION_APPLY[act.action] : null;
    if (!actOwner || !validModerators.has(actOwner) || !act.target || !apply) continue;
    apply(state, act.target, Number(act.ts) || 0);
  }
  return state;
}

/** PM-69: item arquivado por denúncia continua visível, marcado "em revisão", para o autor e para a moderação. */
function canSeeInReview(item, reviewTargets, viewerKey, viewerIsMod) {
  if (!viewerKey || !reviewTargets.has(item.id)) return false;
  return viewerIsMod || String(item.owner || item.author || "").toLowerCase() === viewerKey;
}

export function applyFilters(items, actions = [], communityOwner = "", rawModerators = "", viewer = "") {
  if (!Array.isArray(items) || !items.length) return [];
  if (!Array.isArray(actions) || !actions.length) return items;

  const validModerators = buildValidModeratorsSet(communityOwner, rawModerators);
  const { hiddenTargets, reviewTargets, bannedOwners, pinState, lockState } = collectModerationState(actions, validModerators);
  const viewerKey = String(viewer || "").toLowerCase();
  const viewerIsMod = Boolean(viewerKey) && validModerators.has(viewerKey);

  return items
    .filter((item) => {
      if (hiddenTargets.has(item.id)) return canSeeInReview(item, reviewTargets, viewerKey, viewerIsMod);
      if (item.owner && bannedOwners.has(item.owner.toLowerCase())) return false;
      return true;
    })
    .map((item) => {
      const isPinned = pinState.has(item.id) ? pinState.get(item.id) : item.isPinned;
      const isLocked = lockState.has(item.id) ? lockState.get(item.id) : item.isLocked;
      const review = hiddenTargets.has(item.id) ? { inReview: true, reviewSince: reviewTargets.get(item.id) } : null;
      if (review || isPinned !== item.isPinned || isLocked !== item.isLocked) {
        return { ...item, isPinned, isLocked, ...review };
      }
      return item;
    });
}

/**
 * Tópico aberto por link direto: quem não pode vê-lo recebe `archived: true` (a tela mostra "arquivado").
 * A moderação continua abrindo tópicos ocultos, como antes.
 */
export function filterTopicForViewer(topic, actions = [], communityOwner = "", rawModerators = "", viewer = "") {
  if (!topic) return topic;
  const [visible] = applyFilters([topic], actions, communityOwner, rawModerators, viewer);
  if (visible) return visible;
  if (isModerator(viewer, communityOwner, rawModerators)) return topic;
  return { ...topic, archived: true };
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
