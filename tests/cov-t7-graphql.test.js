/**
 * @file Cobertura T7 de `graphql.js` e `graphql-gateway.js`: consultas, fallback entre gateways,
 * corroboração, leitura raw e cache de chave DM, com `fetch` falso e sem rede.
 */
import "./setup.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as gql from "../client/js/graphql.js";
import * as gw from "../client/js/graphql-gateway.js";
import * as cacheNode from "../client/js/cache-node.js";
import { createGatewayFetch, edge } from "./helpers/cov-t7-gateway-fetch.mjs";

const realFetch = globalThis.fetch;
const A = "https://a.example/graphql";
const B = "https://b.example/graphql";
const CONFIG = {
  gateways: [
    { label: "A", graphql: A, raw: "https://a.example/raw/{txId}" },
    { label: "B", graphql: B, raw: "https://b.example/raw/{txId}" },
    { label: "sem-graphql", raw: "https://c.example/raw/{txId}" },
  ],
};
const FAIL = () => ({ status: 500, text: "x" });

beforeEach(() => {
  gw.__resetGatewayConfigForTests();
  localStorage.clear();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Instala o fetch falso com a config padrão.
 * @param {object} spec Rotas do fetch falso.
 * @returns {string[]} URLs chamadas.
 */
function useFetch(spec) {
  gw.__resetGatewayConfigForTests();
  const f = createGatewayFetch({ config: CONFIG, ...spec });
  globalThis.fetch = f.fetch;
  return f.calls;
}

/**
 * Resposta GraphQL com arestas.
 * @param {object[]} edges Arestas.
 * @returns {() => object} Rota do fetch falso.
 */
const ok = (edges) => () => ({ json: { data: { transactions: { edges } } } });

test("graphqlGateways - só aceita URL http(s)", () => {
  assert.deepEqual(gw.graphqlGateways(CONFIG).map((g) => g.label), ["A", "B"]);
  assert.deepEqual(gw.graphqlGateways(null), []);
  assert.deepEqual(gw.graphqlGateways({ gateways: [{ graphql: "ftp://x" }, { graphql: 5 }] }), []);
});

test("queryOne - HTTP de erro inclui corpo; erros GraphQL viram exceção", async () => {
  useFetch({ graphql: { [A]: () => ({ status: 502, text: "bad gateway" }), [B]: () => ({ json: { errors: [{ message: "boom" }] } }) } });
  await assert.rejects(() => gw.queryOne(A, "q", {}), /HTTP 502: bad gateway/);
  await assert.rejects(() => gw.queryOne(B, "q", {}), /boom/);
});

test("queryOne - resposta sem text() usa res.json()", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { x: 1 } }) });
  assert.deepEqual(await gw.queryOne(A, "q", {}), { x: 1 });
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => gw.queryOne(A, "q", {}), /HTTP 503/);
});

test("withGateways - cai para o segundo gateway e reporta o rótulo", async () => {
  useFetch({ graphql: { [A]: FAIL, [B]: ok([edge("t1")]) } });
  const r = await gw.withGateways((url) => gw.queryOne(url, "q", {}));
  assert.equal(r.gateway, "B");
  assert.equal(r.data.transactions.edges[0].node.id, "t1");
});

test("withGateways - todos falham: erro gatewaysDown com causa", async () => {
  useFetch({ graphql: { [A]: FAIL, [B]: () => ({ status: 500, text: "y" }) } });
  await assert.rejects(
    () => gw.withGateways((url) => gw.queryOne(url, "q", {})),
    (e) => e.kind === "gatewaysDown" && /HTTP 500: y/.test(e.cause.message),
  );
});

test("loadConfig - deduplica chamadas concorrentes e reaproveita o cache", async () => {
  const calls = useFetch({});
  const [c1, c2] = await Promise.all([gw.loadConfig(), gw.loadConfig()]);
  assert.equal(c1, c2);
  await gw.loadConfig();
  assert.equal(calls.filter((u) => u.endsWith("gateways.json")).length, 1);
});

test("queryAllGateways - ignora o gateway que falha", async () => {
  useFetch({ graphql: { [A]: ok([edge("t1")]), [B]: FAIL } });
  const res = await gw.queryAllGateways("q", {});
  assert.deepEqual(res.map((r) => r.gateway), ["A"]);
});

