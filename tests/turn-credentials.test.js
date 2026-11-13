import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const turn = await import("../client/js/turn-credentials.js");

const URL_W = "https://vox-turn.example.workers.dev/ice-servers";
const GOOD = { iceServers: [{ urls: ["turn:t.example:3478"], username: "u", credential: "c" }], ttl: 4 * 3600 };

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

test("credenciais TURN — pede uma vez, guarda até perto de vencer e pede de novo depois", async () => {
  const c = clock();
  const fetchImpl = fakeFetch([Response.json(GOOD), Response.json(GOOD)]);
  const src = turn.createTurnCredentials({ url: URL_W, fetchImpl, now: c.now });
  assert.deepEqual(src.current(), [], "nada antes de pedir");
  const [a] = await Promise.all([src.get(), src.get()]);
  assert.equal(fetchImpl.calls.length, 1, "pedidos simultâneos viram um");
  assert.deepEqual(a, GOOD.iceServers);
  assert.deepEqual(src.current(), GOOD.iceServers);
  c.advance(GOOD.ttl * 1000 - turn.EXPIRY_MARGIN_MS);
  assert.deepEqual(src.current(), [], "perto de vencer já não é usada");
  await src.get();
  assert.equal(fetchImpl.calls.length, 2);
});

test("credenciais TURN — teto/limite respeitam Retry-After; erro espera 5 min", async () => {
  const c = clock();
  const busy = new Response("{}", { status: 503, headers: { "Retry-After": "600" } });
  const fetchImpl = fakeFetch([busy, new Error("rede"), Response.json(GOOD)]);
  const src = turn.createTurnCredentials({ url: URL_W, fetchImpl, now: c.now });
  assert.deepEqual(await src.get(), []);
  c.advance(599_000);
  assert.deepEqual(await src.get(), [], "ainda esperando");
  assert.equal(fetchImpl.calls.length, 1);
  c.advance(2000);
  assert.deepEqual(await src.get(), [], "falha de rede");
  c.advance(turn.RETRY_AFTER_ERROR_MS - 1);
  await src.get();
  assert.equal(fetchImpl.calls.length, 2);
  c.advance(2);
  assert.deepEqual(await src.get(), GOOD.iceServers);
});

test("credenciais TURN — resposta fora do formato é descartada", async () => {
  assert.deepEqual(turn.sanitizeIceServers([{ urls: ["http://x", "turn:ok:3478"], username: 1, credential: "c" }, { urls: "javascript:alert(1)" }]), [{ urls: ["turn:ok:3478"], credential: "c" }]);
  const src = turn.createTurnCredentials({ url: URL_W, fetchImpl: fakeFetch([Response.json({ iceServers: [], ttl: 100 })]), now: () => 1 });
  assert.deepEqual(await src.get(), []);
});

test("credenciais TURN — falha sem TURN reconecta uma vez; com TURN, ou sem credencial, não", async () => {
  const reconnected = [];
  const fallback = turn.createTurnFallback({
    getUrl: () => URL_W,
    reconnect: (id) => reconnected.push(id),
    fetchImpl: fakeFetch([Response.json(GOOD)]),
  });
  assert.equal(await fallback.onFailed("vx_b", true), false, "já tinha TURN: nada a tentar");
  assert.equal(await fallback.onFailed("vx_b", false), true);
  assert.equal(await fallback.onFailed("vx_b", false), false, "uma vez por par na sessão");
  assert.deepEqual(reconnected, ["vx_b"]);
  assert.deepEqual(fallback.iceServers(), GOOD.iceServers, "conexões novas já levam o TURN");
  const off = turn.createTurnFallback({ getUrl: () => "", reconnect: () => assert.fail("sem URL não reconecta") });
  assert.equal(await off.onFailed("vx_c", false), false);
  assert.deepEqual(off.iceServers(), []);
  const http = turn.createTurnFallback({ getUrl: () => "http://inseguro.example", reconnect: () => {} });
  assert.deepEqual(await http.prefetch(), [], "só https");
});
