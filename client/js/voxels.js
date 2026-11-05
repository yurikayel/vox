/**
 * Voxels & Civic Achievements — Sistema de Reconhecimento e Gamificação Ética Local-First.
 * ADR-013: Incentivo à infraestrutura e colaboração cívica sem alcances comprados nem plutocracia.
 */
import { computeBlobHash } from "./media-blob.js";
import * as localAccount from "./local-account.js";

export const SCHEMA_VOXEL_RECEIPT = "vox-voxel-receipt-v1";
export const SCHEMA_VOXEL_PASSPORT = "vox-voxel-passport-v1";

export const VOXEL_CATEGORIES = Object.freeze(["forja", "agora", "cuidado"]);

export const DEFAULT_ACTION_REWARDS = Object.freeze({
  relay_cache_uptime: 10,
  seed_blob_share: 5,
  p2p_boost_session: 5,
  agora_structured_proposal: 20,
  agora_consensus_synthesis: 30,
  cuidado_peer_onboarding: 15,
  cuidado_accessibility_item: 25,
});

export const ACHIEVEMENT_CATALOG = Object.freeze([
  {
    id: "forja_farol_iniciante",
    title: "Farol de Entrada",
    category: "forja",
    icon: "🕯️",
    description: "Iniciou e operou um nó dedicado com status comprovado",
    check: (ctx) => (ctx.uptimeHours || 0) >= 1,
  },
  {
    id: "forja_guardiao_malha",
    title: "Guardião da Malha",
    category: "forja",
    icon: "🛡️",
    description: "Manteve nó de apoio ativo por 168 horas cumulativas",
    check: (ctx) => (ctx.uptimeHours || 0) >= 168,
  },
  {
    id: "forja_semeador_permaweb",
    title: "Semeador Permaweb",
    category: "forja",
    icon: "🌐",
    description: "Serviu mais de 1 GB de blobs/cache público com integridade SHA-256",
    check: (ctx) => (ctx.bytesRelayed || 0) >= 1024 * 1024 * 1024,
  },
  {
    id: "agora_escriba_sintese",
    title: "Escriba da Ágora",
    category: "agora",
    icon: "📜",
    description: "Publicou síntese estruturada aprovada pela comunidade",
    check: (ctx) => (ctx.synthesesCount || 0) >= 1,
  },
  {
    id: "agora_construtor_pontes",
    title: "Construtor de Pontes",
    category: "agora",
    icon: "🌉",
    description: "Participou de deliberações com alta concordância cruzada",
    check: (ctx) => (ctx.bridgesCount || 0) >= 1,
  },
  {
    id: "cuidado_guia_boas_vindas",
    title: "Guia Cívico",
    category: "cuidado",
    icon: "🤝",
    description: "Auxiliou no acolhimento e sincronização de novos cidadãos",
    check: (ctx) => (ctx.onboardingsCount || 0) >= 1,
  },
  {
    id: "cuidado_acessibilidade",
    title: "Voz Acessível",
    category: "cuidado",
    icon: "👁️",
    description: "Produziu transcrição ou audiodescrição em conteúdos públicos",
    check: (ctx) => (ctx.accessibilityCount || 0) >= 1,
  },
]);

function normalizeRouteId(routeId) {
  const clean = String(routeId || "").trim();
  if (!clean) throw new Error("routeId do cidadão é obrigatório");
  return clean;
}

function normalizeCategory(category) {
  const clean = String(category || "").trim().toLowerCase();
  if (!VOXEL_CATEGORIES.includes(clean)) {
    throw new Error(`Categoria inválida: '${category}'. Válidas: ${VOXEL_CATEGORIES.join(", ")}`);
  }
  return clean;
}

function normalizeAmount(amount, action) {
  if (amount !== undefined && amount !== null) {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error("Valor do Voxel deve ser número positivo e finito");
    }
    return Math.round(num);
  }
  return DEFAULT_ACTION_REWARDS[action] || 1;
}