test("mergeTopicEdgesWithConsensus - conta testemunhas e detecta dono divergente", () => {
  const merged = gw.mergeTopicEdgesWithConsensus([
    { gateway: "A", data: { transactions: { edges: [edge("t1", {}, "o1"), edge("t2", {}, "o1"), { node: {} }] } } },
    { gateway: "B", data: { transactions: { edges: [edge("t1", {}, "o1"), edge("t2", {}, "o2")] } } },
    { gateway: "C", data: null },
  ]);
  const byId = Object.fromEntries(merged.map((m) => [m.node.id, m]));
  assert.equal(merged.length, 2);
  assert.deepEqual([byId.t1.crossChecked, byId.t1.consensusCount, byId.t1.conflict], [true, 2, false]);
  assert.deepEqual(byId.t2.witnesses, ["A", "B"]);
  assert.equal(byId.t2.conflict, true);
  assert.deepEqual(gw.mergeTopicEdgesWithConsensus(undefined), []);
});

test("fetchRawFromGateways - extrai content/título/mídia e pula resposta HTML", async () => {
  const payload = JSON.stringify({ content: "olá", title: "T", mediaTx: "m1", communityId: "c1" });
  const calls = useFetch({
    raw: {
      "https://a.example/raw/tx1": { text: "<!DOCTYPE html><html></html>" },
      "https://b.example/raw/tx1": { text: payload },
    },
  });
  const r = await gw.fetchRawFromGateways("tx1");
  assert.deepEqual(r, { body: "olá", raw: payload, title: "T", mediaTx: "m1", communityId: "c1" });
  assert.deepEqual(calls.filter((u) => u.includes("/raw/")), ["https://a.example/raw/tx1", "https://b.example/raw/tx1"]);
});

test("fetchRawFromGateways - content-type html, HTTP de erro e campo text", async () => {
  useFetch({
    raw: {
      "https://a.example/raw/tx2": { text: "ok", headers: { "content-type": "text/html" } },
      "https://b.example/raw/tx2": { status: 404, text: "nada" },
      "https://c.example/raw/tx2": { text: JSON.stringify({ text: "via text" }) },
    },
  });
  assert.equal((await gw.fetchRawFromGateways("tx2")).body, "via text");
});

test("fetchRawFromGateways - texto cru, JSON sem campo de corpo e campo body", async () => {
  useFetch({ raw: { "https://a.example/raw/tx2": { text: "texto cru" } } });
  const plain = await gw.fetchRawFromGateways("tx2");
  assert.deepEqual([plain.body, plain.raw], ["texto cru", "texto cru"]);
  useFetch({ raw: { "https://a.example/raw/tx2": { text: JSON.stringify({ n: 1 }) } } });
  const noBody = await gw.fetchRawFromGateways("tx2");
  assert.deepEqual([noBody.body, noBody.title], ["", ""]);
  useFetch({ raw: { "https://a.example/raw/tx2": { text: JSON.stringify({ body: "b", title: 7 }) } } });
  const body = await gw.fetchRawFromGateways("tx2");
  assert.deepEqual([body.body, body.title], ["b", ""]);
});

test("fetchRawFromGateways - sem {txId} cai nos padrões e devolve null se todos falham", async () => {
  gw.__resetGatewayConfigForTests();
  const f = createGatewayFetch({ config: { gateways: [{ label: "x", graphql: A }] } });
  globalThis.fetch = f.fetch;
  assert.equal(await gw.fetchRawFromGateways("tx3"), null);
  assert.deepEqual(f.calls.filter((u) => u.includes("/tx3")), ["https://arweave.net/tx3", "https://turbo-gateway.com/raw/tx3"]);
});

test("fetchCommunities / fetchTopics / fetchReplies mapeiam as arestas", async () => {
  useFetch({ graphql: { [A]: ok([edge("cm1", { "Community-Id": "c1", Title: "Praça" })]) } });
  const c = await gql.fetchCommunities();
  assert.deepEqual([c.gateway, c.items[0].title, c.items[0].id], ["A", "Praça", "c1"]);
  useFetch({ graphql: { [A]: ok([edge("tp1", { "Topic-Title": "Oi" })]) } });
  const t = await gql.fetchTopics("c1");
  assert.deepEqual([t.items[0].communityId, t.items[0].title], ["c1", "Oi"]);
  useFetch({ graphql: { [A]: ok([edge("r1", { "Reply-To": "tp1", Body: "resp" })]) } });
  const r = await gql.fetchReplies("tp1");
  assert.deepEqual([r.items[0].replyTo, r.items[0].body], ["tp1", "resp"]);
});

