/**
 * Cliente de Inbox Efêmero do Relay (Fase 4)
 * Envio, busca e exclusão de envelopes cifrados fora do permaweb com TTL.
 */

export function getRelayHttpUrl() {
  try {
    const custom = localStorage.getItem("vox-custom-signaling-url");
    if (custom && custom.trim()) {
      const url = custom.trim();
      if (url.startsWith("wss://")) {
        return url.replace("wss://", "https://").replace(/:3921$/, ":3920");
      }
      if (url.startsWith("ws://")) {
        return url.replace("ws://", "http://").replace(/:3921$/, ":3920");
      }
    }
  } catch {}
  return "http://127.0.0.1:3920";
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
