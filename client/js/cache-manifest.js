/**
 * @file Manifesto de cache comunitário (Type `cache-manifest`, V-I05).
 *
 * Corpo JSON e tags Arweave para espelhar e fixar TXs públicas de uma comunidade.
 * @module cache-manifest
 */

import { buildTags } from "./upload.js";

/** Valor da tag `Type` em publicações de manifesto. @type {string} */
export const CACHE_MANIFEST_TYPE = "cache-manifest";
/** Versão do esquema do corpo JSON. @type {number} */
export const MANIFEST_VERSION = 0;

const TX_ID_REGEX = /^[A-Za-z0-9_-]{43}$/;
const PIN_ROLES = new Set(["community", "topic", "reply", "post", "blob", "index"]);

/**
 * Valida formato de id de transação Arweave (43 caracteres base64url).
 * @param {string} id Candidato a tx id.
 * @returns {boolean}
 */
export function isArweaveTxId(id) {
  return TX_ID_REGEX.test(String(id || "").trim());
}

/**
 * Normaliza uma entrada de pin para o formato canônico interno.
 * @param {object} [raw={}] Entrada bruta (aceita aliases `id`, `kind`).
 * @returns {{ txId: string, role: string, sha256: string|undefined }}
 */
export function normalizePinEntry(raw = {}) {
  const txId = String(raw.txId || raw.id || "").trim();
  const role = String(raw.role || raw.kind || "blob").trim().toLowerCase();
  const sha256 = String(raw.sha256 || "").trim().toLowerCase();
  return { txId, role, sha256: sha256 || undefined };
}

/**
 * Valida uma entrada de pin isolada.
 * @param {object} entry Entrada de pin.
 * @returns {{ valid: boolean, error?: string, entry?: object }}
 */
export function validatePinEntry(entry) {
  const normalized = normalizePinEntry(entry);
  if (!isArweaveTxId(normalized.txId)) {
    return { valid: false, error: "txId inválido (43 caracteres base64url)." };
  }
  if (normalized.role && !PIN_ROLES.has(normalized.role)) {
    return { valid: false, error: "role de pin não reconhecida." };
  }
  if (normalized.sha256 && !/^[a-f0-9]{64}$/.test(normalized.sha256)) {
    return { valid: false, error: "sha256 deve ser hex de 64 caracteres." };
  }
  return { valid: true, entry: normalized };
}

/**
 * Valida a lista de fixações (não vazia, até 512 entradas).
 * @param {Array} pins Fixações
 * @returns {{valid: boolean, error?: string}} Resultado da validação.
 */
function validatePinsCollection(pins) {
  if (!Array.isArray(pins) || !pins.length) return { valid: false, error: "pins não pode ser vazio." };
  if (pins.length > 512) return { valid: false, error: "pins excede limite de 512 entradas." };

  const normalized = [];
  const seen = new Set();
  for (const p of pins) {
    const res = validatePinEntry(p);
    if (!res.valid) return res;
    if (seen.has(res.entry.txId)) return { valid: false, error: "txId duplicado no manifesto." };
    seen.add(res.entry.txId);
    normalized.push(res.entry);
  }
  return { valid: true, pins: normalized };
}

/**
 * Valida corpo completo de manifesto antes de publicar.
 * @param {object} [body={}] Corpo candidato.
 * @returns {{ valid: boolean, error?: string, manifest?: object }}
 */
export function validateManifestBody(body = {}) {
  const communityId = String(body.communityId || "").trim();
  if (!communityId) return { valid: false, error: "communityId obrigatório." };
  const v = Number(body.v ?? body.manifestVersion ?? MANIFEST_VERSION);
  if (v !== MANIFEST_VERSION) return { valid: false, error: "manifestVersion incompatível." };

  const pinsResult = validatePinsCollection(body.pins);
  if (!pinsResult.valid) return pinsResult;

  const previousManifestTx = body.previousManifestTx ? String(body.previousManifestTx).trim() : undefined;
  if (previousManifestTx && !isArweaveTxId(previousManifestTx)) {
    return { valid: false, error: "previousManifestTx inválido." };
  }

  return {
    valid: true,
    manifest: {
      v: MANIFEST_VERSION,
      communityId,
      issuedAt: Number(body.issuedAt) || 0,
      pins: pinsResult.pins,
      previousManifestTx,
    },
  };
}

/**
 * JSON canônico da lista de pins (ordenado por `txId`).
 * @param {object[]} pins Pins normalizados.
 * @returns {string}
 */
export function canonicalPinsJson(pins) {
  const sorted = [...pins].sort((a, b) => a.txId.localeCompare(b.txId));
  return JSON.stringify(sorted);
}

/**
 * Raiz SHA-256 (hex) do JSON canônico dos pins.
 * @param {object[]} pins Lista de pins.
 * @returns {Promise<string>}
 */
export async function pinsRootSha256(pins) {
  const text = canonicalPinsJson(pins);
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Monta corpo de manifesto validado; lança se inválido.
 * @param {object} input
 * @param {string} input.communityId Id da comunidade.
 * @param {object[]} input.pins Pins a incluir.
 * @param {number} [input.issuedAt] Emissão em ms (padrão: agora).
 * @param {string} [input.previousManifestTx] Tx do manifesto anterior.
 * @param {string} [input.issuerRouteId] Rota de quem emite.
 * @returns {object}
 * @throws {Error} Corpo inválido.
 */
export function buildManifestBody({ communityId, pins, issuedAt, previousManifestTx, issuerRouteId }) {
  const check = validateManifestBody({ communityId, v: MANIFEST_VERSION, pins, issuedAt, previousManifestTx });
  if (!check.valid) throw new Error(check.error);
  const body = { ...check.manifest, issuedAt: check.manifest.issuedAt || Date.now() };
  if (issuerRouteId) body.issuerRouteId = String(issuerRouteId).trim();
  return body;
}

/**
 * Tags Arweave para upload do manifesto de cache.
 * @param {object} input
 * @param {string} input.communityId Id da comunidade.
 * @param {string} [input.ownerAddr] Carteira da comunidade.
 * @param {string} [input.previousManifestTx] Manifesto anterior.
 * @param {string} [input.pinsRoot] Hash raiz dos pins.
 * @returns {object[]}
 */
export function buildCacheManifestTags({ communityId, ownerAddr, previousManifestTx, pinsRoot }) {
  const fields = {
    "Community-Id": communityId,
    "Manifest-Version": String(MANIFEST_VERSION),
  };
  if (ownerAddr) fields["Owner-Addr"] = ownerAddr;
  if (previousManifestTx) fields["Previous-Manifest"] = previousManifestTx;
  if (pinsRoot) fields["Pins-Root"] = pinsRoot;
  return buildTags(CACHE_MANIFEST_TYPE, fields);
}

/**
 * Extrai metadados úteis das tags de um manifesto baixado.
 * @param {object[]} [tags=[]] Tags Arweave `{ name, value }`.
 * @returns {{ type: string, communityId: string, manifestVersion: number, ownerAddr: string, previousManifest: string, pinsRoot: string, appName: string }}
 */
export function extractCacheManifestMeta(tags = []) {
  const map = Object.fromEntries(
    (Array.isArray(tags) ? tags : []).map((t) => [t.name, t.value])
  );
  return {
    type: map.Type || "",
    communityId: map["Community-Id"] || "",
    manifestVersion: Number(map["Manifest-Version"] ?? NaN),
    ownerAddr: map["Owner-Addr"] || "",
    previousManifest: map["Previous-Manifest"] || "",
    pinsRoot: map["Pins-Root"] || "",
    appName: map["App-Name"] || "",
  };
}