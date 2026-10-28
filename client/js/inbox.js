/**
 * Cliente de Inbox Efêmero do Relay (Fase 4 & T2/V-P08)
 * Envio, busca e exclusão de envelopes cifrados fora do permaweb com TTL.
 * Suporta cascata Primário + Buddy (failover automático sem perda de confiança).
 */

export const RELAY_HTTP_STORAGE_KEY = "vox-relay-http-url";
export const RELAY_BUDDY_HTTP_STORAGE_KEY = "vox-relay-buddy-http-url";
const DEFAULT_RELAY_HTTP = "http://127.0.0.1:3920";

export function normalizeRelayHttpBase(raw) {
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

export function saveRelayBuddyHttpUrl(raw) {
  const normalized = normalizeRelayHttpBase(raw);
  if (normalized) {
    localStorage.setItem(RELAY_BUDDY_HTTP_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(RELAY_BUDDY_HTTP_STORAGE_KEY);
  }
}

export function getRelayBuddyHttpUrl() {
  try {
    const raw = localStorage.getItem(RELAY_BUDDY_HTTP_STORAGE_KEY);
    return normalizeRelayHttpBase(raw);
  } catch {}
  return null;
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

export function getRelayHttpUrls(baseUrl = null) {
  if (baseUrl) {
    const normalized = normalizeRelayHttpBase(baseUrl);
    return normalized ? [normalized] : [DEFAULT_RELAY_HTTP];
  }
  const primary = getRelayHttpUrl();
  const buddy = getRelayBuddyHttpUrl();
  const list = [primary];
  if (buddy && buddy !== primary) {
    list.push(buddy);
  }
  return list;
}

export async function pushSealed(toAddress, envelope, baseUrl = null) {
  if (!toAddress || !envelope) {
    throw new Error("toAddress e envelope são obrigatórios");
  }
  const targets = getRelayHttpUrls(baseUrl);
  let lastErr = null;
  let lastResult = null;

  for (const root of targets) {
    try {
      const url = `${root.replace(/\/+$/, "")}/inbox/${encodeURIComponent(toAddress)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      if (res.ok) {
        lastResult = await res.json();
      } else {
        const text = await res.text().catch(() => "");
        lastErr = new Error(`Falha no envio ao inbox (HTTP ${res.status}): ${text}`);
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastResult) return lastResult;
  throw lastErr || new Error("Falha no envio ao inbox em todos os relays configurados");
}

export async function pullMine(myAddress, baseUrl = null) {
  if (!myAddress) return [];
  const targets = getRelayHttpUrls(baseUrl);
  for (const root of targets) {
    const url = `${root.replace(/\/+$/, "")}/inbox/${encodeURIComponent(myAddress)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.envelopes)) {
        return data.envelopes;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function deleteSealed(myAddress, messageId, baseUrl = null) {
  if (!myAddress || !messageId) return false;
  const targets = getRelayHttpUrls(baseUrl);
  let anyOk = false;
  for (const root of targets) {
    const url = `${root.replace(/\/+$/, "")}/inbox/${encodeURIComponent(myAddress)}/${encodeURIComponent(messageId)}`;
    try {
      const res = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(3000) });
      if (res.ok) anyOk = true;
    } catch {}
  }
  return anyOk;
}
