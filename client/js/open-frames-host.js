/**
 * Open Frames 2.0 — host mínimo (iframe sandbox + postMessage whitelist).
 * Ver docs/open-frames-v2.md
 */

export const OF_HOST_MESSAGE_TYPES = new Set(["of:ready", "of:resize", "of:action"]);

export function buildSandboxedFrameSrc(demoUrl) {
  const u = String(demoUrl || "").trim();
  if (!u || !/^https:\/\//i.test(u)) return "";
  return u;
}

export function handleFrameMessage(event, { allowedOrigins = [] } = {}) {
  if (!event?.data || typeof event.data !== "object") return null;
  const type = String(event.data.type || "");
  if (!OF_HOST_MESSAGE_TYPES.has(type)) return null;
  const origin = String(event.origin || "");
  if (allowedOrigins.length && !allowedOrigins.includes(origin)) return null;
  return { type, payload: event.data.payload || {}, origin };
}

export function attachOpenFrameHost(container, iframe, { allowedOrigins = [], onAction = null } = {}) {
  if (!container || !iframe) return () => {};
  const onMessage = (ev) => {
    const msg = handleFrameMessage(ev, { allowedOrigins });
    if (!msg) return;
    if (msg.type === "of:resize" && msg.payload?.height) {
      iframe.style.height = `${Math.min(640, Math.max(120, Number(msg.payload.height) || 0))}px`;
    }
    if (msg.type === "of:action" && typeof onAction === "function") {
      onAction(msg.payload);
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
