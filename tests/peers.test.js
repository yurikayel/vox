import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cacheNode from "../client/js/cache-node.js";
import * as peers from "../client/js/peers.js";

test("peers - configurações default-on do Pacto Vox (Fase 3.1/3.2)", () => {
  localStorage.clear();
  const settings = peers.getPeerSettings();

  assert.equal(settings.enabled, true, "Nó deve ser ativo por padrão");
  assert.equal(settings.dailyCapMb, 50, "Teto diário deve ser 50 MB");
  assert.equal(settings.wifiOnly, true, "Deve priorizar Wi-Fi");
  assert.equal(settings.webrtcEnabled, true, "WebRTC deve ser ativo por padrão");
  assert.equal(settings.maxMb, 25, "Limite de cache padrão deve ser 25 MB");
});

test("peers - persistência de configurações customizadas e opt-out", () => {
  localStorage.clear();
  peers.savePeerSettings({
    enabled: false,
    maxMb: 100,
    wifiOnly: false,
    commOnly: true,
    backgroundRelay: true,
    dailyCapMb: 120,
    webrtcEnabled: false,
  });

  const updated = peers.getPeerSettings();
  assert.equal(updated.enabled, false);
  assert.equal(updated.maxMb, 100);
  assert.equal(updated.wifiOnly, false);
  assert.equal(updated.dailyCapMb, 120);
  assert.equal(updated.webrtcEnabled, false);
});

test("peers - detecção de rede wifi vs celular/saveData", () => {
  globalThis.navigator.connection = { type: "wifi", saveData: false };
  assert.equal(peers.isWifiOrUnlimited(), true);

  globalThis.navigator.connection = { type: "cellular", saveData: false };
  assert.equal(peers.isWifiOrUnlimited(), false);

  globalThis.navigator.connection = { type: "wifi", saveData: true };
  assert.equal(peers.isWifiOrUnlimited(), false);

  delete globalThis.navigator.connection;
  assert.equal(peers.isWifiOrUnlimited(), true);
});

test("peers - medição de consumo diário e verificação de teto", () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, dailyCapMb: 1 });

  assert.equal(peers.isDailyCapReached(), false);

  peers.recordBytesServed(500 * 1024);
  assert.equal(peers.isDailyCapReached(), false);

  peers.recordBytesServed(600 * 1024);
  assert.equal(peers.isDailyCapReached(), true);
});

test("peers - handleVoxMessage responde a WANT com BLOB se houver cache", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false });
  globalThis.navigator.connection = { type: "wifi", saveData: false };

  await cacheNode.setCachedTx("tx_alfa", { title: "Alfa", body: "Conteudo Alfa" });

  let sentPayload = null;
  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_alfa", fromPeer: "outro_peer" },
    (payload) => {
      sentPayload = payload;
    },
    "rtc"
  );

  assert.ok(sentPayload);
  assert.equal(sentPayload.type, "BLOB");
  assert.equal(sentPayload.txId, "tx_alfa");
  assert.deepEqual(sentPayload.data, { title: "Alfa", body: "Conteudo Alfa" });

  const metrics = peers.getPeerMetrics();
  assert.ok(metrics.blobsServed >= 1);
  assert.ok(metrics.blobsServedRtc >= 1);
  assert.ok(metrics.bytesServed > 0);
});

test("peers - handleVoxMessage não responde se o nó estiver pausado ou atingir teto", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: false, dailyCapMb: 50 });
  await cacheNode.setCachedTx("tx_beta", { body: "Beta" });

  let replied = false;
  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_beta", fromPeer: "outro_peer" },
    () => {
      replied = true;
    }
  );
  assert.equal(replied, false);

  peers.savePeerSettings({ enabled: true, dailyCapMb: 1 });
  peers.recordBytesServed(2 * 1024 * 1024);

  replied = false;
  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_beta", fromPeer: "outro_peer" },
    () => {
      replied = true;
    }
  );
  assert.equal(replied, false);
});

test("peers - fetchFromDesktopRelay usa relay HTTP configurável", async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify({ body: "via relay", title: "T" }),
    };
  };

  try {
    localStorage.setItem("vox-relay-http-url", "http://10.0.0.5:3920");
    const data = await peers.fetchFromDesktopRelay("tx_remote");
    assert.equal(requestedUrl, "http://10.0.0.5:3920/tx/tx_remote");
    assert.equal(data.body, "via relay");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("peers - fetchFromDesktopRelay faz failover para o buddy relay quando o primário falha", async () => {
  localStorage.clear();
  localStorage.setItem("vox-relay-http-url", "http://10.0.0.5:3920");
  localStorage.setItem("vox-relay-buddy-http-url", "https://buddy.vox.hf.space");

  const originalFetch = globalThis.fetch;
  const queriedUrls = [];

  globalThis.fetch = async (url) => {
    queriedUrls.push(url);
    if (url.includes("10.0.0.5")) {
      throw new Error("Timeout/Connection refused");
    }
    if (url.includes("buddy.vox.hf.space")) {
      return {
        ok: true,
        text: async () => JSON.stringify({ body: "resgatado pelo buddy", title: "Buddy Title" }),
      };
    }
    return { ok: false };
  };

  try {
    const data = await peers.fetchFromDesktopRelay("tx_resgate");
    assert.equal(data.body, "resgatado pelo buddy");
    assert.equal(queriedUrls.length, 2);
    assert.ok(queriedUrls[0].includes("10.0.0.5"));
    assert.ok(queriedUrls[1].includes("buddy.vox.hf.space"));
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }
});
