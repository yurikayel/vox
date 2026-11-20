/**
 * @file Handshake WebRTC air-gapped via envelope SDP em QR (laboratório; sem sinalização central).
 * @module labs/parado/airgap-webrtc
 */

/**
 * Nome do canal de dados usado no pareamento.
 * @type {string}
 */
export const AIRGAP_CHANNEL_NAME = "vox-airgap-v0";

/**
 * Filtra o SDP para linhas essenciais de DataChannel SCTP.
 * @param {string} sdp SDP bruto.
 * @returns {string} SDP compactado ou string vazia.
 */
export function cleanSdp(sdp) {
  if (!sdp || typeof sdp !== "string") return "";
  const keepPrefixes = ["v=", "o=", "s=", "t=", "c=", "m=application", "a=mid:", "a=sctp-port:", "a=max-message-size:", "a=ice-ufrag:", "a=ice-pwd:", "a=fingerprint:", "a=setup:", "a=candidate:"];
  return sdp
    .split(/\r?\n/)
    .filter((line) => keepPrefixes.some((p) => line.startsWith(p)))
    .join("\r\n") + "\r\n";
}

/**
 * Serializa oferta ou resposta SDP num envelope JSON para QR.
 * @param {"offer"|"answer"} type Tipo WebRTC.
 * @param {string} sdp SDP local.
 * @param {string} [peerAddress=""] Endereço Vox opcional do par.
 * @returns {string} JSON do envelope.
 * @throws {Error} Quando faltam type ou sdp.
 */
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

/**
 * Desserializa envelope SDP; falhas retornam `{ valid: false, error }`.
 * @param {string} envelopeStr JSON do envelope.
 * @returns {{valid: boolean, error?: string, type?: string, sdp?: string, peerAddress?: string}}
 */
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

/**
 * Cria oferta local, espera ICE e devolve envelope para QR.
 * @param {RTCPeerConnection} pc Conexão peer.
 * @param {string} [peerAddress=""] Endereço local opcional no envelope.
 * @returns {Promise<{envelope: string, dataChannel: RTCDataChannel}>}
 */
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

/**
 * Aplica oferta do QR, gera resposta e devolve envelope da resposta.
 * @param {RTCPeerConnection} pc Conexão peer.
 * @param {string} offerEnvelopeStr JSON da oferta.
 * @param {string} [peerAddress=""] Endereço local opcional.
 * @returns {Promise<{envelope: string, offerPeerAddress: string}>}
 */
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

/**
 * Aplica resposta do QR e fecha o handshake.
 * @param {RTCPeerConnection} pc Conexão peer.
 * @param {string} answerEnvelopeStr JSON da resposta.
 * @returns {Promise<{success: boolean, answerPeerAddress: string}>}
 */
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