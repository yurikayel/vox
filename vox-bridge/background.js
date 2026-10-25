/** Vox Bridge MV3 stub — valida mensagens vox-bridge-posse; não posta em redes. */
const POSSE_TYPE = "vox-bridge-posse";

function validatePosseMessage(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "not_object" };
  if (data.v !== 1) return { ok: false, reason: "bad_version" };
  if (data.type !== POSSE_TYPE) return { ok: false, reason: "bad_type" };
  if (!String(data.topicId || "").trim()) return { ok: false, reason: "missing_topicId" };
  if (!String(data.canonicalUrl || "").trim()) return { ok: false, reason: "missing_canonicalUrl" };
  return { ok: true };
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  const v = validatePosseMessage(message);
  if (!v.ok) {
    sendResponse({ ok: false, reason: v.reason });
    return;
  }
  chrome.storage.local.set({ lastPossePayload: message, receivedAt: Date.now() });
  sendResponse({ ok: true, stub: true, note: "Bridge P2 — autopost desligado" });
});
