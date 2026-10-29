/**
 * airgap-webrtc.js — Pareamento Serverless Air-Gapped via QR Code SDP (Vox)
 *
 * Viabiliza conexão P2P direta entre dois navegadores/dispositivos sem passar
 * por NENHUM servidor de sinalização WebSocket externo. O handshake de SDP
 * ocorre inteiramente através da leitura mútua de telas via câmera óptica.
 */

export const AIRGAP_CHANNEL_NAME = "vox-airgap-v0";

export function cleanSdp(sdp) {
  if (!sdp || typeof sdp !== "string") return "";
  // Mantém apenas linhas essenciais para DataChannel SCTP
  const keepPrefixes = ["v=", "o=", "s=", "t=", "c=", "m=application", "a=mid:", "a=sctp-port:", "a=max-message-size:", "a=ice-ufrag:", "a=ice-pwd:", "a=fingerprint:", "a=setup:", "a=candidate:"];
  return sdp
    .split(/\r?\n/)
    .filter((line) => keepPrefixes.some((p) => line.startsWith(p)))
    .join("\r\n") + "\r\n";
}

export function encodeSdpEnvelope(type, sdp, peerAddress = "") {
  if (!type || !sdp) {
    throw new Error("type e sdp são obrigatórios");
  }
  const compact = cleanSdp(sdp);
  const envelope = {
    v: 1,
    t: type === "offer" ? "O" : "A",
    s: compact,
    p: peerAddress || "",
  };
  return JSON.stringify(envelope);
}

export function decodeSdpEnvelope(envelopeStr) {
  if (!envelopeStr || typeof envelopeStr !== "string") {
    return { valid: false, error: "Envelope vazio ou inválido" };
  }
  try {
    const parsed = JSON.parse(envelopeStr);
    if (parsed.v !== 1 || !parsed.t || !parsed.s) {
      return { valid: false, error: "Formato de envelope incompatível" };
    }
    const type = parsed.t === "O" ? "offer" : "answer";
    return {
      valid: true,
      type,
      sdp: parsed.s,
      peerAddress: parsed.p || "",
    };
  } catch {
    return { valid: false, error: "Falha ao decodificar JSON do envelope SDP" };
  }
}

export function createAirgapOffer(pc, peerAddress = "") {
  if (!pc || typeof pc.createOffer !== "function") {
    return Promise.reject(new Error("RTCPeerConnection válido é mandatário"));
  }
  const dc = pc.createDataChannel(AIRGAP_CHANNEL_NAME);
  return pc
    .createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => waitForIceComplete(pc))
    .then(() => {
      const sdp = pc.localDescription.sdp;
      const envelope = encodeSdpEnvelope("offer", sdp, peerAddress);
      return { envelope, dataChannel: dc };
    });
}

export function createAirgapAnswer(pc, offerEnvelopeStr, peerAddress = "") {
  const decoded = decodeSdpEnvelope(offerEnvelopeStr);
  if (!decoded.valid || decoded.type !== "offer") {
    return Promise.reject(new Error(decoded.error || "Oferta inválida"));
  }

  const rtcDesc = { type: "offer", sdp: decoded.sdp };
  return pc
    .setRemoteDescription(rtcDesc)
    .then(() => pc.createAnswer())
    .then((answer) => pc.setLocalDescription(answer))
    .then(() => waitForIceComplete(pc))
    .then(() => {
      const sdp = pc.localDescription.sdp;
      const envelope = encodeSdpEnvelope("answer", sdp, peerAddress);
      return { envelope, offerPeerAddress: decoded.peerAddress };
    });
}

export function completeAirgapHandshake(pc, answerEnvelopeStr) {
  const decoded = decodeSdpEnvelope(answerEnvelopeStr);
  if (!decoded.valid || decoded.type !== "answer") {
    return Promise.reject(new Error(decoded.error || "Resposta inválida"));
  }
  const rtcDesc = { type: "answer", sdp: decoded.sdp };
  return pc.setRemoteDescription(rtcDesc).then(() => {
    return { success: true, answerPeerAddress: decoded.peerAddress };
  });
}

function waitForIceComplete(pc, timeoutMs = 1200) {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timer = null;
    const checkState = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };
    const onTimeout = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (typeof pc.removeEventListener === "function") {
        pc.removeEventListener("icegatheringstatechange", checkState);
      }
    };
    timer = setTimeout(onTimeout, timeoutMs);
    if (typeof pc.addEventListener === "function") {
      pc.addEventListener("icegatheringstatechange", checkState);
    }
  });
}
