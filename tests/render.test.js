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
    customTurn: { urls: "turn:turn.comunidade.org:3478", username: "vox_turn", credential: "123" },
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Rede Distribuída (Pacto Vox)"));
  assert.ok(html.includes("WebRTC: 3 pares remotos"));
  assert.ok(html.includes("Relay Online (127.0.0.1:3920)"));
  assert.ok(html.includes("4 RTC"));
  assert.ok(html.includes("net-pause"));
  assert.ok(html.includes("net-webrtc"));
  assert.ok(html.includes("ws://192.168.1.100:3921"));
  assert.ok(html.includes("turn:turn.comunidade.org:3478"));
  assert.ok(html.includes("vox_turn"));
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

test("render - renderDmList e renderDmThread", () => {
  const mainList = createContainer();
  const convs = [
    { peerAddress: "addr_bob", lastText: "E aí Alice", lastTs: Date.now() },
  ];
  render.renderDmList(mainList, convs, "addr_alice");
  assert.ok(mainList.innerHTML.includes("Mensagens"));
  assert.ok(mainList.innerHTML.includes("Privadas. Só neste aparelho."));
  assert.ok(mainList.innerHTML.includes("addr_bob"));
  assert.ok(mainList.innerHTML.includes("E aí Alice"));

  const mainThread = createContainer();
  const msgs = [
    { id: "1", from: "addr_alice", text: "Oi Bob", ts: Date.now(), status: "delivered" },
    { id: "2", from: "addr_bob", text: "Oi Alice!", ts: Date.now(), status: "received" },
  ];
  render.renderDmThread(mainThread, "addr_bob", msgs, "addr_alice", {
    isRtcOnline: true,
    hasDmPub: true,
  });
  assert.ok(mainThread.innerHTML.includes("WebRTC Online"));
  assert.ok(mainThread.innerHTML.includes("Oi Bob"));
  assert.ok(mainThread.innerHTML.includes("Oi Alice!"));
  assert.ok(mainThread.innerHTML.includes("btn-send-dm"));
});

test("render - renderFeed renderiza timeline com posts", () => {
  const main = createContainer();
  const topics = [
    { id: "t1", title: "Primeiro post", body: "Conteudo do post", owner: "addr_autor", communityId: "geral" },
  ];
  render.renderFeed(main, topics);
  assert.ok(main.innerHTML.includes("A Rua"));
  assert.ok(main.innerHTML.includes("Primeiro post"));
  assert.ok(main.innerHTML.includes("Conteudo do post"));
  assert.ok(main.innerHTML.includes("c/geral"));
});

test("render - renderNetworkChip status e rotulagem", () => {
  const chipActive = render.renderNetworkChip({ blobsServed: 5 }, { remotePeersConnected: 2 }, { enabled: true });
  assert.ok(chipActive.includes("2 aparelhos"));
  assert.ok(chipActive.includes("network-chip active"));

  const chipPaused = render.renderNetworkChip({}, {}, { enabled: false });
  assert.ok(chipPaused.includes("Só leitura"));
  assert.ok(chipPaused.includes("network-chip paused"));
});

test("render - renderProfile com handle e renderHandleConflict", () => {
  const mainProf = createContainer();
  render.renderProfile(mainProf, "addr_maria", [], true, "", {
    handle: "maria",
    isConflict: true,
    claimants: [{ owner: "addr_maria" }, { owner: "addr_outra_maria" }],
  });
  assert.ok(mainProf.innerHTML.includes("@maria"));
  assert.ok(mainProf.innerHTML.includes("Conflito de Handle"));
  assert.ok(mainProf.innerHTML.includes("form-claim-handle"));

  const mainConf = createContainer();
  render.renderHandleConflict(mainConf, "maria", [
    { owner: "addr_1", txId: "tx_1" },
    { owner: "addr_2", txId: "tx_2" },
  ]);
  assert.ok(mainConf.innerHTML.includes("@maria"));
  assert.ok(mainConf.innerHTML.includes("Ambiguidade"));
  assert.ok(mainConf.innerHTML.includes("addr_1"));
  assert.ok(mainConf.innerHTML.includes("addr_2"));
});
