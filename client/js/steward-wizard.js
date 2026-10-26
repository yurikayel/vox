/** Rascunho do wizard steward (V-P01). */
export const DRAFT_KEY = "vox-steward-wizard-draft";
const STEP_KEY = "vox-steward-wizard-step";

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveDraft(partial) {
  const next = { ...loadDraft(), ...partial };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}

export function loadStep() {
  const n = Number(localStorage.getItem(STEP_KEY) || "1");
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
}

export function saveStep(step) {
  localStorage.setItem(STEP_KEY, String(Math.min(5, Math.max(1, step))));
}

export async function verifyRelayHttp(baseUrl) {
  const root = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!root) return { ok: false, reason: "URL vazia" };
  try {
    const res = await fetch(`${root}/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: data?.status === "ok", data, reason: data?.status === "ok" ? "" : "status inválido" };
  } catch (e) {
    return { ok: false, reason: e.message || "falha de rede" };
  }
}

/** Linha curta para UI após GET /health (espelhos + quota). */
export function formatRelayHealthSummary(data) {
  if (!data || data.status !== "ok") return "";
  const n = data.communityIndexCount ?? 0;
  const used = Number(data.cacheBytes) || 0;
  const maxB = data.maxCacheBytes;
  const usedMb = Math.round(used / (1024 * 1024));
  if (maxB != null && maxB > 0) {
    const maxMb = Math.round(maxB / (1024 * 1024));
    const pct = Math.min(100, Math.round((used / maxB) * 100));
    return `${n} espelho(s) · cache ${pct}% (${usedMb}/${maxMb} MB)`;
  }
  if (used > 0) return `${n} espelho(s) · cache ${usedMb} MB`;
  return `${n} espelho(s)`;
}

export function readFormStep(step) {
  if (step === 1) {
    return { pledge: Boolean(document.getElementById("sw-pledge")?.checked) };
  }
  if (step === 2) {
    return { communityId: document.getElementById("sw-community-id")?.value.trim() || "" };
  }
  if (step === 4) {
    return {
      signalingUrl: document.getElementById("sw-signaling")?.value.trim() || "",
      relayHttpUrl: document.getElementById("sw-relay-http")?.value.trim() || "",
    };
  }
  if (step === 5) {
    const cid = loadDraft().communityId || "";
    const slug = cid.replace(/^#\/c\//, "");
    const link = document.getElementById("sw-share-link")?.value.trim() || (slug ? `#/c/${slug}` : "");
    return { shareLink: link };
  }
  return {};
}
