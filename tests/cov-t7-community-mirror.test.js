/**
 * @file Cobertura T7 de `community-mirror.js`: telemetria, validação do índice, envio a vários relays,
 * erros do relay (JSON e texto) e disparo manual do assistente, com `fetch` falso.
 */
import "./setup.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as mirror from "../client/js/community-mirror.js";

const realFetch = globalThis.fetch;
let posts;

/**
 * Instala `fetch` que responde por URL.
 * @param {Record<string, object>} routes Mapa URL → `{ status, json?, text? }`.
 * @returns {void}
 */
function useRelays(routes) {
  posts = [];
  globalThis.fetch = async (url, init) => {
    const r = routes[String(url)];
    if (!r) throw new Error(`relay fora do ar: ${url}`);
    posts.push([String(url), JSON.parse(init.body)]);
    const text = r.text ?? JSON.stringify(r.json ?? {});
    return { ok: r.status < 300, status: r.status, text: async () => text, json: async () => JSON.parse(text) };
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => { globalThis.fetch = realFetch; });

test("mirrorUserMessage - mensagem conhecida, texto reserva e padrão", () => {
  assert.equal(mirror.mirrorUserMessage("mirror.not_object"), "Índice deve ser um objeto JSON.");
  assert.equal(mirror.mirrorUserMessage("codigo.desconhecido", "texto do relay"), "texto do relay");
  assert.equal(mirror.mirrorUserMessage("codigo.desconhecido"), "Índice não enviado ao relay.");
});

test("isMirrorVerbose - só com a flag igual a 1", () => {
  assert.equal(mirror.isMirrorVerbose(), false);
  localStorage.setItem("VOX_MIRROR_VERBOSE", "1");
  assert.equal(mirror.isMirrorVerbose(), true);
});

test("telemetria - registra sucesso e erro por comunidade e exporta o último erro", () => {
  assert.equal(mirror.getMirrorStatusForCommunity(""), null);
  assert.equal(mirror.getMirrorStatusForCommunity("c1"), null);
  assert.equal(mirror.getMirrorLastErrorExport(), null);
  mirror.recordMirrorOutcome("c1", { ok: true, manual: true, at: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(mirror.getMirrorStatusForCommunity("c1"), { at: "2026-01-01T00:00:00.000Z", ok: true, code: null, error: null, httpStatus: null, manual: true });
  mirror.recordMirrorOutcome("c2", { ok: false, code: "mirror.body_too_large", error: "grande", httpStatus: 413, at: "2026-01-02T00:00:00.000Z" });
  assert.deepEqual(mirror.getMirrorLastErrorExport(), {
    mirror_last_error: "mirror.body_too_large",
    mirror_last_error_at: "2026-01-02T00:00:00.000Z",
    mirror_last_error_community: "c2",
  });
  mirror.recordMirrorOutcome("", { ok: false, error: "sem código" });
  assert.equal(mirror.getMirrorLastErrorExport().mirror_last_error, "sem código");
  const t = mirror.loadMirrorTelemetry();
  assert.equal(t.lastSuccess.communityId, "c1");
  localStorage.setItem(mirror.MIRROR_TELEMETRY_KEY, "{quebrado");
  assert.deepEqual(mirror.loadMirrorTelemetry(), { byCommunity: {}, lastError: null, lastSuccess: null });
});

test("validateCommunityMirrorPayload - recusa id inválido, tópicos fora do formato/limite, manifesto ruim e corpo grande", () => {
  const code = (p, bytes) => mirror.validateCommunityMirrorPayload(p, bytes).code;
  assert.equal(code({ communityId: "" }), "mirror.community_id_invalid");
  assert.equal(code({ communityId: "a b" }), "mirror.community_id_invalid");
  assert.equal(code({ communityId: "c1", topics: "x" }), "mirror.topics_invalid");
  assert.equal(code({ communityId: "c1", topics: new Array(mirror.MIRROR_MAX_TOPICS + 1).fill({}) }), "mirror.topics_limit");
  assert.equal(code({ communityId: "c1", cacheManifest: { lixo: true } }), "mirror.cache_manifest_invalid");
  assert.equal(code({ communityId: "c1" }, mirror.MIRROR_MAX_BODY_BYTES + 1), "mirror.body_too_large");
  assert.deepEqual(mirror.validateCommunityMirrorPayload({ communityId: "c1", topics: [] }), { valid: true });
});

test("buildCommunityMirrorIndex - normaliza tópicos, usa título padrão e recusa sem id", () => {
  const idx = mirror.buildCommunityMirrorIndex({ id: "c1", owner: "vx_o" }, [{ txId: "t1", topicTitle: "A" }, { title: "sem id" }, { id: "t2" }], { source: "teste", mirroredAt: "2026-02-02T00:00:00.000Z" });
  assert.deepEqual(idx.topics, [{ id: "t1", title: "A", owner: "" }, { id: "t2", title: "Tópico", owner: "" }]);
  assert.deepEqual([idx.title, idx.owner, idx.source, idx.mirroredAt], ["c1", "vx_o", "teste", "2026-02-02T00:00:00.000Z"]);
  assert.throws(() => mirror.buildCommunityMirrorIndex({}), /communityId obrigatório/);
  assert.throws(() => mirror.buildCommunityMirrorIndex({ id: "c 1" }), (e) => e.code === "mirror.community_id_invalid" && /Community-Id inválido/.test(e.message));
});

test("postCommunityMirrorToRelay - sucesso em um relay basta; erros JSON e texto viram mensagem com código", async () => {
  useRelays({ "https://r1.test/vox/mirror": { status: 200, json: { ok: true, id: 1 } } });
  assert.deepEqual(await mirror.postCommunityMirrorToRelay({ communityId: "c1" }, "https://r1.test///"), { ok: true, id: 1 });
  assert.deepEqual(posts[0][1], { communityId: "c1" });
  useRelays({ "https://r2.test/vox/mirror": { status: 400, json: { code: "mirror.not_object", error: "x" } } });
  await assert.rejects(() => mirror.postCommunityMirrorToRelay({ communityId: "c1" }, "https://r2.test"), (e) => e.code === "mirror.not_object" && e.httpStatus === 400 && /objeto JSON/.test(e.message));
  useRelays({ "https://r3.test/vox/mirror": { status: 502, text: "bad gateway" } });
  await assert.rejects(() => mirror.postCommunityMirrorToRelay({ communityId: "c1" }, "https://r3.test"), (e) => e.code === "mirror.relay_error" && e.httpStatus === 502 && /bad gateway/.test(e.message));
  useRelays({ "https://r4.test/vox/mirror": { status: 500, text: "" } });
  await assert.rejects(() => mirror.postCommunityMirrorToRelay({ communityId: "c1" }, "https://r4.test"), /HTTP 500/);
  useRelays({});
  await assert.rejects(() => mirror.postCommunityMirrorToRelay({ communityId: "c1" }, "https://fora.test"), /relay fora do ar/);
});

test("postCommunityMirrorToRelay - valida antes de enviar e exige communityId", async () => {
  useRelays({});
  await assert.rejects(() => mirror.postCommunityMirrorToRelay({}), /communityId obrigatório/);
  await assert.rejects(() => mirror.postCommunityMirrorToRelay({ communityId: "c1", topics: "x" }, "https://r.test"), (e) => e.code === "mirror.topics_invalid");
  assert.deepEqual(posts, []);
});

test("mirrorCommunityToRelay - registra o sucesso na telemetria e devolve índice e resposta", async () => {
  useRelays({ "https://r1.test/vox/mirror": { status: 200, json: { ok: true } } });
  const out = await mirror.mirrorCommunityToRelay({ id: "c9", title: "Nove" }, [{ id: "t1" }], "https://r1.test", { manual: true });
  assert.equal(out.index.title, "Nove");
  assert.deepEqual(out.result, { ok: true });
  assert.equal(mirror.getMirrorStatusForCommunity("c9").manual, true);
});

test("tryMirrorCommunityToRelay - falha vira null e telemetria; só avisa em manual, notify ou verbose", async () => {
  useRelays({});
  assert.equal(await mirror.tryMirrorCommunityToRelay({ id: "c1" }, [], "https://fora.test"), null);
  const st = mirror.getMirrorStatusForCommunity("c1");
  assert.deepEqual([st.ok, st.manual, st.code], [false, false, "mirror.local_validation"]);
  assert.match(st.error, /relay fora do ar/);
  assert.equal(await mirror.tryMirrorCommunityToRelay({ id: "c2" }, [], "https://fora.test", { manual: true, notify: true }), null);
  assert.equal(mirror.getMirrorStatusForCommunity("c2").manual, true);
  localStorage.setItem("VOX_MIRROR_VERBOSE", "1");
  assert.equal(await mirror.tryMirrorCommunityToRelay({ id: "c3" }, [], "https://fora.test"), null);
  assert.equal(await mirror.tryMirrorCommunityToRelay({}, [], null), null);
});

test("testMirrorForSteward - sem id devolve null; com id espelha manualmente", async () => {
  useRelays({ "https://r1.test/vox/mirror": { status: 200, json: { ok: true } } });
  assert.equal(await mirror.testMirrorForSteward("  "), null);
  const out = await mirror.testMirrorForSteward("c7", [{ id: "t1", title: "T" }], "https://r1.test");
  assert.equal(out.index.communityId, "c7");
  assert.equal(mirror.getMirrorStatusForCommunity("c7").manual, true);
});
