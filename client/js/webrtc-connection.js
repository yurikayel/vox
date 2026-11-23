/**
 * @file Ciclo de vida `RTCPeerConnection`, ICE e canais de dados.
 * @module webrtc-connection
 */
import {
  recordPeerPathOutcome,
  recordFirstPeerLatency,
} from "./signaling-telemetry.js";
import { sendSignaling } from "./webrtc-signaling-send.js";
import { createRtcConfig } from "./webrtc-signaling-config.js";
import {
  NEGOTIATION_TIMEOUT_MS,
  peerConnections,
  peerTransport,
  turn,
  getCurrentPeerId,
  getSessionStartedAt,
  getRecordedFirstPeer,
  setRecordedFirstPeer,
  getMessageHandler,
  getDmMessageHandler,
  getPeerConnectHandler,
  setTurnReconnectPeer,
} from "./webrtc-peer-state.js";
import { sendVoxMessage } from "./webrtc-messaging.js";

/**
 * Diz se a conexão é a ativa do par.
 * @param {string} remotePeerId Par remoto
 * @param {RTCPeerConnection} pc Conexão
 * @returns {boolean} `true` se for a ativa.
 */
function isActivePc(remotePeerId, pc) {
  return peerConnections.get(remotePeerId)?.pc === pc;
}

/**
 * Fecha a conexão só se ainda for a ativa do par.
 * @param {string} remotePeerId Par remoto
 * @param {RTCPeerConnection} pc Conexão
 * @param {boolean} [skipFailureRecord=false] Se não registra a falha
 */
function closeIfSameConnection(remotePeerId, pc, skipFailureRecord = false) {
  if (isActivePc(remotePeerId, pc)) {
    closePeerConnection(remotePeerId, skipFailureRecord);
  }
}

/**
 * Agenda o prazo de negociação da conexão.
 * @param {string} remotePeerId Par remoto
 * @param {RTCPeerConnection} pc Conexão
 * @returns {number} Identificador do temporizador.
 */
function startNegotiationTimer(remotePeerId, pc) {
  return setTimeout(() => {
    const entry = peerConnections.get(remotePeerId);
    if (!entry || entry.pc !== pc) return;
    const isReady = Boolean(entry.dc && entry.dc.readyState === "open");
    if (!isReady) {
      closePeerConnection(remotePeerId);
    }
  }, NEGOTIATION_TIMEOUT_MS);
}

/**
 * Marca o par como conectado e cancela o prazo de negociação.
 * @param {string} remotePeerId Par remoto
 */
function markPeerConnected(remotePeerId) {
  const entry = peerConnections.get(remotePeerId);
  if (!entry) return;
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  if (entry.outcomeRecorded) return;
  entry.outcomeRecorded = true;
  const now = Date.now();
  recordPeerPathOutcome(entry.transport, { ok: true, durationMs: now - entry.startedAt }, undefined, now);
  if (!getRecordedFirstPeer() && getSessionStartedAt() > 0) {
    setRecordedFirstPeer(true);
    recordFirstPeerLatency(now - getSessionStartedAt(), undefined, now);
  }
}

/**
 * Liga os eventos do canal de dados do par.
 * @param {RTCDataChannel} dc Canal de dados
 * @param {string} remotePeerId Par remoto
 * @param {RTCPeerConnection} pc Conexão
 */
function setupDataChannelEvents(dc, remotePeerId, pc) {
  dc.onopen = () => {
    if (peerConnections.get(remotePeerId)?.pc !== pc) return;
    markPeerConnected(remotePeerId);
    const handler = getPeerConnectHandler();
    if (typeof handler === "function") {
      handler(remotePeerId, (obj) => sendVoxMessage(remotePeerId, obj));
    }
  };
  dc.onmessage = (event) => {
    const messageHandler = getMessageHandler();
    if (!messageHandler || peerConnections.get(remotePeerId)?.pc !== pc) return;
    try {
      const parsed = JSON.parse(event.data);
      messageHandler(parsed, (replyObj) => {
        sendVoxMessage(remotePeerId, replyObj);
      }, "rtc");
    } catch {}
  };

  dc.onclose = () => closeIfSameConnection(remotePeerId, pc);
  dc.onerror = () => closeIfSameConnection(remotePeerId, pc);
}

/**
 * Liga os eventos do canal de mensagens diretas do par.
 * @param {RTCDataChannel} dmDc Canal de DM
 * @param {string} remotePeerId Par remoto
 * @param {RTCPeerConnection} pc Conexão
 */
function setupDmChannelEvents(dmDc, remotePeerId, pc) {
  dmDc.onmessage = (event) => {
    const dmMessageHandler = getDmMessageHandler();
    if (!dmMessageHandler || peerConnections.get(remotePeerId)?.pc !== pc) return;
    try {
      const parsed = JSON.parse(event.data);
      if (parsed?.type === "DM" && parsed.envelope) {
        dmMessageHandler(parsed.envelope, remotePeerId);
      }
    } catch {}
  };
}

