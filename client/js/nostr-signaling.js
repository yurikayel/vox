/** Lista candidatos Nostr configurados; o transporte de sinalização não está integrado. */

export const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
];

export function buildNostrSignalingCandidates(customRelays = []) {
  const merged = [...(Array.isArray(customRelays) ? customRelays : []), ...DEFAULT_NOSTR_RELAYS];
  const cleaned = merged
    .map((r) => String(r || "").trim())
    .filter((r) => r.startsWith("wss://") || r.startsWith("ws://"));
  return Array.from(new Set(cleaned));
}