export async function createVoxelReceipt(params = {}) {
  const routeId = normalizeRouteId(params.routeId);
  const category = normalizeCategory(params.category);
  const action = String(params.action || "generic_civic_action").trim();
  const amount = normalizeAmount(params.amount, action);
  const timestamp = Number(params.timestamp) || Date.now();
  const metadata = params.metadata && typeof params.metadata === "object" ? { ...params.metadata } : {};

  const canonicalDraft = JSON.stringify({
    schema: SCHEMA_VOXEL_RECEIPT,
    routeId,
    category,
    action,
    amount,
    timestamp,
    witnessRouteId: params.witnessRouteId ? String(params.witnessRouteId).trim() : null,
    metadata,
  });

  const hash = await computeBlobHash(canonicalDraft);
  return {
    schema: SCHEMA_VOXEL_RECEIPT,
    id: `vxr_${hash.slice(0, 16)}`,
    routeId,
    category,
    action,
    amount,
    timestamp,
    witnessRouteId: params.witnessRouteId ? String(params.witnessRouteId).trim() : null,
    metadata,
  };
}

export function validateVoxelReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return { ok: false, reason: "invalid-type" };
  if (receipt.schema !== SCHEMA_VOXEL_RECEIPT) return { ok: false, reason: "invalid-schema" };
  if (!receipt.id || typeof receipt.id !== "string") return { ok: false, reason: "missing-id" };
  if (!receipt.routeId || typeof receipt.routeId !== "string") return { ok: false, reason: "missing-routeId" };
  if (!VOXEL_CATEGORIES.includes(receipt.category)) return { ok: false, reason: "invalid-category" };
  if (typeof receipt.amount !== "number" || !Number.isFinite(receipt.amount) || receipt.amount <= 0) {
    return { ok: false, reason: "invalid-amount" };
  }
  if (!Number.isFinite(receipt.timestamp) || receipt.timestamp <= 0) {
    return { ok: false, reason: "invalid-timestamp" };
  }
  return { ok: true };
}

export function calculateDecayedAmount(amount, receiptTime, nowTime, halfLifeDays) {
  if (!halfLifeDays || halfLifeDays <= 0) return amount;
  const elapsedMs = Math.max(0, nowTime - receiptTime);
  const halfLifeMs = halfLifeDays * 86_400_000;
  const decayFactor = Math.pow(0.5, elapsedMs / halfLifeMs);
  return amount * decayFactor;
}

export function computeVoxelBalance(receipts = [], options = {}) {
  const now = options.now || Date.now();
  const forjaHalfLife = options.decayHalfLifeDays || 0;

  const byCategory = { forja: 0, agora: 0, cuidado: 0 };
  let validCount = 0;

  for (const receipt of receipts) {
    const val = validateVoxelReceipt(receipt);
    if (!val.ok) continue;

    const baseAmount = receipt.amount;
    const finalAmount = receipt.category === "forja" && forjaHalfLife > 0
      ? calculateDecayedAmount(baseAmount, receipt.timestamp, now, forjaHalfLife)
      : baseAmount;

    byCategory[receipt.category] += finalAmount;
    validCount++;
  }

  const roundedByCategory = {
    forja: Math.round(byCategory.forja * 100) / 100,
    agora: Math.round(byCategory.agora * 100) / 100,
    cuidado: Math.round(byCategory.cuidado * 100) / 100,
  };

  const total = Math.round((roundedByCategory.forja + roundedByCategory.agora + roundedByCategory.cuidado) * 100) / 100;
  return { total, byCategory: roundedByCategory, validReceiptsCount: validCount };
}

