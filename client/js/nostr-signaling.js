/** Lista candidatos Nostr configurados; o transporte de sinalização não está integrado (REV-09). */

/**
 * Pool padrão validado pelo teste de fumaça REV-19 (tools/nostr-smoke.mjs) em 2026-11-08:
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

export function buildNostrSignalingCandidates(customRelays = []) {
  const merged = [...(Array.isArray(customRelays) ? customRelays : []), ...DEFAULT_NOSTR_RELAYS];
  const cleaned = merged
    .map((r) => String(r || "").trim())
    .filter((r) => r.startsWith("wss://") || r.startsWith("ws://"));
  return Array.from(new Set(cleaned));
}
