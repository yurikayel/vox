/**
 * @file Descoberta e consulta a instâncias locais de Desktop Relay via HTTP (`/health` e `/tx/<id>`).
 */

import { getRelayHttpUrls } from "./inbox.js";

/**
 * Procura um relay de desktop no ar pelo `/health` (450 ms por endereço).
 * @param {string|null} [url=null] Endereço a testar; sem ele, os relays configurados, em ordem.
 * @returns {Promise<{online: boolean, data?: object, activeUrl?: string}>} O primeiro que respondeu, ou `{online: false}`.
 */
export async function checkDesktopRelay(url = null) {
  const targets = url ? [url] : getRelayHttpUrls();
  for (const root of targets) {
    const healthUrl = `${root.replace(/\/+$/, "")}/health`;
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(450) });
      if (!res.ok) continue;
      const data = await res.json();
      return { online: true, data, activeUrl: root };
    } catch {}
  }
  return { online: false };
}

/**
 * Busca uma transação no relay de desktop (`/tx/<id>`, 800 ms por endereço).
 * @param {string} txId Id da transação.
 * @param {string|null} [url=null] Endereço do relay; sem ele, os relays configurados, em ordem.
 * @returns {Promise<{body: string, raw: string, title?: string}|null>} Corpo (e título, se veio JSON), ou null se nenhum respondeu.
 */
export async function fetchFromDesktopRelay(txId, url = null) {
  const targets = url ? [url] : getRelayHttpUrls();
  for (const root of targets) {
    try {
      const res = await fetch(`${root.replace(/\/+$/, "")}/tx/${encodeURIComponent(txId)}`, {
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) continue;
      const text = await res.text();
      let parsed = { body: text, raw: text };
      try {
        const json = JSON.parse(text);
        if (typeof json === "object" && json !== null) {
          parsed.body = json.body || json.content || json.text || text;
          parsed.title = json.title || "";
        }
      } catch {}
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
