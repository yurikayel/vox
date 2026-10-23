/**
 * Cliente de Inbox Efêmero do Relay (Fase 4)
 * Envio, busca e exclusão de envelopes cifrados fora do permaweb com TTL.
 */

export const RELAY_HTTP_STORAGE_KEY = "vox-relay-http-url";
const DEFAULT_RELAY_HTTP = "http://127.0.0.1:3920";

function normalizeRelayHttpBase(raw) {
  if (!raw || !String(raw).trim()) return null;
  let url = String(raw).trim().replace(/\/+$/, "");
  if (/^wss:\/\//i.test(url)) {
    url = url.replace(/^wss:\/\//i, "https://").replace(/:3921$/i, ":3920");
  } else if (/^ws:\/\//i.test(url)) {
    url = url.replace(/^ws:\/\//i, "http://").replace(/:3921$/i, ":3920");
  } else if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export function saveRelayHttpUrl(raw) {
  const normalized = normalizeRelayHttpBase(raw);
  if (normalized) {
    localStorage.setItem(RELAY_HTTP_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(RELAY_HTTP_STORAGE_KEY);
  }
}

export function getRelayHttpUrl() {
  try {
    const explicit = localStorage.getItem(RELAY_HTTP_STORAGE_KEY);
    const fromExplicit = normalizeRelayHttpBase(explicit);
    if (fromExplicit) return fromExplicit;

    const custom = localStorage.getItem("vox-custom-signaling-url");
    const fromSignaling = normalizeRelayHttpBase(custom);
    if (fromSignaling) return fromSignaling;
  } catch {}
  return DEFAULT_RELAY_HTTP;
}

export async function pushSealed(toAddress, envelope, baseUrl = null) {
  if (!toAddress || !envelope) {
    throw new Error("toAddress e envelope são obrigatórios");
  }
  const root = baseUrl || getRelayHttpUrl();
  const url = `${root.replace(/\/+$/, "")}/inbox/${encodeURIComponent(toAddress)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha no envio ao inbox (HTTP ${res.status}): ${text}`);
  }
  return await res.json();
}

export async function pullMine(myAddress, baseUrl = null) {
  if (!myAddress) return [];
  const root = baseUrl || getRelayHttpUrl();
  const url = `${root.replace(/\/+$/, "")}/inbox/${encodeURIComponent(myAddress)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.envelopes) ? data.envelopes : [];
  } catch {
    return [];
  }
}

export async function deleteSealed(myAddress, messageId, baseUrl = null) {
  if (!myAddress || !messageId) return false;
  const root = baseUrl || getRelayHttpUrl();
  const url = `${root.replace(/\/+$/, "")}/inbox/${encodeURIComponent(myAddress)}/${encodeURIComponent(messageId)}`;
  try {
    const res = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
