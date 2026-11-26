/**
 * @file RTC e sinalização falsos para testar transportes WebRTC sem rede: tudo entrega por microtarefa (sem timers),
 * e o registro (`log`) deixa provar o que passou por canal de dados e o que passou pela sinalização.
 */

/** Fábrica de canais de dados falsos: cada um entrega ao par por microtarefa e se registra em `log.channels`. */
function channelFactory(log) {
  return (label) => {
    const channel = {
      label,
      readyState: "connecting",
      send(text) {
        if (this.readyState !== "open") throw new Error("canal fechado");
        log.sent.push(text);
        queueMicrotask(() => this.peer?.onmessage?.({ data: text }));
      },
      open() { this.readyState = "open"; this.onopen?.(); },
      close() { if (this.readyState === "closed") return; this.readyState = "closed"; this.onclose?.(); this.peer?.close(); },
    };
    log.channels.push(channel);
    return channel;
  };
}

/** SDP falso com a impressão `a=fingerprint:` que o navegador real põe (hex aleatório por conexão). */
function fakeSdp() {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase());
  return `v=0
a=fingerprint:sha-256 ${hex.join(":")}
`;
}

/**
 * Cria uma "rede" de `RTCPeerConnection` falsas ligadas entre si pela oferta/resposta.
 * @returns {{ createPeerConnection: () => object, log: { labels: string[], sent: string[], channels: object[] }, last: () => object }} Fábrica e registro.
 */
export function createFakeRtcNetwork() {
  const pcs = new Map();
  const log = { labels: [], sent: [], channels: [] };
  let seq = 0;
  let lastPc = null;
  const makeChannel = channelFactory(log);
  const link = (offerer, answerer) => {
    for (const och of offerer.channels) {
      const ch = makeChannel(och.label);
      och.peer = ch;
      ch.peer = och;
      queueMicrotask(() => answerer.ondatachannel?.({ channel: ch }));
    }
  };
  const createPeerConnection = () => {
    const pc = { id: ++seq, channels: [], connectionState: "new" };
    pcs.set(pc.id, pc);
    lastPc = pc;
    pc.createDataChannel = (label) => { const ch = makeChannel(label); pc.channels.push(ch); log.labels.push(label); return ch; };
    pc.sdp = fakeSdp();
    pc.createOffer = async () => ({ type: "offer", pcId: pc.id, sdp: pc.sdp });
    pc.createAnswer = async () => ({ type: "answer", pcId: pc.id, sdp: pc.sdp });
    pc.setLocalDescription = async (desc) => { pc.localDescription = desc; };
    pc.setRemoteDescription = async (desc) => {
      pc.remoteDescription = desc;
      const other = pcs.get(desc.pcId);
      if (desc.type === "offer") link(other, pc);
      else queueMicrotask(() => pc.channels.forEach((ch) => { ch.open(); ch.peer?.open(); }));
    };
    pc.addIceCandidate = async () => {};
    pc.close = () => { pc.connectionState = "closed"; pc.channels.forEach((ch) => ch.close()); };
    return pc;
  };
  return { createPeerConnection, log, last: () => lastPc };
}

/**
 * Cria um hub de sinalização em memória: cada par recebe só o que lhe é endereçado (`to`), com `from` carimbado.
 * @returns {{ connect: (peerId: string) => { send: Function, onMessage: Function }, log: object[] }} Hub e registro das mensagens.
 */
export function createFakeSignalingHub() {
  const peers = new Map();
  const log = [];
  return {
    log,
    connect(peerId) {
      const handlers = new Set();
      peers.set(peerId, handlers);
      return {
        send(data) {
          const msg = { ...data, from: peerId };
          log.push(msg);
          queueMicrotask(() => peers.get(data.to)?.forEach((fn) => fn(msg)));
        },
        onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
      };
    },
  };
}
