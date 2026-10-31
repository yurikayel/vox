/**
 * Espelho local de índice de comunidade no relay HTTP (V-I03 / V-P06).
 * O cliente monta JSON leve e envia POST /vox/mirror para acelerar leitura na LAN.
 */

import { validateManifestBody } from "./cache-manifest.js";
import { getRelayHttpUrls } from "./inbox.js";

export const MIRROR_MAX_BODY_BYTES = 256 * 1024;
export const MIRROR_MAX_TOPICS = 500;
export const COMMUNITY_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;
export const MIRROR_TELEMETRY_KEY = "vox-mirror-telemetry";

const MIRROR_ERROR_PT = {
  "mirror.community_id_invalid": "Community-Id inválido (use letras, números, ponto, hífen ou sublinhado).",
  "mirror.topics_limit": "Lista de tópicos grande demais (máx. 500).",
  "mirror.topics_invalid": "Campo topics deve ser uma lista.",
  "mirror.body_too_large": "Índice grande demais; reduza tópicos ou use manifest v0.",
  "mirror.invalid_json": "JSON inválido.",
  "mirror.not_object": "Índice deve ser um objeto JSON.",
  "mirror.cache_manifest_invalid": "cacheManifest inválido (regras v0).",
  "mirror.local_validation": "Pré-validação local falhou.",
};

export function isMirrorVerbose() {
  try {
    return localStorage.getItem("VOX_MIRROR_VERBOSE") === "1";
  } catch {
    return false;
  }
}

export function mirrorUserMessage(code, fallback = "") {
  return MIRROR_ERROR_PT[code] || fallback || "Índice não enviado ao relay.";
}

export function loadMirrorTelemetry() {
  try {
    const raw = localStorage.getItem(MIRROR_TELEMETRY_KEY);
    if (!raw) return { byCommunity: {}, lastError: null, lastSuccess: null };
    const parsed = JSON.parse(raw);
    return {
      byCommunity: parsed.byCommunity && typeof parsed.byCommunity === "object" ? parsed.byCommunity : {},
      lastError: parsed.lastError || null,
      lastSuccess: parsed.lastSuccess || null,
    };
  } catch {
    return { byCommunity: {}, lastError: null, lastSuccess: null };
  }
}

function saveMirrorTelemetry(state) {
  try {
    localStorage.setItem(MIRROR_TELEMETRY_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function recordMirrorOutcome(communityId, outcome) {
  const cid = String(communityId || "").trim();
  const state = loadMirrorTelemetry();
  const entry = {
    at: outcome.at || new Date().toISOString(),
    ok: Boolean(outcome.ok),
    code: outcome.code || null,
    error: outcome.error || null,
    httpStatus: outcome.httpStatus ?? null,
    manual: Boolean(outcome.manual),
  };
  if (cid) state.byCommunity[cid] = entry;
  if (entry.ok) state.lastSuccess = { communityId: cid, ...entry };
  else state.lastError = { communityId: cid, ...entry };
  saveMirrorTelemetry(state);
  return entry;
}

export function getMirrorStatusForCommunity(communityId) {
  const cid = String(communityId || "").trim();
  if (!cid) return null;
  return loadMirrorTelemetry().byCommunity[cid] || null;
}

export function getMirrorLastErrorExport() {
  const err = loadMirrorTelemetry().lastError;
  if (!err) return null;
  return {
    mirror_last_error: err.code || err.error || "unknown",
    mirror_last_error_at: err.at,
    mirror_last_error_community: err.communityId || "",
  };
}

function validateCommunityTopics(topics) {
  if (topics !== undefined && topics !== null && !Array.isArray(topics)) {
    return { valid: false, code: "mirror.topics_invalid", error: "topics deve ser um array." };
  }
  if (Array.isArray(topics) && topics.length > MIRROR_MAX_TOPICS) {
    return {
      valid: false,
      code: "mirror.topics_limit",
      error: `topics excede limite de ${MIRROR_MAX_TOPICS} entradas.`,
    };
  }
  return null;
}

function validateCommunityCacheManifest(cacheManifest) {
  if (cacheManifest == null) return null;
  const cmCheck = validateManifestBody(cacheManifest);
  if (!cmCheck.valid) {
    return {
      valid: false,
      code: "mirror.cache_manifest_invalid",
      error: cmCheck.error || "cacheManifest inválido.",
    };
  }
  return null;
}

export function validateCommunityMirrorPayload(payload, bodyBytes = null) {
  const communityId = String(payload?.communityId || "").trim();
  if (!communityId || !COMMUNITY_ID_PATTERN.test(communityId)) {
    return { valid: false, code: "mirror.community_id_invalid", error: "communityId inválido ou ausente." };
  }
  const topicsCheck = validateCommunityTopics(payload?.topics);
  if (topicsCheck) return topicsCheck;

  const manifestCheck = validateCommunityCacheManifest(payload?.cacheManifest);
  if (manifestCheck) return manifestCheck;

  const bytes = bodyBytes ?? new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > MIRROR_MAX_BODY_BYTES) {
    return { valid: false, code: "mirror.body_too_large", error: "Corpo excede 256 KiB." };
  }
  return { valid: true };
}

export function buildCommunityMirrorIndex(community, topics = [], options = {}) {
  const communityId = String(community?.communityId || community?.id || "").trim();
  if (!communityId) {
    throw new Error("communityId obrigatório");
  }

  const normalizedTopics = (topics || [])
    .map((t) => ({
      id: String(t.id || t.txId || "").trim(),
      title: t.title || t.topicTitle || "Tópico",
      owner: t.owner || "",
    }))
    .filter((t) => t.id);

  const index = {
    communityId,
    title: community.title || communityId,
    description: community.description || "",
    owner: community.owner || "",
    topics: normalizedTopics,
    mirroredAt: options.mirroredAt || new Date().toISOString(),
    source: options.source || "vox-pwa",
  };

  const check = validateCommunityMirrorPayload(index);
  if (!check.valid) {
    const msg = mirrorUserMessage(check.code, check.error);
    const err = new Error(msg);
    err.code = check.code;
    throw err;
  }

  return index;
}

async function parseMirrorErrorResponse(res) {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text);
    if (data?.code) {
      return { code: data.code, error: data.error || text, httpStatus: res.status };
    }
  } catch {
    /* plain text */
  }
  return { code: null, error: text || `HTTP ${res.status}`, httpStatus: res.status };
}

