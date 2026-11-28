/** @file Regressão: sockets de sinalização empilhados e listener `message` do lab Open Frames. */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { drainMicrotasks } from "./helpers/wait-until.js";
import * as webrtcPeer from "../client/js/webrtc-peer.js";
import * as openFramesHost from "../client/js/open-frames-host.js";

class FakeWs {
  static all = [];
  static CONNECTING = 0;
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    FakeWs.all.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}

const CONFIG = { signalingUrls: ["ws://sinal.test"], nostrSignaling: { enabled: false }, stun: [], maxRtcPeers: 2 };

async function withFakeWebSocket(fn) {
  const saved = { ws: globalThis.WebSocket, fetch: globalThis.fetch, env: process.env.NODE_ENV, rtc: globalThis.RTCPeerConnection };
  FakeWs.all = [];
  globalThis.WebSocket = FakeWs;
  globalThis.RTCPeerConnection = class {};
  globalThis.fetch = async () => ({ ok: true, json: async () => CONFIG });
  process.env.NODE_ENV = "dev";
  try {
    await fn();
  } finally {
    webrtcPeer.disconnectWebRtc();
    Object.assign(globalThis, { WebSocket: saved.ws, fetch: saved.fetch, RTCPeerConnection: saved.rtc });
    process.env.NODE_ENV = saved.env;
  }
}

test("webrtc - religar com WebRTC ligado não deixa sockets de sinalização vivos além de um", async () => {
  await withFakeWebSocket(async () => {
    for (let i = 0; i < 3; i++) {
      await webrtcPeer.initWebRtc("peer-a");
      await drainMicrotasks(50);
    }
    const vivos = FakeWs.all.filter((w) => w.readyState === 0 || w.readyState === 1);
    assert.equal(vivos.length, 1, `sockets vivos: ${vivos.length} de ${FakeWs.all.length}`);
  });
});

test("webrtc - chamadas simultâneas de initWebRtc abrem um só socket", async () => {
  await withFakeWebSocket(async () => {
    await Promise.all([webrtcPeer.initWebRtc("peer-b"), webrtcPeer.initWebRtc("peer-b")]);
    await drainMicrotasks(50);
    assert.equal(FakeWs.all.filter((w) => w.readyState < 2).length, 1);
  });
});

test("open-frames - o desanexo remove o listener message", () => {
  const listeners = new Set();
  const win = { addEventListener: (_t, f) => listeners.add(f), removeEventListener: (_t, f) => listeners.delete(f) };
  const iframe = { sandbox: "allow-scripts" };
  const detach = openFramesHost.attachOpenFrameHost({}, iframe, { win });
  assert.equal(listeners.size, 1);
  detach();
  assert.equal(listeners.size, 0);
});

test("labs - visitar o lab de frames várias vezes não acumula listeners de message", async () => {
  const listeners = new Map();
  const win = {
    location: { origin: "http://x.test" },
    addEventListener: (t, f) => (listeners.get(t) ?? listeners.set(t, new Set()).get(t)).add(f),
    removeEventListener: (t, f) => listeners.get(t)?.delete(f),
  };
  const host = { appendChild() {} };
  const main = { innerHTML: "", querySelector: (sel) => (sel === "#labs-frame-host" ? host : null) };
  const savedDoc = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {} }) };
  try {
    const labs = await import("../client/js/app/screens-labs.js");
    for (let i = 0; i < 3; i++) labs.mountFramesLab(main, win);
    assert.equal(listeners.get("message").size, 1);
    listeners.get("hashchange").forEach((f) => f());
    assert.equal(listeners.get("message").size, 0);
  } finally {
    globalThis.document = savedDoc;
  }
});
