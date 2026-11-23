/**
 * Malha v0 — gossip CACHE_MANIFEST + prioridade WANT (V-I05).
 */
import {
  CACHE_MANIFEST_TYPE,
  validateManifestBody,
} from "./cache-manifest.js";

const STORAGE_KEY = "vox-cache-manifest-by-comm";

/**
 * Lê do `localStorage` os manifestos de cache guardados.
 * @returns {object} Manifestos por comunidade, ou objeto vazio.
 */
function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Grava no `localStorage` os manifestos de cache.
 * @param {object} map Manifestos por comunidade
 */
function writeStore(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/**
 * Retorna o manifesto de cache mais recente armazenado para a comunidade.
 * @param {string} communityId Identificador da comunidade.
 * @returns {object|null} Entrada de manifesto ou `null`.
 */
export function getLatestManifestForCommunity(communityId) {
  const store = readStore();
  return store[String(communityId || "").trim()] || null;
}

/**
 * Lista todos os manifestos de cache conhecidos localmente.
 * @returns {object[]} Lista de manifestos armazenados.
 */
export function listKnownManifests() {
  return Object.values(readStore());
}

/**
 * Coleta os IDs de transação marcados como pin prioritário em todos os manifestos conhecidos.
 * @returns {Set<string>} Conjunto de `txId` prioritários.
 */
export function collectPriorityPinTxIds() {
  const ids = new Set();
  for (const entry of listKnownManifests()) {
    const pins = entry?.manifest?.pins;
    if (!Array.isArray(pins)) continue;
    for (const p of pins) {
      if (p?.txId) ids.add(p.txId);
    }
  }
  return ids;
}

/**
 * Indica se o `txId` consta como prioridade em algum manifesto conhecido.
 * @param {string} txId ID da transação/post.
 * @returns {boolean} `true` se for prioritário.
 */
export function isManifestPriorityTx(txId) {
  if (!txId) return false;
  return collectPriorityPinTxIds().has(txId);
}

/**
 * Valida o formato do item de manifesto (id, tipo e comunidade).
 * @param {object} item Item
 * @returns {{ok: boolean, reason?: string}} Resultado da validação.
 */
function validateItemShape(item) {
  if (!item?.id || item.type !== CACHE_MANIFEST_TYPE || !item.communityId) {
    return { ok: false, reason: "formato" };
  }
  return { ok: true };
}

/**
 * Valida o conteúdo do manifesto do item.
 * @param {object} item Item
 * @returns {{ok: boolean, reason?: string}} Resultado da validação.
 */
function validateManifestPayload(item) {
  const check = validateManifestBody(item.manifest || {});
  if (!check.valid) {
    return { ok: false, reason: check.error || "manifest" };
  }
  if (check.manifest.communityId !== item.communityId) {
    return { ok: false, reason: "communityId" };
  }
  return { ok: true, manifest: check.manifest };
}

/**
 * Diz se já temos manifesto mais novo que o recebido.
 * @param {object|undefined} prev Manifesto guardado
 * @param {object} item Item recebido
 * @param {object} manifest Corpo do manifesto recebido
 * @returns {boolean} `true` se o recebido é mais antigo.
 */
function isOutdatedManifest(prev, item, manifest) {
  if (!prev) return false;
  const incomingAt = Number(manifest.issuedAt || item.ts || 0);
  const prevAt = Number(prev?.manifest?.issuedAt || prev?.ts || 0);
  return prevAt >= incomingAt;
}

/**
 * Valida, verifica assinatura e armazena um manifesto de cache recebido via gossip.
 * @param {object} item Item gossip recebido.
 * @param {(item: object) => Promise<boolean>} verifyFn Verificador de assinatura do item.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, manifest?: object, reason?: string }>} Resultado da ingestão.
 */
export async function ingestSignedCacheManifestItem(item, verifyFn) {
  const shapeCheck = validateItemShape(item);
  if (!shapeCheck.ok) return shapeCheck;

  if (typeof verifyFn !== "function" || !(await verifyFn(item))) {
    return { ok: false, reason: "sig" };
  }

  const manifestCheck = validateManifestPayload(item);
  if (!manifestCheck.ok) return manifestCheck;

  const store = readStore();
  const prev = store[item.communityId];
  if (isOutdatedManifest(prev, item, manifestCheck.manifest)) {
    return { ok: true, skipped: true };
  }

  store[item.communityId] = {
    ...item,
    manifest: manifestCheck.manifest,
  };
  writeStore(store);
  return { ok: true, skipped: false, manifest: manifestCheck.manifest };
}

/**
 * Monta o rascunho de item gossip de manifesto de cache pronto para assinatura.
 * @param {{ communityId?: string, manifest: object }} params Comunidade e corpo do manifesto.
 * @returns {object} Rascunho do item de manifesto.
 */
export function buildCacheManifestGossipDraft({ communityId, manifest }) {
  const comm = String(communityId || manifest?.communityId || "").trim();
  const issuedAt = Number(manifest?.issuedAt) || Date.now();
  return {
    id: `cmf_${comm}_${issuedAt}`,
    type: CACHE_MANIFEST_TYPE,
    communityId: comm,
    manifest,
    ts: Date.now(),
  };
}
