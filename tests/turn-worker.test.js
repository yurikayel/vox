import test from "node:test";
import assert from "node:assert/strict";

const policy = await import("../workers/turn/src/policy.js");
const worker = await import("../workers/turn/src/index.js");

const T0 = Date.UTC(2026, 10, 13, 12);
const APP = "https://yurikayel.github.io";
const ENV = { TURN_KEY_ID: "k1", TURN_KEY_API_TOKEN: "t1", CF_ACCOUNT_ID: "acc", CF_ANALYTICS_TOKEN: "an" };
const CF_ICE = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
  ],
};

class Storage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k); }
  async put(k, v) { this.map.set(k, structuredClone(v)); }
}

function usageResponse(bytes) {
  return { data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: bytes } }] }] } } };
}

function req(path, { origin = APP, method = "GET" } = {}) {
  return new Request(`https://vox-turn.example.workers.dev${path}`, { method, headers: origin ? { Origin: origin, "CF-Connecting-IP": "203.0.113.7" } : {} });
}

test("TURN worker — origens: app, espelho, localhost e extras; o resto não", () => {
  assert.equal(policy.isAllowedOrigin(APP), true);
  assert.equal(policy.isAllowedOrigin("https://vox-9df.pages.dev"), true);
  assert.equal(policy.isAllowedOrigin("http://localhost:5182"), true);
  assert.equal(policy.isAllowedOrigin("https://evil.example"), false);
  assert.equal(policy.isAllowedOrigin("https://yurikayel.github.io.evil.example"), false);
  assert.equal(policy.isAllowedOrigin("https://vox.example", { ALLOWED_ORIGINS: "https://a.example, https://vox.example" }), true);
  assert.equal(policy.isAllowedOrigin(""), false);
});

test("TURN worker — tira a porta 53 e entradas sem URL", () => {
  const out = policy.filterIceServers(CF_ICE.iceServers);
  assert.equal(out.length, 2);
  assert.deepEqual(out[1].urls, ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"]);
  assert.equal(out[1].credential, "c");
  assert.deepEqual(policy.filterIceServers([{ urls: "turn:x:53" }, null]), []);
});

test("TURN worker — janela do mês, soma do uso e veredito do teto", () => {
  assert.deepEqual(policy.monthWindow(T0), { month: "2026-11", from: "2026-11-01", to: "2026-11-13" });
  assert.equal(policy.sumEgressBytes(usageResponse(5)), 5);
  assert.equal(policy.sumEgressBytes({ errors: [{ message: "x" }] }), null, "erro na API é uso desconhecido, não zero");
  assert.equal(policy.budgetBytes({}), 800e9);
  assert.equal(policy.budgetBytes({ BUDGET_GB: "10" }), 10e9);
  const fresh = { month: "2026-11", bytes: 1, checkedAt: T0 };
  assert.equal(policy.budgetVerdict(fresh, { now: T0, limitBytes: 10 }), "ok");
  assert.equal(policy.budgetVerdict({ ...fresh, bytes: 10 }, { now: T0, limitBytes: 10 }), "budget");
  assert.equal(policy.budgetVerdict(fresh, { now: T0 + policy.USAGE_MAX_AGE_MS + 1, limitBytes: 10 }), "unknown");
  assert.equal(policy.budgetVerdict({ ...fresh, month: "2026-10" }, { now: T0, limitBytes: 10 }), "unknown");
  assert.equal(policy.budgetVerdict(null, { now: T0, limitBytes: 10 }), "unknown");
});

test("TURN worker — limite por IP na hora, e zera na hora seguinte", () => {
  let state = null;
  for (let i = 0; i < policy.IP_LIMIT_PER_HOUR; i++) ({ state } = policy.countRequest(state, "ip", T0));
  assert.equal(policy.countRequest(state, "ip", T0).allowed, false);
  assert.equal(policy.countRequest(state, "outro", T0).allowed, true);
  assert.equal(policy.countRequest(state, "ip", T0 + 3_600_000).allowed, true);
});

test("TURN worker — orçamento: consulta o uso, guarda e respeita o teto", async () => {
  const calls = [];
  const storage = new Storage();
  let bytes = 100;
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json(usageResponse(bytes));
  };
  const budget = new worker.TurnBudget({ storage }, { ...ENV, BUDGET_GB: "1" }, { fetch: fetchImpl, now: () => T0 });
  assert.deepEqual(await budget.admit("ip"), { ok: true });
  assert.deepEqual(await budget.admit("ip"), { ok: true });
  assert.equal(calls.length, 1, "uso fresco não é consultado de novo");
  assert.equal(calls[0].body.variables.from, "2026-11-01");
  bytes = 2e9;
  const later = new worker.TurnBudget({ storage }, { ...ENV, BUDGET_GB: "1" }, { fetch: fetchImpl, now: () => T0 + policy.USAGE_MAX_AGE_MS + 1 });
  assert.deepEqual(await later.admit("ip"), { ok: false, reason: "budget" });
});

