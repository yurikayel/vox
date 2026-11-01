/**
 * Módulo de Sinalização Efêmera via Nostr (Fase 3.4)
 * Permite handshake WebRTC (oferta/resposta SDP e candidatos ICE)
 * através de relays públicos abertos da rede Nostr (Kind 25000 efêmero),
 * eliminando a necessidade de servidores de sinalização dedicados.
 */

export const NOSTR_SIGNAL_KIND = 25000;

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

export function createNostrSignalEnvelope({ fromPeerId, toPeerId, signalType, payload, createdAt = null }) {
  if (!fromPeerId || !toPeerId || !signalType) {
    throw new Error("fromPeerId, toPeerId e signalType são obrigatórios");
  }
  const content = JSON.stringify({
    from: fromPeerId,
    to: toPeerId,
    type: signalType,
    payload: payload || {},
  });
  const event = {
    kind: NOSTR_SIGNAL_KIND,
    created_at: createdAt || Math.floor(Date.now() / 1000),
    tags: [
      ["p", String(toPeerId)],
      ["t", "vox-webrtc-signal"],
    ],
    content,
  };
  return ["EVENT", event];
}

export function createNostrSubscriptionMessage(peerId, subPrefix = "vox_sig_") {
  if (!peerId) throw new Error("peerId obrigatório para subscrição Nostr");
  const subId = `${subPrefix}${String(peerId).slice(0, 10)}`;
  const filter = {
    kinds: [NOSTR_SIGNAL_KIND],
    "#p": [String(peerId)],
    "#t": ["vox-webrtc-signal"],
  };
  return ["REQ", subId, filter];
}

export function parseNostrSignalMessage(rawMessage, myPeerId) {
  try {
    const data = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
    if (!Array.isArray(data) || data[0] !== "EVENT" || !data[2]?.content) {
      return null;
    }
    const event = data[2];
    if (event.kind !== NOSTR_SIGNAL_KIND) return null;
    const body = JSON.parse(event.content);
    if (myPeerId && body.to && body.to !== myPeerId) return null;
    return body;
  } catch {
    return null;
  }
}
