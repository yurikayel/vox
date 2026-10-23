import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/local-account.js";
import * as manifest from "../client/js/cache-manifest.js";
import * as mesh from "../client/js/peers-cache-manifest.js";
import * as peers from "../client/js/peers.js";

const SAMPLE_TX = "A".repeat(43);

test("peers-cache-manifest - ingest e prioridade WANT por pins", async () => {
  localStorage.clear();
  const body = manifest.buildManifestBody({
    communityId: "demo-aprenda-vox",
    pins: [{ txId: SAMPLE_TX, role: "topic" }],
  });
  const draft = mesh.buildCacheManifestGossipDraft({
    communityId: "demo-aprenda-vox",
    manifest: body,
  });
  const signed = await localAccount.signPayload(draft);

  const first = await mesh.ingestSignedCacheManifestItem(signed, localAccount.verifyPayload);
  assert.equal(first.ok, true);
  assert.equal(first.skipped, false);

  assert.equal(mesh.isManifestPriorityTx(SAMPLE_TX), true);
  assert.equal(mesh.isManifestPriorityTx("B".repeat(43)), false);
  assert.equal(mesh.getLatestManifestForCommunity("demo-aprenda-vox")?.id, signed.id);
});

test("peers - handleVoxMessage CACHE_MANIFEST persiste manifesto", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, dailyCapMb: 50, wifiOnly: false });

  const body = manifest.buildManifestBody({
    communityId: "brasil-livre",
    pins: [
      { txId: SAMPLE_TX, role: "blob" },
      { txId: "B".repeat(43), role: "index" },
    ],
  });
  const signed = await localAccount.signPayload(
    mesh.buildCacheManifestGossipDraft({ communityId: "brasil-livre", manifest: body })
  );

  await peers.handleVoxMessage({ type: "CACHE_MANIFEST", item: signed, fromPeer: "peer_x" });

  const stored = mesh.getLatestManifestForCommunity("brasil-livre");
  assert.ok(stored);
  assert.equal(stored.manifest.pins.length, 2);
  assert.equal(mesh.collectPriorityPinTxIds().has(SAMPLE_TX), true);
});
