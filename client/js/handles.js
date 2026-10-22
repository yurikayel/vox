/**
 * Módulo de Identidade Amigável e Handles (Fase 5)
 * Resolução descentralizada de aliases @slug para endereços Arweave.
 * Tratamento de conflitos comunitários sem autoridade central.
 */

export const RESERVED_HANDLES = new Set([
  "admin",
  "vox",
  "www",
  "root",
  "api",
  "null",
  "undefined",
  "system",
  "mod",
  "moderator",
  "suporte",
  "ajuda",
]);

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,22}[a-z0-9])?$/;
const HANDLES_CACHE_KEY = "vox-handles-cache";

export function normalizeSlug(raw) {
  if (!raw) return "";
  let clean = String(raw).trim().toLowerCase();
  if (clean.startsWith("@")) clean = clean.slice(1);
  return clean;
}

export function validateSlug(raw) {
  const slug = normalizeSlug(raw);
  if (!slug) {
    return { valid: false, error: "O identificador não pode estar vazio." };
  }
  if (slug.length < 3 || slug.length > 24) {
    return { valid: false, error: "O handle deve ter entre 3 e 24 caracteres." };
  }
  if (!SLUG_REGEX.test(slug) || slug.includes("--")) {
    return { valid: false, error: "Use apenas letras minúsculas, números e hífens simples." };
  }
  if (RESERVED_HANDLES.has(slug)) {
    return { valid: false, error: `O identificador '@${slug}' é reservado pelo sistema.` };
  }
  return { valid: true, slug };
}

export function resolveHandleClaimants(edges = []) {
  if (!Array.isArray(edges) || edges.length === 0) return null;

  const claimantsMap = new Map();
  for (const edge of edges) {
    const node = edge.node || edge;
    const owner = node.owner?.address;
    if (!owner) continue;

    if (!claimantsMap.has(owner)) {
      claimantsMap.set(owner, {
        owner,
        txId: node.id,
        firstSeenTx: node.id,
      });
    }
  }

  const claimants = Array.from(claimantsMap.values());
  if (claimants.length === 0) return null;

  return {
    primaryOwner: claimants[0].owner,
    primaryTx: claimants[0].txId,
    isConflict: claimants.length > 1,
    claimants,
  };
}

export function getCachedHandleMapping(slug) {
  const clean = normalizeSlug(slug);
  if (!clean) return null;
  try {
    const raw = localStorage.getItem(HANDLES_CACHE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw);
    return store.bySlug?.[clean] || null;
  } catch {
    return null;
  }
}

export function getCachedAddressHandle(address) {
  if (!address) return null;
  try {
    const raw = localStorage.getItem(HANDLES_CACHE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw);
    return store.byAddress?.[address] || null;
  } catch {
    return null;
  }
}

export function cacheHandleMapping(slug, address) {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug || !address) return;
  try {
    const raw = localStorage.getItem(HANDLES_CACHE_KEY);
    const store = raw ? JSON.parse(raw) : { bySlug: {}, byAddress: {} };
    if (!store.bySlug) store.bySlug = {};
    if (!store.byAddress) store.byAddress = {};
    store.bySlug[cleanSlug] = address;
    store.byAddress[address] = cleanSlug;
    localStorage.setItem(HANDLES_CACHE_KEY, JSON.stringify(store));
  } catch {}
}