async function postMirrorToSingleTarget(root, body) {
  try {
    const url = `${root}/vox/mirror`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      return { ok: true, result: await res.json() };
    }
    const parsed = await parseMirrorErrorResponse(res);
    const err = new Error(
      mirrorUserMessage(parsed.code, parsed.error) || `Falha ao espelhar comunidade (HTTP ${res.status})`,
    );
    err.code = parsed.code || "mirror.relay_error";
    err.httpStatus = parsed.httpStatus;
    return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function postCommunityMirrorToRelay(indexPayload, baseUrl = null) {
  const communityId = indexPayload?.communityId;
  if (!communityId) throw new Error("communityId obrigatório");

  const body = JSON.stringify(indexPayload);
  const check = validateCommunityMirrorPayload(indexPayload, new TextEncoder().encode(body).length);
  if (!check.valid) {
    const err = new Error(mirrorUserMessage(check.code, check.error));
    err.code = check.code;
    throw err;
  }

  const targets = baseUrl ? [baseUrl.replace(/\/+$/, "")] : getRelayHttpUrls();
  let lastErr = null;
  let lastResult = null;
  let successCount = 0;

  for (const root of targets) {
    const res = await postMirrorToSingleTarget(root, body);
    if (res.ok) {
      successCount++;
      lastResult = res.result;
    } else {
      lastErr = res.error;
    }
  }

  if (successCount > 0) return lastResult || { ok: true, mirrored: true };
  throw lastErr || new Error("Falha ao espelhar comunidade em todos os relays configurados");
}

export async function mirrorCommunityToRelay(community, topics, baseUrl = null, options = {}) {
  const index = buildCommunityMirrorIndex(community, topics, options);
  const result = await postCommunityMirrorToRelay(index, baseUrl);
  recordMirrorOutcome(index.communityId, {
    ok: true,
    manual: Boolean(options.manual),
  });
  return { index, result };
}

function shouldNotifyMirrorFailure(options = {}) {
  return Boolean(options.manual || options.notify || isMirrorVerbose());
}

/** Best-effort: não propaga erro (ex.: relay offline), salvo flag verbose ou disparo manual. */
export async function tryMirrorCommunityToRelay(community, topics, baseUrl = null, options = {}) {
  try {
    return await mirrorCommunityToRelay(community, topics, baseUrl, options);
  } catch (e) {
    const communityId = String(community?.communityId || community?.id || "").trim();
    recordMirrorOutcome(communityId, {
      ok: false,
      code: e.code || "mirror.local_validation",
      error: e.message,
      httpStatus: e.httpStatus ?? null,
      manual: Boolean(options.manual),
    });
    if (shouldNotifyMirrorFailure(options)) {
      const { showToast } = await import("./share.js");
      const hint = e.code ? mirrorUserMessage(e.code, e.message) : e.message;
      showToast(`Índice não enviado: ${hint}`, "error");
    }
    return null;
  }
}

/** Disparo manual do wizard steward (step 5). */
export async function testMirrorForSteward(communityId, topics = [], baseUrl = null) {
  const cid = String(communityId || "").trim();
  const { showToast } = await import("./share.js");
  if (!cid) {
    showToast("Informe o Community-Id no passo 2 do assistente.", "error");
    return null;
  }
  return tryMirrorCommunityToRelay(
    { id: cid, title: cid },
    topics,
    baseUrl,
    { manual: true },
  );
}
