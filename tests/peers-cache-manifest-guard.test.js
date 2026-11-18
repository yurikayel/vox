import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/identity/local-account.js";
import * as manifest from "../client/js/cache-manifest.js";
import * as mesh from "../client/js/peers-cache-manifest.js";

const SAMPLE_TX = "C".repeat(43);

test("peers-cache-manifest - rejeita formato, assinatura e communityId divergente", async () => {
  localStorage.clear();
  const badShape = await mesh.ingestSignedCacheManifestItem({ id: "x", type: "post" }, () => true);
  assert.equal(badShape.ok, false);
  assert.equal(badShape.reason, "formato");

  const body = manifest.buildManifestBody({
    communityId: "comm-a",
    pins: [{ txId: SAMPLE_TX, role: "topic" }],
  });
  const draft = mesh.buildCacheManifestGossipDraft({ communityId: "comm-a", manifest: body });
  const signed = await localAccount.signPayload(draft);

  const noSig = await mesh.ingestSignedCacheManifestItem(signed, async () => false);
  assert.equal(noSig.ok, false);
  assert.equal(noSig.reason, "sig");

  const mismatch = await mesh.ingestSignedCacheManifestItem(
    { ...signed, communityId: "comm-b", manifest: { ...body, communityId: "comm-a", pins: body.pins } },
    async () => true
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "communityId");
});

test("peers-cache-manifest - manifesto mais antigo é ignorado sem sobrescrever", async () => {
  localStorage.clear();
  const comm = "rede-teste";
  const newerBody = manifest.buildManifestBody({
    communityId: comm,
    pins: [{ txId: SAMPLE_TX, role: "post" }],
    issuedAt: 5000,
  });
  const newer = await localAccount.signPayload(mesh.buildCacheManifestGossipDraft({ communityId: comm, manifest: newerBody }));
  assert.equal((await mesh.ingestSignedCacheManifestItem(newer, localAccount.verifyPayload)).skipped, false);

  const olderBody = manifest.buildManifestBody({
    communityId: comm,
    pins: [{ txId: "D".repeat(43), role: "blob" }],
    issuedAt: 1000,
  });
  const older = await localAccount.signPayload(mesh.buildCacheManifestGossipDraft({ communityId: comm, manifest: olderBody }));
  const skip = await mesh.ingestSignedCacheManifestItem(older, localAccount.verifyPayload);
  assert.equal(skip.ok, true);
  assert.equal(skip.skipped, true);
  assert.equal(mesh.getLatestManifestForCommunity(comm).manifest.pins[0].txId, SAMPLE_TX);
});

test("peers-cache-manifest - listKnownManifests e prioridade acumulam pins válidos", async () => {
  localStorage.clear();
  const tx2 = "E".repeat(43);
  for (const [comm, tx] of [
    ["c1", SAMPLE_TX],
    ["c2", tx2],
  ]) {
    const body = manifest.buildManifestBody({ communityId: comm, pins: [{ txId: tx, role: "index" }] });
    const signed = await localAccount.signPayload(mesh.buildCacheManifestGossipDraft({ communityId: comm, manifest: body }));
    await mesh.ingestSignedCacheManifestItem(signed, localAccount.verifyPayload);
  }
  assert.equal(mesh.listKnownManifests().length, 2);
  const pins = mesh.collectPriorityPinTxIds();
  assert.equal(pins.has(SAMPLE_TX), true);
  assert.equal(pins.has(tx2), true);
});