test("TURN worker — uso desconhecido não libera, e não martela a API", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response("erro", { status: 500 });
  };
  const storage = new Storage();
  const budget = new worker.TurnBudget({ storage }, ENV, { fetch: fetchImpl, now: () => T0 });
  assert.deepEqual(await budget.admit("ip"), { ok: false, reason: "unknown" });
  assert.deepEqual(await budget.admit("ip"), { ok: false, reason: "unknown" });
  assert.equal(calls, 1, "espera 5 min antes de consultar de novo");
  const noToken = new worker.TurnBudget({ storage: new Storage() }, { TURN_KEY_ID: "k" }, { fetch: fetchImpl, now: () => T0 });
  assert.deepEqual(await noToken.admit("ip"), { ok: false, reason: "unknown" });
});

test("TURN worker — /ice-servers entrega credencial sem a porta 53, com CORS só para a origem do app", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    return Response.json(CF_ICE, { status: 201 });
  };
  const res = await worker.handleRequest(req("/ice-servers"), ENV, { budget: async () => ({ ok: true }), fetch: fetchImpl, now: () => T0 });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), APP);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = await res.json();
  assert.equal(body.ttl, policy.CREDENTIAL_TTL_S);
  assert.equal(body.expiresAt, T0 + policy.CREDENTIAL_TTL_S * 1000);
  assert.ok(!JSON.stringify(body).includes(":53"));
  assert.equal(seen[0].url, "https://rtc.live.cloudflare.com/v1/turn/keys/k1/credentials/generate-ice-servers");
  assert.equal(seen[0].auth, "Bearer t1");
  assert.deepEqual(seen[0].body, { ttl: policy.CREDENTIAL_TTL_S });
});

test("TURN worker — recusas: origem, rota, método, teto, limite e falha do Cloudflare", async () => {
  const ok = async () => ({ ok: true });
  const deps = (budget, status = 201) => ({ budget, fetch: async () => Response.json(CF_ICE, { status }) });
  assert.equal((await worker.handleRequest(req("/ice-servers", { origin: "https://evil.example" }), ENV, deps(ok))).status, 403);
  assert.equal((await worker.handleRequest(req("/ice-servers", { origin: "" }), ENV, deps(ok))).status, 403);
  assert.equal((await worker.handleRequest(req("/outra"), ENV, deps(ok))).status, 404);
  assert.equal((await worker.handleRequest(req("/ice-servers", { method: "POST" }), ENV, deps(ok))).status, 405);
  assert.equal((await worker.handleRequest(req("/ice-servers", { method: "OPTIONS" }), ENV, deps(ok))).status, 204);
  const budget = await worker.handleRequest(req("/ice-servers"), ENV, deps(async () => ({ ok: false, reason: "budget" })));
  assert.equal(budget.status, 503);
  assert.equal(budget.headers.get("Retry-After"), "3600");
  assert.equal((await worker.handleRequest(req("/ice-servers"), ENV, deps(async () => ({ ok: false, reason: "rate" })))).status, 429);
  assert.equal((await worker.handleRequest(req("/ice-servers"), ENV, deps(ok, 500))).status, 502);
});

test("TURN worker — o objeto guarda hash do IP, não o IP", async () => {
  const key = await worker.ipKeyOf("203.0.113.7");
  assert.match(key, /^[0-9a-f]{24}$/);
  assert.ok(!key.includes("203"));
  assert.notEqual(key, await worker.ipKeyOf("203.0.113.8"));
});
