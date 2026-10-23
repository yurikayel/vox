import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "../tests/setup.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/local-account.js";
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

test("peers - commOnly restringe BLOB às comunidades do usuário (membro)", async () => {
  localStorage.clear();
  mockStores.clear();
  const account = await localAccount.ensureLocalAccount();

  await cacheNode.saveLocalPost({
    id: "mem_minha_comunidade",
    type: "membership",
    communityId: "minha-comunidade",
    author: account.routeId,
    ts: Date.now(),
  });

  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false, commOnly: true });
  globalThis.navigator.connection = { type: "wifi", saveData: false };

  await cacheNode.setCachedTx("tx_dentro", { communityId: "minha-comunidade", body: "ok" });
  await cacheNode.setCachedTx("tx_fora", { communityId: "outra-comunidade", body: "nope" });

  let inside = null;
  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_dentro", fromPeer: "outro_peer" },
    (payload) => {
      inside = payload;
    }
  );
  assert.ok(inside);
  assert.equal(inside.txId, "tx_dentro");

  let outside = null;
  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_fora", fromPeer: "outro_peer" },
    (payload) => {
      outside = payload;
    }
  );
  assert.equal(outside, null);
});

test("peers - commOnly inclui TX de comunidade que o usuário possui", async () => {
  localStorage.clear();
  mockStores.clear();
  const account = await localAccount.ensureLocalAccount();

  await cacheNode.saveLocalPost({
    id: "comm_owned",
    type: "community",
    communityId: "feira-local",
    title: "Feira",
    author: account.routeId,
    ts: Date.now(),
  });

  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false, commOnly: true });
  await cacheNode.setCachedTx("tx_feira", { title: "Anúncio", body: "vendo" });
  await cacheNode.saveLocalPost({
    id: "tx_feira",
    type: "topic",
    communityId: "feira-local",
    title: "Anúncio",
    body: "vendo",
    author: account.routeId,
    ts: Date.now(),
  });

  let served = null;
  await peers.handleVoxMessage(
    { type: "WANT", txId: "tx_feira", fromPeer: "outro_peer" },
    (payload) => {
      served = payload;
    }
  );
  assert.ok(served);
  assert.equal(served.data.body, "vendo");
});