test("fetchTopicsByOwners - lista vazia não consulta; com donos envia variáveis", async () => {
  const calls = useFetch({
    graphql: { [A]: (b) => ({ json: { data: { transactions: { edges: [edge("tp9", { Title: b.variables.owners.join("+") })] } } } }) },
  });
  assert.deepEqual(await gql.fetchTopicsByOwners([]), { items: [], gateway: "", demo: false });
  assert.equal(calls.length, 0);
  const r = await gql.fetchTopicsByOwners(["o1", "", "o2"], { after: "cur" });
  assert.equal(r.items[0].title, "o1+o2");
});

test("fetchRecentTopics - corroboração cruzada marca testemunhas; sem ela usa o primeiro gateway", async () => {
  useFetch({ graphql: { [A]: ok([edge("t1", { Title: "x" })]), [B]: ok([edge("t1", { Title: "x" })]) } });
  const cross = await gql.fetchRecentTopics({ crossCheck: true });
  assert.deepEqual([cross.crossChecked, cross.gateway], [true, "A, B"]);
  assert.deepEqual([cross.items[0].consensusCount, cross.items[0].crossChecked, cross.items[0].conflict], [2, true, false]);
  const plain = await gql.fetchRecentTopics();
  assert.deepEqual([plain.crossChecked, plain.gateway, plain.items.length], [false, "A", 1]);
});

test("fetchRecentTopics - corroboração sem resultado cai para o fluxo simples", async () => {
  let n = 0;
  useFetch({ graphql: { [A]: () => (n++ < 1 ? FAIL() : { json: { data: { transactions: { edges: [] } } } }), [B]: FAIL } });
  const r = await gql.fetchRecentTopics({ crossCheck: true });
  assert.deepEqual([r.crossChecked, r.gateway], [false, "A"]);
});

test("fetchTopicById - devolve tópico, null se ausente e null em falha total", async () => {
  useFetch({ graphql: { [A]: () => ({ json: { data: { transaction: { id: "tp1", tags: [] } } } }) } });
  assert.equal((await gql.fetchTopicById("tp1")).id, "tp1");
  useFetch({ graphql: { [A]: () => ({ json: { data: { transaction: null } } }) } });
  assert.equal(await gql.fetchTopicById("tp1"), null);
  useFetch({ graphql: { [A]: FAIL, [B]: FAIL } });
  assert.equal(await gql.fetchTopicById("tp1"), null);
});

test("fetchUserMemberships / fetchModActions mapeiam e engolem falha com lista vazia", async () => {
  useFetch({ graphql: { [A]: ok([edge("m1", { "Community-Id": "c1", "Display-Name": "Ana" }), edge("m2", {})]) } });
  assert.deepEqual(await gql.fetchUserMemberships("addr"), [{ id: "m1", communityId: "c1", displayName: "Ana" }]);
  useFetch({ graphql: { [A]: ok([edge("a1", { Action: "ban", Target: "t", "Community-Id": "c1" }, "mod1")]) } });
  assert.deepEqual(await gql.fetchModActions("c1"), [{ id: "a1", owner: "mod1", action: "ban", target: "t", communityId: "c1" }]);
  useFetch({ graphql: { [A]: FAIL, [B]: FAIL } });
  assert.deepEqual(await gql.fetchUserMemberships("addr"), []);
  assert.deepEqual(await gql.fetchModActions("c1"), []);
});

test("cache de chave DM - grava objeto ou string JSON e lê de volta", () => {
  gql.cacheUserDmPub("", { k: 1 });
  gql.cacheUserDmPub("a1", null);
  assert.equal(gql.getCachedUserDmPub("a1"), null);
  gql.cacheUserDmPub("a1", { kty: "EC" });
  gql.cacheUserDmPub("a2", JSON.stringify({ kty: "OKP" }));
  assert.deepEqual(gql.getCachedUserDmPub("a1"), { kty: "EC" });
  assert.deepEqual(gql.getCachedUserDmPub("a2"), { kty: "OKP" });
  assert.equal(gql.getCachedUserDmPub(""), null);
  localStorage.setItem("vox-known-dm-pubs", "{quebrado");
  assert.equal(gql.getCachedUserDmPub("a1"), null);
  assert.doesNotThrow(() => gql.cacheUserDmPub("a3", { k: 1 }));
});