/**
 * Cria os canais de dados de quem inicia a conexão.
 * @param {RTCPeerConnection} pc Conexão
 * @param {string} remotePeerId Par remoto
 */
function initInitiatorChannels(pc, remotePeerId) {
  const dc = pc.createDataChannel("vox-peer-v0");
  setupDataChannelEvents(dc, remotePeerId, pc);
  const dmDc = pc.createDataChannel("vox-dm-v0");
  setupDmChannelEvents(dmDc, remotePeerId, pc);
  return { dc, dmDc };
}

/**
 * Liga o recebimento dos canais criados pelo outro lado.
 * @param {RTCPeerConnection} pc Conexão
 * @param {string} remotePeerId Par remoto
 */
function bindPeerDataChannelListener(pc, remotePeerId) {
  pc.ondatachannel = (event) => {
    const entry = peerConnections.get(remotePeerId);
    if (!entry || entry.pc !== pc) return;
    const ch = event.channel;
    if (ch.label === "vox-dm-v0") {
      setupDmChannelEvents(ch, remotePeerId, pc);
      entry.dmDc = ch;
    } else {
      setupDataChannelEvents(ch, remotePeerId, pc);
      entry.dc = ch;
    }
  };
}

/**
 * Negocia a oferta de quem inicia a conexão.
 * @param {object} entry Entrada da conexão
 * @returns {Promise<void>} Conclui após enviar a oferta.
 */
async function negotiateInitiatorOffer(entry) {
  const { pc, remotePeerId } = entry;
  entry.makingOffer = true;
  try {
    const offer = await pc.createOffer();
    if (peerConnections.get(remotePeerId)?.pc !== pc) return;
    await pc.setLocalDescription(offer);
    if (peerConnections.get(remotePeerId)?.pc !== pc) return;
    sendSignaling({ type: "offer", to: remotePeerId, sdp: pc.localDescription });
  } catch {
    closeIfSameConnection(remotePeerId, pc);
  } finally {
    entry.makingOffer = false;
  }
}

/**
 * Diz se a URL é de servidor TURN.
 * @param {string} u URL
 * @returns {boolean} `true` se for TURN.
 */
const isTurnUrl = (u) => /^turns?:/i.test(String(u));

/**
 * Liga os eventos de estado da conexão e dos candidatos ICE.
 * @param {RTCPeerConnection} pc Conexão
 * @param {string} remotePeerId Par remoto
 */
function attachPeerConnectionEvents(pc, remotePeerId) {
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "failed" || state === "closed" || state === "disconnected") {
      const hadTurn = Boolean(peerConnections.get(remotePeerId)?.withTurn);
      closeIfSameConnection(remotePeerId, pc);
      if (state === "failed") void turn.onFailed(remotePeerId, hadTurn);
    }
  };
  pc.onicecandidate = (event) => {
    if (event.candidate && peerConnections.get(remotePeerId)?.pc === pc) {
      sendSignaling({ type: "ice", to: remotePeerId, candidate: event.candidate });
    }
  };
}

/**
 * Abre ou reutiliza conexão WebRTC com um par (uso interno da sinalização).
 * @param {string} remotePeerId Id do par na malha.
 * @param {boolean} isInitiator Verdadeiro se este lado cria offer e canais.
 * @returns {Promise<object>} Entrada guardada em `peerConnections`.
 */
export async function createPeerConnection(remotePeerId, isInitiator) {
  if (peerConnections.has(remotePeerId)) return peerConnections.get(remotePeerId);

  const rtcConfig = createRtcConfig();
  const pc = new RTCPeerConnection(rtcConfig);
  attachPeerConnectionEvents(pc, remotePeerId);

  const { dc, dmDc } = isInitiator
    ? initInitiatorChannels(pc, remotePeerId)
    : (bindPeerDataChannelListener(pc, remotePeerId), { dc: null, dmDc: null });

  const entry = {
    remotePeerId,
    pc,
    dc,
    dmDc,
    timeoutId: startNegotiationTimer(remotePeerId, pc),
    startedAt: Date.now(),
    transport: peerTransport.get(remotePeerId) || "ws",
    outcomeRecorded: false,
    makingOffer: false,
    pendingIceCandidates: [],
    withTurn: rtcConfig.iceServers.some((s) => [].concat(s.urls).some(isTurnUrl)),
  };
  peerConnections.set(remotePeerId, entry);

  if (isInitiator) {
    await negotiateInitiatorOffer(entry);
  }
  return entry;
}

/**
 * Aplica os candidatos ICE que chegaram antes da descrição remota.
 * @param {object} entry Entrada da conexão
 * @returns {Promise<void>} Conclui após aplicar.
 */
