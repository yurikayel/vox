/**
 * @file Vox Peer Blob Affinity (V-I09) — afinidade comportamental local de pares.
 * Prefere unicast WANT para pares RTC que serviram BLOB recentemente antes de flood.
 * Alinhado a "sem score público": puramente local, efêmero e com flag off por padrão.
 */

const MAX_AFFINITY_PEERS = 16;
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutos
const HALF_LIFE_MS = 5 * 60 * 1000;    // 5 minutos para meia-vida
const MAX_SCORE = 10;
const STORAGE_FLAG_KEY = "vox-blob-peer-soft-priority";

let blobPeerSoftPriority = false;
const affinityMap = new Map(); // peerId -> { score, lastHit, expiresAt }

/**
 * Indica se a prioridade suave de blobs por afinidade local está ligada.
 * @returns {boolean} `true` quando habilitada em memória ou `localStorage`.
 */
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

/**
 * Liga ou desliga a prioridade suave local de blobs em memória e `localStorage`.
 * @param {boolean} enabled Novo estado da flag.
 * @returns {void}
 */
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

/**
 * Incrementa a afinidade local de um par após entrega bem-sucedida de blob.
 * @param {string} peerId Identificador do par.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {void}
 */
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

/**
 * Calcula a pontuação efetiva de um par com decaimento exponencial e expiração.
 * @param {string} peerId Identificador do par.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {number} Pontuação atual (>= 0).
 */
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

/**
 * Ordena `peerIds` por afinidade decrescente, descartando pares com pontuação 0.
 * @param {string[]} [peerIds=[]] Lista de pares candidatos.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {string[]} Pares ordenados do maior para o menor escore.
 */
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

/**
 * Limpa todo o mapa em memória de afinidades de pares.
 * @returns {void}
 */
export function clearAffinity() {
  affinityMap.clear();
}

/**
 * Retorna um retrato serializável das entradas de afinidade ainda vigentes.
 * @param {number} [now=Date.now()] Timestamp em ms.
 * @returns {Record<string, { score: number, effectiveScore: number, lastHit: number, expiresAt: number }>} Mapa por par.
 */
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
