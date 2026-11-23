/**
 * @file Dublês de `RTCPeerConnection`, `RTCDataChannel` e `WebSocket` para os testes de cobertura T7 de WebRTC.
 * Nada abre rede: cada dublê registra o que recebeu para as asserções.
 * @module tests/helpers/cov-t7-rtc-fakes
 */

/** Canal de dados falso: guarda o que foi enviado e se foi fechado. */
export class FakeChannel {
  /** @param {string} label Rótulo do canal (`vox-peer-v0` ou `vox-dm-v0`). */
  constructor(label) {
    this.label = label;
    this.readyState = "connecting";
    this.sent = [];
    this.closed = false;
    this.throwOnSend = false;
  }

  /** @param {string} data Carga enviada. */
  send(data) {
    if (this.throwOnSend) throw new Error("canal quebrado");
    this.sent.push(data);
  }

  /** Fecha o canal. */
  close() {
    this.closed = true;
    this.readyState = "closed";
  }
}

/** Conexão par-a-par falsa com falhas injetáveis em `failOn`. */
export class FakePc {
  /** @type {FakePc[]} */
  static all = [];

  /** @param {object} config Configuração ICE recebida. */
  constructor(config) {
    this.config = config;
    this.signalingState = "stable";
    this.remoteDescription = null;
    this.localDescription = null;
    this.channels = [];
    this.added = [];
    this.closed = false;
    this.failOn = new Set();
    FakePc.all.push(this);
  }

  /** @param {string} step Passo que deve lançar. @returns {void} */
  guard(step) {
    if (this.failOn.has(step)) throw new Error(`falha em ${step}`);
  }

  /** @param {string} label Rótulo. @returns {FakeChannel} Canal criado. */
  createDataChannel(label) {
    const ch = new FakeChannel(label);
    this.channels.push(ch);
    return ch;
  }

  /** @returns {Promise<object>} Offer falsa. */
  async createOffer() {
    this.guard("createOffer");
    return { type: "offer", sdp: "offer-sdp" };
  }

  /** @returns {Promise<object>} Answer falsa. */
  async createAnswer() {
    this.guard("createAnswer");
    return { type: "answer", sdp: "answer-sdp" };
  }

  /** @param {object} desc Descrição local. @returns {Promise<void>} */
  async setLocalDescription(desc) {
    this.guard("setLocalDescription");
    this.localDescription = desc;
  }

  /** @param {object} desc Descrição remota. @returns {Promise<void>} */
  async setRemoteDescription(desc) {
    this.guard("setRemoteDescription");
    this.remoteDescription = desc;
  }

  /** @param {object} cand Candidato ICE. @returns {Promise<void>} */
  async addIceCandidate(cand) {
    this.guard("addIceCandidate");
    this.added.push(cand);
  }

  /** Fecha a conexão. */
  close() {
    this.closed = true;
  }
}

/** Descrição de sessão falsa que só copia os campos recebidos. */
export class FakeSessionDescription {
  /** @param {object} init Campos da descrição. */
  constructor(init) {
    Object.assign(this, init);
  }
}

/** WebSocket falso com as constantes de estado da plataforma. */
export class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  /** @type {FakeWebSocket[]} */
  static all = [];

  /** @param {string} url URL pedida. */
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.all.push(this);
  }

  /** @param {string} data Carga enviada. */
  send(data) {
    this.sent.push(JSON.parse(data));
  }

  /** Fecha o socket sem disparar `onclose` (o teste dispara quando quer). */
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Simula a abertura do socket. */
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

/**
 * Instala os dublês em `globalThis` e devolve a função que restaura os originais.
 * @returns {() => void} Restaura `RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate` e `WebSocket`.
 */
export function installRtcGlobals() {
  const keys = ["RTCPeerConnection", "RTCSessionDescription", "RTCIceCandidate", "WebSocket"];
  const saved = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  FakePc.all = [];
  FakeWebSocket.all = [];
  globalThis.RTCPeerConnection = FakePc;
  globalThis.RTCSessionDescription = FakeSessionDescription;
  globalThis.RTCIceCandidate = FakeSessionDescription;
  globalThis.WebSocket = FakeWebSocket;
  return () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete globalThis[k];
      else globalThis[k] = saved[k];
    }
  };
}
