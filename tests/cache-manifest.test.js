import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as manifest from "../client/js/cache-manifest.js";

const SAMPLE_TX = "A".repeat(43);

test("cache-manifest - buildCacheManifestTags inclui Type e Community-Id", () => {
  const tags = manifest.buildCacheManifestTags({
    communityId: "demo-aprenda-vox",
    ownerAddr: "ar_addr_test",
    pinsRoot: "abc123",
  });
  assert.equal(tags.find((t) => t.name === "Type")?.value, manifest.CACHE_MANIFEST_TYPE);
  assert.equal(tags.find((t) => t.name === "Community-Id")?.value, "demo-aprenda-vox");
  assert.equal(tags.find((t) => t.name === "Manifest-Version")?.value, "0");
  assert.equal(tags.find((t) => t.name === "Pins-Root")?.value, "abc123");
});

test("cache-manifest - validateManifestBody rejeita pins inválidos", () => {
  const empty = manifest.validateManifestBody({ communityId: "c1", pins: [] });
  assert.equal(empty.valid, false);

  const badId = manifest.validateManifestBody({
    communityId: "c1",
    pins: [{ txId: "curto", role: "topic" }],
  });
  assert.equal(badId.valid, false);

  const dup = manifest.validateManifestBody({
    communityId: "c1",
    pins: [
      { txId: SAMPLE_TX, role: "topic" },
      { txId: SAMPLE_TX, role: "blob" },
    ],
  });
  assert.equal(dup.valid, false);

  const ok = manifest.validateManifestBody({
    communityId: "c1",
    pins: [{ txId: SAMPLE_TX, role: "community" }],
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.manifest.pins.length, 1);
});

test("cache-manifest - pinsRootSha256 independe da ordem de entrada", async () => {
  const pinsA = [
    { txId: "B".repeat(43), role: "topic" },
    { txId: "C".repeat(43), role: "blob" },
  ];
  const pinsB = [...pinsA].reverse();
  const h1 = await manifest.pinsRootSha256(pinsA);
  const h2 = await manifest.pinsRootSha256(pinsB);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test("cache-manifest - extractCacheManifestMeta faz parse das tags", () => {
  const tags = manifest.buildCacheManifestTags({
    communityId: "brasil-livre",
    previousManifestTx: SAMPLE_TX,
  });
  const meta = manifest.extractCacheManifestMeta(tags);
  assert.equal(meta.type, manifest.CACHE_MANIFEST_TYPE);
  assert.equal(meta.communityId, "brasil-livre");
  assert.equal(meta.manifestVersion, 0);
  assert.equal(meta.previousManifest, SAMPLE_TX);
  assert.equal(meta.appName, "vox-brasil");
});
