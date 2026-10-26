import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mirror from "../client/js/community-mirror.js";

test("community-mirror - buildCommunityMirrorIndex normaliza payload", () => {
  const index = mirror.buildCommunityMirrorIndex(
    { id: "comunidade_livre", title: "Comunidade Livre", description: "Desc", owner: "addr_a" },
    [
      { id: "tx_topic_1", title: "Topico 1", owner: "addr_b" },
      { txId: "tx_topic_2", topicTitle: "Topico 2" },
      { id: "", title: "ignorado" },
    ],
    { mirroredAt: "2026-10-23T12:00:00.000Z" },
  );

  assert.equal(index.communityId, "comunidade_livre");
  assert.equal(index.title, "Comunidade Livre");
  assert.equal(index.description, "Desc");
  assert.equal(index.owner, "addr_a");
  assert.equal(index.mirroredAt, "2026-10-23T12:00:00.000Z");
  assert.equal(index.source, "vox-pwa");
  assert.equal(index.topics.length, 2);
  assert.deepEqual(index.topics[0], { id: "tx_topic_1", title: "Topico 1", owner: "addr_b" });
  assert.equal(index.topics[1].id, "tx_topic_2");
  assert.equal(index.topics[1].title, "Topico 2");
});

test("community-mirror - buildCommunityMirrorIndex exige communityId", () => {
  assert.throws(() => mirror.buildCommunityMirrorIndex({}, []), /communityId obrigatório/);
});

test("community-mirror - validateCommunityMirrorPayload rejeita communityId inválido", () => {
  const res = mirror.validateCommunityMirrorPayload({ communityId: "bad/slug", topics: [] });
  assert.equal(res.valid, false);
  assert.equal(res.code, "mirror.community_id_invalid");
});

test("community-mirror - postCommunityMirrorToRelay usa relay das configurações", async () => {
  localStorage.clear();
  localStorage.setItem("vox-custom-signaling-url", "ws://10.0.0.8:3921");

  const originalFetch = globalThis.fetch;
  let captured = null;

  globalThis.fetch = async (url, options = {}) => {
    captured = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ status: "mirrored", communityId: "comunidade_livre" }),
    };
  };

  try {
    const payload = {
      communityId: "comunidade_livre",
      title: "Comunidade Livre",
      topics: [{ id: "t1", title: "Topico 1" }],
    };
    const res = await mirror.postCommunityMirrorToRelay(payload);
    assert.equal(captured.url, "http://10.0.0.8:3920/vox/mirror");
    assert.equal(captured.body.communityId, "comunidade_livre");
    assert.equal(res.status, "mirrored");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("community-mirror - mirrorCommunityToRelay monta índice e POST", async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ status: "mirrored", communityId: "demo-aprenda-vox" }),
    };
  };

  try {
    const out = await mirror.mirrorCommunityToRelay(
      { id: "demo-aprenda-vox", title: "Aprenda Vox" },
      [{ id: "post_1", title: "Olá" }],
      "http://127.0.0.1:3920",
      { mirroredAt: "2026-10-23T00:00:00.000Z" },
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:3920/vox/mirror");
    assert.equal(out.index.communityId, "demo-aprenda-vox");
    assert.equal(out.index.topics[0].id, "post_1");
    assert.equal(out.result.status, "mirrored");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("community-mirror - tryMirrorCommunityToRelay engole falha de rede", async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  try {
    const res = await mirror.tryMirrorCommunityToRelay({ id: "c1", title: "C" }, []);
    assert.equal(res, null);
    const tel = mirror.loadMirrorTelemetry();
    assert.equal(tel.lastError?.communityId, "c1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("community-mirror - tryMirror manual registra falha local com flag manual", async () => {
  localStorage.clear();
  const res = await mirror.tryMirrorCommunityToRelay(
    { id: "invalid slug!", title: "X" },
    [],
    null,
    { manual: true },
  );
  assert.equal(res, null);
  const tel = mirror.loadMirrorTelemetry();
  assert.equal(tel.lastError?.manual, true);
  assert.equal(tel.lastError?.code, "mirror.community_id_invalid");
});

test("community-mirror - mirrorUserMessage copy PT", () => {
  assert.match(mirror.mirrorUserMessage("mirror.body_too_large"), /256 KiB|grande demais/i);
});

test("community-mirror - getMirrorLastErrorExport para status", () => {
  localStorage.clear();
  mirror.recordMirrorOutcome("demo-x", {
    ok: false,
    code: "mirror.topics_limit",
    error: "test",
  });
  const exp = mirror.getMirrorLastErrorExport();
  assert.equal(exp.mirror_last_error, "mirror.topics_limit");
  assert.equal(exp.mirror_last_error_community, "demo-x");
});
