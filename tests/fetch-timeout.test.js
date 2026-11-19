import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const never = () => new Promise(() => {});

test("TURN exporta prazo padrão de fetch (RED na base)", async () => {
  const turn = await import("../client/js/turn-credentials.js");
  assert.equal(turn.TURN_FETCH_TIMEOUT_MS, 8000);
});

test("fetch que nunca resolve rejeita com TimeoutError no prazo", async () => {
  const { fetchWithTimeout } = await import("../client/js/fetch-timeout.js");
  const t0 = Date.now();
  await assert.rejects(fetchWithTimeout("https://x.example/", {}, { timeoutMs: 40, fetchImpl: never }), { name: "TimeoutError" });
  assert.ok(Date.now() - t0 < 1000);
});

test("aborta o signal passado ao fetch quando o prazo estoura", async () => {
  const { fetchWithTimeout } = await import("../client/js/fetch-timeout.js");
  let seen;
  const impl = (_u, init) => {
    seen = init.signal;
    return never();
  };
  await assert.rejects(fetchWithTimeout("https://x.example/", {}, { timeoutMs: 20, fetchImpl: impl }));
  assert.equal(seen.aborted, true);
});

test("signal externo cancela antes do prazo", async () => {
  const { fetchWithTimeout } = await import("../client/js/fetch-timeout.js");
  const ext = new AbortController();
  const impl = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
  const p = fetchWithTimeout("https://x.example/", { signal: ext.signal }, { timeoutMs: 5000, fetchImpl: impl });
  ext.abort(new Error("cancelado"));
  await assert.rejects(p, /cancelado/);
});

test("readResponseText exportado para drenar erros HTTP do relay", async () => {
  const mod = await import("../client/js/fetch-timeout.js");
  assert.equal(typeof mod.readResponseText, "function");
  const res = new Response("x".repeat(20_000));
  const out = await mod.readResponseText(res, 100);
  assert.ok(out.endsWith("…"));
  assert.equal(out.length, 100);
});

test("resposta rápida passa direto", async () => {
  const { fetchWithTimeout } = await import("../client/js/fetch-timeout.js");
  const res = await fetchWithTimeout("https://x.example/", {}, { timeoutMs: 1000, fetchImpl: async () => ({ ok: true }) });
  assert.equal(res.ok, true);
});

test("fetchCredentials do TURN com rede muda cai na espera padrão", async () => {
  const turn = await import("../client/js/turn-credentials.js");
  if (turn.TURN_FETCH_TIMEOUT_MS == null) return;
  const out = await turn.fetchCredentials("https://w.example/ice", never, 30);
  assert.equal(out.servers, null);
  assert.equal(out.retryMs, turn.RETRY_AFTER_ERROR_MS);
});