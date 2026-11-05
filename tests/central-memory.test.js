import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "../tests/setup.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as centralMemory from "../client/js/central-memory.js";
import * as profileDirectory from "../client/js/profile-directory.js";

test("central-memory - getCentralMemoryUrls inclui endpoints locais 3920 e 3921", () => {
  localStorage.clear();
  const urls = centralMemory.getCentralMemoryUrls();
  assert.ok(urls.includes("http://127.0.0.1:3920"));
  assert.ok(urls.includes("http://127.0.0.1:3921"));
});

test("central-memory - syncWithCentralMemory envia estado local e reidrata posts, tombstones e perfis", async () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  mockStores.get("local-posts")?.map.clear();

  await cacheNode.saveLocalPost({
    id: "top_local_1",
    type: "topic",
    author: "vx_local",
    communityId: "c_1",
    title: "Post Local",
    body: "Conteúdo local",
    ts: 1700000001000,
  });

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/memory/sync")) {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          status: "ok",
          mode: "zero-central-memory",
          revision: 5,
          counts: { posts: 2, tombstones: 1, profiles: 1, manifests: 0, blobs: 0 },
          posts: [
            ...capturedBody.posts,
            {
              id: "top_remote_hydrated",
              type: "topic",
              author: "vx_remote",
              communityId: "c_1",
              title: "Post Reidratado do Nó Zero-Central-Memory",
              body: "Memória persistida em disco",
              ts: 1700000002000,
            },
          ],
          tombstones: [
            {
              id: "top_deleted_remote",
              type: "tombstone",
              author: "vx_remote",
              ts: 1700000003000,
              editedAt: 1700000003000,
            },
          ],
          profiles: [
            {
              routeId: "vx_remote",
              name: "Peer Persistido",
              bio: "Bio reidratada",
            },
          ],
          manifests: [],
          blobs: [],
        }),
      };
    }
    return { ok: false };
  };

  try {
    let callbackPayload = null;
    const result = await centralMemory.syncWithCentralMemory({
      onHydrated: (info) => {
        callbackPayload = info;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.hydratedCount, 3);
    assert.ok(capturedBody);
    assert.equal(capturedBody.posts.length, 1);
    assert.equal(capturedBody.posts[0].id, "top_local_1");
    assert.ok(callbackPayload);
    assert.equal(callbackPayload.revision, 5);

    const hydratedPost = await cacheNode.getLocalPost("top_remote_hydrated");
    assert.ok(hydratedPost);
    assert.equal(hydratedPost.title, "Post Reidratado do Nó Zero-Central-Memory");

    const hydratedTomb = await cacheNode.getTombstone("top_deleted_remote");
    assert.ok(hydratedTomb);

    const hydratedProfile = profileDirectory.getProfileCard("vx_remote");
    assert.ok(hydratedProfile);
    assert.equal(hydratedProfile.name, "Peer Persistido");
  } finally {
    globalThis.fetch = originalFetch;
    centralMemory.setCentralMemoryAutoPush(false);
  }
});

test("central-memory - autoPush copia novos posts automaticamente para /memory/ingest", async () => {
  localStorage.clear();
  mockStores.get("local-posts")?.map.clear();
  const originalFetch = globalThis.fetch;
  const ingested = [];

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/memory/ingest")) {
      ingested.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({ status: "saved", changed: true, revision: 1 }),
      };
    }
    return { ok: false };
  };

  try {
    centralMemory.setCentralMemoryAutoPush(true);
    await cacheNode.saveLocalPost({
      id: "top_autopush_1",
      type: "topic",
      author: "vx_auto",
      title: "Auto Push",
      body: "Copiado na hora",
      ts: 1700000010000,
    });
    assert.equal(ingested.length, 1);
    assert.equal(ingested[0].type, "GOSSIP");
    assert.equal(ingested[0].item.id, "top_autopush_1");
  } finally {
    centralMemory.setCentralMemoryAutoPush(false);
    globalThis.fetch = originalFetch;
  }
});