test("fetchUserDmPub - cache, gateway com Dm-Pub e falhas", async () => {
  assert.equal(await gql.fetchUserDmPub(""), null);
  gql.cacheUserDmPub("a1", { kty: "EC" });
  assert.deepEqual(await gql.fetchUserDmPub("a1"), { kty: "EC" });
  useFetch({ graphql: { [A]: ok([edge("p0", {}), edge("p1", { "Dm-Pub": JSON.stringify({ kty: "RSA" }) })]) } });
  assert.deepEqual(await gql.fetchUserDmPub("a9"), { kty: "RSA" });
  assert.deepEqual(gql.getCachedUserDmPub("a9"), { kty: "RSA" });
  useFetch({ graphql: { [A]: ok([edge("p0", {})]) } });
  assert.equal(await gql.fetchUserDmPub("a10"), null);
});

test("fetchHandle - resolve, guarda mapeamento e usa cache quando a rede cai", async () => {
  assert.equal(await gql.fetchHandle("!!"), null);
  useFetch({ graphql: { [A]: ok([edge("h1", { Handle: "maria" }, "own-maria")]) } });
  const res = await gql.fetchHandle("@Maria");
  assert.equal(res.primaryOwner, "own-maria");
  useFetch({ graphql: { [A]: FAIL, [B]: FAIL } });
  const cached = await gql.fetchHandle("maria");
  assert.deepEqual(cached, { primaryOwner: "own-maria", isConflict: false, claimants: [{ owner: "own-maria" }] });
  assert.equal(await gql.fetchHandle("outra"), null);
});

test("fetchHandleForAddress - slug válido vence, inválido é ignorado, falha vira null", async () => {
  assert.equal(await gql.fetchHandleForAddress(""), null);
  useFetch({ graphql: { [A]: ok([edge("h0", { Handle: "!!" }), edge("h1", { Handle: "joana" })]) } });
  assert.equal(await gql.fetchHandleForAddress("addr-j"), "joana");
  assert.equal(await gql.fetchHandleForAddress("addr-j"), "joana");
  useFetch({ graphql: { [A]: ok([]) } });
  assert.equal(await gql.fetchHandleForAddress("addr-x"), null);
  useFetch({ graphql: { [A]: FAIL, [B]: FAIL } });
  assert.equal(await gql.fetchHandleForAddress("addr-y"), null);
});

test("fetchProfileCardOnChain - por endereço, por rota, vazio e falha", async () => {
  assert.equal(await gql.fetchProfileCardOnChain(), null);
  const echo = (b) => ({ json: { data: { transactions: { edges: [edge("pc1", { "Display-Name": b.variables.address || b.variables.routeId })] } } } });
  useFetch({ graphql: { [A]: echo } });
  assert.equal((await gql.fetchProfileCardOnChain({ address: "ad1" })).displayName, "ad1");
  assert.equal((await gql.fetchProfileCardOnChain({ routeId: "vx_1" })).displayName, "vx_1");
  useFetch({ graphql: { [A]: ok([]) } });
  assert.equal(await gql.fetchProfileCardOnChain({ address: "ad2" }), null);
  useFetch({ graphql: { [A]: FAIL, [B]: FAIL } });
  assert.equal(await gql.fetchProfileCardOnChain({ address: "ad3" }), null);
});

test("fetchTransactionData - gateway raw vale e entra no cache; sem fonte devolve vazio memorizado", async () => {
  await cacheNode.clearCache();
  useFetch({ raw: { "https://a.example/raw/txg1": { text: JSON.stringify({ body: "do gateway" }) } } });
  const r = await gql.fetchTransactionData("txg1", { communityId: "c1" });
  assert.equal(r.body, "do gateway");
  assert.equal((await gql.fetchTransactionData("txg1")).body, "do gateway");
  useFetch({});
  const empty = await gql.fetchTransactionData("txg-vazio");
  assert.deepEqual(empty, { body: "", raw: "" });
  assert.equal(await gql.fetchTransactionData("txg-vazio"), empty);
});
