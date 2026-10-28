/** Checklist seed pós-criação de comunidade (V-P05) — ritual ~3 min, localStorage. */
const PENDING_KEY = "vox-community-seed-pending";

/** Tour/mock — ritual de seed não se aplica a testadores na rede demo. */
export const SEED_RITUAL_SKIP_COMMUNITY_IDS = new Set([
  "demo-aprenda-vox",
  "demo-aprenda-vox-mirror",
  "demo-feira-local",
]);
const stateKey = (communityId) => `vox-community-seed-${communityId}`;

export function markSeedPending(communityId) {
  if (!communityId) return;
  try {
    localStorage.setItem(PENDING_KEY, String(communityId));
  } catch {
    /* quota */
  }
}

export function clearSeedPending(communityId) {
  try {
    const cur = localStorage.getItem(PENDING_KEY);
    if (cur === communityId) localStorage.removeItem(PENDING_KEY);
  } catch {
    /* quota */
  }
}

export function getSeedPendingCommunityId() {
  try {
    return localStorage.getItem(PENDING_KEY) || "";
  } catch {
    return "";
  }
}

/** @typedef {{ activeAck: boolean, invitesSent: number, commOnlyNudgeSeen: boolean, dismissed: boolean }} SeedState */

export function loadSeedState(communityId) {
  const base = { activeAck: false, invitesSent: 0, commOnlyNudgeSeen: false, dismissed: false };
  if (!communityId) return base;
  try {
    const raw = localStorage.getItem(stateKey(communityId));
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      activeAck: Boolean(parsed.activeAck),
      invitesSent: Math.max(0, Number(parsed.invitesSent) || 0),
      commOnlyNudgeSeen: Boolean(parsed.commOnlyNudgeSeen),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return base;
  }
}

export function saveSeedState(communityId, partial) {
  if (!communityId) return loadSeedState("");
  const next = { ...loadSeedState(communityId), ...partial };
  try {
    localStorage.setItem(stateKey(communityId), JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

/**
 * @param {SeedState} state
 * @param {{ topicCount?: number, peerEnabled?: boolean }} ctx
 */
export function isSeedComplete(state, { topicCount = 0, peerEnabled = true } = {}) {
  if (state.dismissed) return true;
  const activeOk = state.activeAck || peerEnabled !== false;
  const invitesOk = state.invitesSent >= 2;
  const topicOk = topicCount > 0;
  return activeOk && invitesOk && topicOk;
}

/**
 * @param {string} communityId
 * @param {string|null} userAddress
 * @param {{ owner?: string }} meta
 */
export function shouldOfferSeedRitual(communityId, userAddress, meta = {}) {
  if (!communityId || !userAddress) return false;
  if (SEED_RITUAL_SKIP_COMMUNITY_IDS.has(communityId)) return false;
  const state = loadSeedState(communityId);
  if (state.dismissed) return false;
  const pending = getSeedPendingCommunityId();
  if (pending === communityId) return true;
  const owner = meta.owner || meta.author || "";
  return owner === userAddress;
}

export function recordSeedInvite(communityId) {
  const state = loadSeedState(communityId);
  return saveSeedState(communityId, { invitesSent: Math.min(99, state.invitesSent + 1) });
}

export function dismissSeedRitual(communityId) {
  clearSeedPending(communityId);
  return saveSeedState(communityId, { dismissed: true });
}

export function finalizeSeedIfComplete(communityId, ctx) {
  const state = loadSeedState(communityId);
  if (isSeedComplete(state, ctx)) clearSeedPending(communityId);
  return state;
}
