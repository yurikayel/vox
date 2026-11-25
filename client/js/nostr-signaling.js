/** Lista candidatos Nostr configurados; o transporte de sinalização não está integrado (REV-09). */

/**
 * Pool padrão validado pelo teste de fumaça REV-19 (scripts/nostr-smoke.mjs) em 2026-11-08:
 * aceitaram e repassaram evento efêmero kind 25050 sem auth, PoW ou pagamento.
 * `eden.nostr.land` saiu (exige pagamento). Reavaliar pelo workflow semanal nostr-smoke.yml.
 */
export const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://nostr.mom",
  "wss://offchain.pub",
];

/**
 * Só `wss://` com host e sem credenciais embutidas: WebSocket em claro expõe hello e metadados da sala.
 * @param {string} url Endereço já aparado.
 * @returns {boolean} `true` se serve como relay de sinalização.
 */
function isSecureRelayUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "wss:" && parsed.hostname !== "" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

/**
 * Candidatos de relay: os da pessoa primeiro, depois os padrão, sem repetir e sem endereço inseguro.
 * @param {unknown[]} [customRelays] Relays configurados pela pessoa (qualquer coisa que não seja lista é ignorada).
 * @returns {string[]} Endereços `wss://` aparados.
 */
export function buildNostrSignalingCandidates(customRelays = []) {
  const merged = [...(Array.isArray(customRelays) ? customRelays : []), ...DEFAULT_NOSTR_RELAYS];
  const cleaned = merged.map((r) => String(r || "").trim()).filter(isSecureRelayUrl);
  return Array.from(new Set(cleaned));
}