async function flushPendingIceCandidates(entry) {
  const pending = entry.pendingIceCandidates;
  if (!pending?.length) return;
  entry.pendingIceCandidates = [];
  for (const candidate of pending) {
    if (!isActivePc(entry.remotePeerId, entry.pc)) return;
    try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }
}

/**
 * Aplica a descrição remota e os candidatos ICE pendentes.
 * @param {object} entry Entrada da conexão
 * @param {string} remotePeerId Par remoto
 * @param {object} sdp Descrição remota
 * @returns {Promise<boolean>} `true` se a conexão continua ativa.
 */
async function applyRemoteDescription(entry, remotePeerId, sdp) {
  await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  if (!isActivePc(remotePeerId, entry.pc)) return false;
  await flushPendingIceCandidates(entry);
  return isActivePc(remotePeerId, entry.pc);
}

/**
 * Responde a uma oferta com uma resposta.
 * @param {object} entry Entrada da conexão
 * @param {string} fromPeer Par que ofereceu
 * @param {object} sdp Oferta recebida
 * @returns {Promise<void>} Conclui após enviar a resposta.
 */
async function respondWithAnswer(entry, fromPeer, sdp) {
  const { pc } = entry;
  const ready = await applyRemoteDescription(entry, fromPeer, sdp);
  if (!ready) return;
  const answer = await pc.createAnswer();
  if (!isActivePc(fromPeer, pc)) return;
  await pc.setLocalDescription(answer);
  if (!isActivePc(fromPeer, pc)) return;
  sendSignaling({ type: "answer", to: fromPeer, sdp: pc.localDescription });
}

/**
 * Diz se há colisão de ofertas com a conexão existente.
 * @param {object|undefined} existing Entrada existente
 * @returns {boolean} `true` se há colisão.
 */
function hasOfferCollision(existing) {
  return Boolean(existing?.pc && (existing.makingOffer || existing.pc.signalingState !== "stable"));
}

/**
 * Processa oferta SDP recebida via sinalização.
 * @param {string} fromPeer
 * @param {object} sdp
 */
export async function handleIncomingOffer(fromPeer, sdp) {
  const currentPeerId = getCurrentPeerId();
  if (!fromPeer || fromPeer === currentPeerId) return;
  const existing = peerConnections.get(fromPeer);
  if (hasOfferCollision(existing) && currentPeerId < fromPeer) return;
  if (existing) closePeerConnection(fromPeer, true);

  const entry = await createPeerConnection(fromPeer, false);
  try {
    await respondWithAnswer(entry, fromPeer, sdp);
  } catch {
    closeIfSameConnection(fromPeer, entry.pc);
  }
}

/**
 * Processa resposta SDP recebida via sinalização.
 * @param {string} fromPeer
 * @param {object} sdp
 */
export async function handleIncomingAnswer(fromPeer, sdp) {
  const entry = peerConnections.get(fromPeer);
  if (!entry) return;
  try {
    await applyRemoteDescription(entry, fromPeer, sdp);
  } catch {
    closeIfSameConnection(fromPeer, entry.pc);
  }
}

/**
 * Processa candidato ICE recebido via sinalização.
 * @param {string} fromPeer
 * @param {object} candidate
 */
export async function handleIncomingIce(fromPeer, candidate) {
  const entry = peerConnections.get(fromPeer);
  if (!entry || !candidate) return;
  if (!entry.pc.remoteDescription) {
    entry.pendingIceCandidates.push(candidate);
    return;
  }
  try {
    await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {}
}

/**
 * Solta os canais de dados da entrada, tirando os tratadores de eventos.
 * @param {object} entry Entrada da conexão
 */
function disposePeerChannels(entry) {
  if (entry.dc) {
    entry.dc.onopen = null;
    entry.dc.onmessage = null;
    entry.dc.onclose = null;
    entry.dc.onerror = null;
    entry.dc.close();
  }
  if (entry.dmDc) {
    entry.dmDc.onmessage = null;
    entry.dmDc.close();
  }
  if (entry.pc) {
    entry.pc.onicecandidate = null;
    entry.pc.ondatachannel = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.close();
  }
}

/**
 * Fecha a conexão com o par e seus canais.
 * @param {string} remotePeerId
 * @param {boolean} [skipFailureRecord=false]
 */
export function closePeerConnection(remotePeerId, skipFailureRecord = false) {
  const entry = peerConnections.get(remotePeerId);
  if (!entry) return;
  if (!skipFailureRecord && !entry.outcomeRecorded) {
    entry.outcomeRecorded = true;
    recordPeerPathOutcome(entry.transport, { ok: false, durationMs: Date.now() - entry.startedAt });
  }
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  try {
    disposePeerChannels(entry);
  } catch {}
  peerConnections.delete(remotePeerId);
}

setTurnReconnectPeer(createPeerConnection);