export function extractEvaluationContext(receipts = []) {
  const ctx = {
    uptimeHours: 0,
    bytesRelayed: 0,
    synthesesCount: 0,
    bridgesCount: 0,
    onboardingsCount: 0,
    accessibilityCount: 0,
  };

  for (const r of receipts) {
    if (!validateVoxelReceipt(r).ok) continue;
    const meta = r.metadata || {};
    if (meta.uptimeHours) ctx.uptimeHours += Number(meta.uptimeHours) || 0;
    if (meta.bytesRelayed) ctx.bytesRelayed += Number(meta.bytesRelayed) || 0;
    if (r.action === "agora_consensus_synthesis") ctx.synthesesCount += 1;
    if (r.action === "agora_bridge_building") ctx.bridgesCount += 1;
    if (r.action === "cuidado_peer_onboarding") ctx.onboardingsCount += 1;
    if (r.action === "cuidado_accessibility_item") ctx.accessibilityCount += 1;
  }

  return ctx;
}

export function evaluateAchievements(receipts = [], unlockedIds = []) {
  const currentUnlockedSet = new Set(unlockedIds);
  const context = extractEvaluationContext(receipts);

  const unlocked = [];
  const newlyUnlocked = [];

  for (const item of ACHIEVEMENT_CATALOG) {
    const alreadyHad = currentUnlockedSet.has(item.id);
    const meetsCriteria = item.check(context);

    if (alreadyHad || meetsCriteria) {
      const summary = {
        id: item.id,
        title: item.title,
        category: item.category,
        icon: item.icon,
        description: item.description,
      };
      unlocked.push(summary);
      if (!alreadyHad && meetsCriteria) newlyUnlocked.push(summary);
    }
  }

  return { unlocked, newlyUnlocked, totalUnlockedCount: unlocked.length };
}

export function buildVoxelPassport(routeId, receipts = [], unlockedIds = [], options = {}) {
  const cleanRoute = normalizeRouteId(routeId);
  const balance = computeVoxelBalance(receipts, options);
  const { unlocked } = evaluateAchievements(receipts, unlockedIds);

  return {
    schema: SCHEMA_VOXEL_PASSPORT,
    routeId: cleanRoute,
    generatedAt: options.now || Date.now(),
    balance,
    achievements: unlocked,
    receiptCount: balance.validReceiptsCount,
  };
}

export const STORAGE_VOXELS_RECEIPTS_PREFIX = "vox_voxel_receipts_";
export const MAX_STORED_RECEIPTS = 500;
export const LAST_NODE_REWARD_KEY = "vox_last_node_uptime_reward";
export const COOLDOWN_NODE_REWARD_MS = 3600_000;

export function getStorageKey(routeId) {
  return `${STORAGE_VOXELS_RECEIPTS_PREFIX}${normalizeRouteId(routeId)}`;
}

export function loadVoxelReceipts(routeId, storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(getStorageKey(routeId));
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((r) => validateVoxelReceipt(r).ok);
  } catch {
    return [];
  }
}

export function saveVoxelReceipt(receipt, storage = globalThis.localStorage) {
  const val = validateVoxelReceipt(receipt);
  if (!val.ok) throw new Error(`Recibo de voxel inválido: ${val.reason}`);
  if (!storage) return { ok: false, reason: "no-storage" };

  const key = getStorageKey(receipt.routeId);
  const current = loadVoxelReceipts(receipt.routeId, storage);
  current.push(receipt);

  const pruned = current.length > MAX_STORED_RECEIPTS
    ? current.slice(current.length - MAX_STORED_RECEIPTS)
    : current;

  storage.setItem(key, JSON.stringify(pruned));
  return { ok: true, count: pruned.length };
}

export function clearVoxelReceipts(routeId, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.removeItem(getStorageKey(routeId));
}

export async function recordCivicAction(params = {}, storage = globalThis.localStorage) {
  const receipt = await createVoxelReceipt(params);
  saveVoxelReceipt(receipt, storage);
  return receipt;
}

export function passportDownloadFilename(routeId, ts = Date.now()) {
  const slug = String(routeId || "local").replace(/[^\w-]/g, "").slice(0, 24);
  return `vox-passaporte-civico-${slug}-${ts}.json`;
}

