import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

// Mock de DOM
function createContainer() {
  return {
    innerHTML: "",
  };
}

globalThis.document = {
  getElementById: (id) => {
    return { id, innerHTML: "", appendChild() {} };
  },
};

const render = await import("../client/js/render.js");

test("render - renderPactModal injeta o modal com termos e botoes", () => {
  const container = createContainer();
  render.renderPactModal(container);

  assert.ok(container.innerHTML.includes("Pacto Vox: Rede Distribuída"));
  assert.ok(container.innerHTML.includes("btn-pact-accept"));
  assert.ok(container.innerHTML.includes("btn-pact-settings"));
  assert.ok(container.innerHTML.includes("Soberania e Autoria Total"));

  render.closePactModal(container);
  assert.equal(container.innerHTML, "");
});

test("render - renderNetworkSettings gera painel completo com WebRTC", () => {
  const main = createContainer();
  const settings = {
    enabled: true,
    maxMb: 25,
    dailyCapMb: 50,
    wifiOnly: true,
    webrtcEnabled: true,
  };
  const metrics = { blobsServed: 10, blobsServedRtc: 4, bytesServed: 50000 };
  const cacheStats = { count: 12, sizeKb: "120.5" };
  const relayStatus = { online: true, data: { cachedCount: 5 } };
  const dailyUsage = { bytesServedToday: 10 * 1024 * 1024 };
  const rtcStatus = { remotePeersConnected: 3 };

  render.renderNetworkSettings(main, {
    settings,
    metrics,
    cacheStats,
    relayStatus,
    dailyUsage,
    notifPermission: "granted",
    rtcStatus,
    customSignalingUrl: "ws://192.168.1.100:3921",
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Rede Distribuída (Pacto Vox)"));
  assert.ok(html.includes("WebRTC: 3 pares remotos"));
  assert.ok(html.includes("Relay Online (127.0.0.1:3920)"));
  assert.ok(html.includes("4 RTC"));
  assert.ok(html.includes("net-pause"));
  assert.ok(html.includes("net-webrtc"));
  assert.ok(html.includes("ws://192.168.1.100:3921"));
});

test("render - renderHome renderiza cards de comunidade", () => {
  const main = createContainer();
  const items = [
    { id: "c1", title: "Tecnologia Livre", description: "Descricao 1", category: "Tech" },
    { id: "c2", title: "Cultura Brasileira", description: "Descricao 2", category: "Cultura" },
  ];

  render.renderHome(main, items);
  const html = main.innerHTML;

  assert.ok(html.includes("Tecnologia Livre"));
  assert.ok(html.includes("Cultura Brasileira"));
  assert.ok(html.includes("#/c/c1"));
  assert.ok(html.includes("#/c/c2"));
});
