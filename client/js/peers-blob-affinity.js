// Vox Peer Blob Affinity (V-I09) - Afinidade comportamental local de pares
// Prefere unicast WANT para pares RTC que serviram BLOB recentemente antes de flood.
// Alinhado a "sem score público": puramente local, efêmero e com flag off por padrão.

const MAX_AFFINITY_PEERS = 16;
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutos
const HALF_LIFE_MS = 5 * 60 * 1000;    // 5 minutos para meia-vida
const MAX_SCORE = 10;
const STORAGE_FLAG_KEY = "vox-blob-peer-soft-priority";

let blobPeerSoftPriority = false;
const affinityMap = new Map(); // peerId -> { score, lastHit, expiresAt }

export function isBlobPeerSoftPriorityEnabled() {
  if (blobPeerSoftPriority) return true;
  if (typeof localStorage !== "undefined") {
    try {
      return localStorage.getItem(STORAGE_FLAG_KEY) === "true";
    } catch {
      return false;
    }
  }
  return false;
}

export function setBlobPeerSoftPriorityEnabled(enabled) {
  blobPeerSoftPriority = Boolean(enabled);
  if (typeof localStorage !== "undefined") {
    try {
      if (enabled) {
        localStorage.setItem(STORAGE_FLAG_KEY, "true");
      } else {
        localStorage.removeItem(STORAGE_FLAG_KEY);
      }
    } catch {}
  }
}

function evictOldestIfNeeded() {
  if (affinityMap.size < MAX_AFFINITY_PEERS) return;

  let oldestKey = null;
  let minScore = Infinity;
  let oldestTime = Infinity;

  for (const [key, record] of affinityMap.entries()) {
    if (record.score < minScore || (record.score === minScore && record.lastHit < oldestTime)) {
      minScore = record.score;
      oldestTime = record.lastHit;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    affinityMap.delete(oldestKey);
  }
}

export function bumpAffinity(peerId, now = Date.now()) {
  if (!peerId || typeof peerId !== "string") return;

  const existing = affinityMap.get(peerId);
  if (existing && now <= existing.expiresAt) {
    existing.score = Math.min(MAX_SCORE, existing.score + 1);
    existing.lastHit = now;
    existing.expiresAt = now + DEFAULT_TTL_MS;
    return;
  }

  evictOldestIfNeeded();
  affinityMap.set(peerId, {
    score: 1,
    lastHit: now,
    expiresAt: now + DEFAULT_TTL_MS,
  });
}

export function getPeerAffinity(peerId, now = Date.now()) {
  if (!peerId) return 0;
  const record = affinityMap.get(peerId);
  if (!record) return 0;

  if (now > record.expiresAt) {
    affinityMap.delete(peerId);
    return 0;
  }

  const elapsed = Math.max(0, now - record.lastHit);
  const decay = Math.exp(-elapsed / HALF_LIFE_MS);
  return record.score * decay;
}

export function rankAffinity(peerIds = [], now = Date.now()) {
  if (!Array.isArray(peerIds) || !peerIds.length) return [];

  const candidates = [];
  for (const id of peerIds) {
    const score = getPeerAffinity(id, now);
    if (score > 0) {
      candidates.push({ id, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => c.id);
}

export function clearAffinity() {
  affinityMap.clear();
}

export function getAffinityEntries(now = Date.now()) {
  const entries = {};
  for (const [peerId, record] of affinityMap.entries()) {
    if (now <= record.expiresAt) {
      entries[peerId] = {
        score: record.score,
        effectiveScore: getPeerAffinity(peerId, now),
        lastHit: record.lastHit,
        expiresAt: record.expiresAt,
      };
    }
  }
  return entries;
}