export async function exportSignedVoxelPassport(routeId, receipts = [], unlockedIds = [], signFn = null, options = {}) {
  const passportDraft = buildVoxelPassport(routeId, receipts, unlockedIds, options);
  if (typeof signFn !== "function") {
    return {
      ok: true,
      signedPassport: passportDraft,
      isSigned: false,
      filename: passportDownloadFilename(routeId, passportDraft.generatedAt),
    };
  }
  const signed = await signFn(passportDraft);
  return {
    ok: true,
    signedPassport: signed,
    isSigned: true,
    filename: passportDownloadFilename(routeId, signed.ts || passportDraft.generatedAt),
  };
}

export async function verifySignedVoxelPassport(passport, verifyFn = null) {
  if (!passport || typeof passport !== "object") return { isValid: false, reason: "invalid-object" };
  if (passport.schema !== SCHEMA_VOXEL_PASSPORT) return { isValid: false, reason: "invalid-schema" };
  if (!passport.routeId || !passport.balance) return { isValid: false, reason: "missing-core-fields" };

  if (typeof verifyFn === "function" && passport.sig) {
    const isCryptoValid = await verifyFn(passport);
    if (!isCryptoValid) return { isValid: false, reason: "signature-failed" };
    return { isValid: true, isSigned: true, reason: "Passaporte autêntico com assinatura P-256 válida" };
  }

  return { isValid: true, isSigned: false, reason: "Passaporte íntegro em formato padrão (sem assinatura)" };
}

export async function checkAndRecordNodeZeroReward(routeId, isNodeOnline, now = Date.now(), storage = globalThis.localStorage) {
  if (!isNodeOnline || !storage) return { rewarded: false, reason: "node-offline" };
  const lastTs = Number(storage.getItem(LAST_NODE_REWARD_KEY) || 0);
  if (now - lastTs < COOLDOWN_NODE_REWARD_MS) {
    return { rewarded: false, reason: "cooldown-active", retryInMs: COOLDOWN_NODE_REWARD_MS - (now - lastTs) };
  }

  const receipt = await recordCivicAction({
    routeId,
    category: "forja",
    action: "relay_cache_uptime",
    amount: DEFAULT_ACTION_REWARDS.relay_cache_uptime,
    timestamp: now,
    metadata: { uptimeHours: 1, source: "node_zero_loopback" },
  }, storage);

  storage.setItem(LAST_NODE_REWARD_KEY, String(now));
  return { rewarded: true, receipt, amount: receipt.amount };
}

function resolveActiveRouteId(routeId) {
  if (routeId) return routeId;
  return localAccount.getCachedRouteIdSync ? localAccount.getCachedRouteIdSync() : null;
}

async function probeRelayOnline(checkRelayFn) {
  if (typeof checkRelayFn !== "function") return false;
  try {
    const probe = await checkRelayFn();
    return Boolean(probe?.online);
  } catch {
    return false;
  }
}

export async function triggerLocalNodeBoostReward({
  routeId = null,
  checkRelayFn = null,
  toastFn = null,
  now = Date.now(),
  storage = globalThis.localStorage,
} = {}) {
  const targetRoute = resolveActiveRouteId(routeId);
  if (!targetRoute) return { ok: false, reason: "no-routeId" };

  const isOnline = await probeRelayOnline(checkRelayFn);
  if (!isOnline) return { ok: false, reason: "node-offline" };

  const rewardRes = await checkAndRecordNodeZeroReward(targetRoute, true, now, storage);
  if (rewardRes.rewarded) {
    if (typeof toastFn === "function") {
      toastFn(`⚡ Nó Vox Populi ativo: +${rewardRes.amount} Voxels creditados na Forja!`, "info");
    }
    return { ok: true, rewarded: true, amount: rewardRes.amount, receipt: rewardRes.receipt };
  }

  return { ok: true, rewarded: false, reason: rewardRes.reason, retryInMs: rewardRes.retryInMs };
}
