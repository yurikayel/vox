/**
 * @file REV-10 — Worker que entrega credenciais temporárias do Cloudflare Realtime TURN ao app.
 * `GET /ice-servers` → `{ iceServers, ttl, expiresAt }`. O segredo do TURN fica só aqui, nunca no PWA.
 * Um Durable Object (`TurnBudget`) guarda o uso do mês (lido da API de análise do Cloudflare) e a contagem
 * por IP; acima do teto, ou com o uso desconhecido, o Worker para de entregar credencial e o app segue sem TURN.
 */

import * as policy from "./policy.js";

const TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";
const GRAPHQL_API = "https://api.cloudflare.com/client/v4/graphql";
/** Depois de uma consulta de uso que falhou, espera isso antes de tentar de novo (evita rajada na API). */
const USAGE_RETRY_MS = 5 * 60 * 1000;

/**
 * Uso do TURN no mês corrente, em bytes, ou `null` se a consulta falhar.
 * @param {{ CF_ACCOUNT_ID?: string, CF_ANALYTICS_TOKEN?: string }} env
 * @param {typeof fetch} fetchImpl
 * @param {number} now
 * @returns {Promise<number | null>}
 */
export async function fetchMonthlyEgress(env, fetchImpl, now) {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return null;
  try {
    const res = await fetchImpl(GRAPHQL_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(policy.buildUsageQuery(env.CF_ACCOUNT_ID, policy.monthWindow(now))),
    });
    return res.ok ? policy.sumEgressBytes(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Pede ao Cloudflare um par usuário/senha temporário. Falha: `null`.
 * @param {{ TURN_KEY_ID?: string, TURN_KEY_API_TOKEN?: string }} env
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Array<object> | null>}
 */
export async function generateIceServers(env, fetchImpl) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return null;
  try {
    const res = await fetchImpl(`${TURN_API}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: policy.CREDENTIAL_TTL_S }),
    });
    if (!res.ok) return null;
    const servers = policy.filterIceServers((await res.json())?.iceServers);
    return servers.length ? servers : null;
  } catch {
    return null;
  }
}

/**
 * Chave do IP para a contagem por hora: SHA-256 truncado, para o objeto não guardar o IP em claro.
 * @param {string} ip
 * @returns {Promise<string>}
 */
export async function ipKeyOf(ip) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vox-turn|${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Durable Object único ("global"): uso do mês e contagem por IP, num lugar só, sem corrida. */
export class TurnBudget {
  /**
   * @param {{ storage: { get: Function, put: Function } }} state
   * @param {object} env
   * @param {{ fetch?: typeof fetch, now?: () => number }} [deps] para testes
   */
  constructor(state, env, deps = {}) {
    this.storage = state.storage;
    this.env = env;
    this.fetchImpl = deps.fetch || ((...args) => fetch(...args));
    this.now = deps.now || (() => Date.now());
  }

  /**
   * `POST { ipKey }` → `{ ok: true }` ou `{ ok: false, reason: "budget" | "unknown" | "rate" }`.
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const { ipKey = "" } = await request.json().catch(() => ({}));
    return Response.json(await this.admit(String(ipKey)));
  }

  /**
   * Libera um pedido se o mês está abaixo do teto e o IP abaixo do limite da hora.
   * @param {string} ipKey
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async admit(ipKey) {
    const now = this.now();
    const usage = await this.freshUsage(now);
    const verdict = policy.budgetVerdict(usage, { now, limitBytes: policy.budgetBytes(this.env) });
    if (verdict !== "ok") return { ok: false, reason: verdict };
    const { allowed, state } = policy.countRequest(await this.storage.get("ipWindow"), ipKey, now);
    await this.storage.put("ipWindow", state);
    return allowed ? { ok: true } : { ok: false, reason: "rate" };
  }

  /**
   * Uso do mês guardado; velho ou de outro mês, consulta de novo (no máximo uma vez a cada 5 min se falhar).
   * @param {number} now
   * @returns {Promise<{ month: string, bytes: number | null, checkedAt: number } | null>}
   */
  async freshUsage(now) {
    const usage = await this.storage.get("usage");
    if (policy.budgetVerdict(usage, { now, limitBytes: Infinity }) !== "unknown") return usage;
    const failedAt = (await this.storage.get("usageFailedAt")) || 0;
    if (now - failedAt < USAGE_RETRY_MS) return usage || null;
    const bytes = await fetchMonthlyEgress(this.env, this.fetchImpl, now);
    if (bytes === null) {
      await this.storage.put("usageFailedAt", now);
      return usage || null;
    }
    const next = { month: policy.monthWindow(now).month, bytes, checkedAt: now };
    await this.storage.put("usage", next);
    return next;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin, extra = {}) {
  return Response.json(body, { status, headers: { ...corsHeaders(origin), "Cache-Control": "no-store", ...extra } });
}

function defaultBudget(env) {
  return async (ipKey) => {
    const stub = env.TURN_BUDGET.get(env.TURN_BUDGET.idFromName("global"));
    const res = await stub.fetch("https://turn-budget/admit", { method: "POST", body: JSON.stringify({ ipKey }) });
    return res.json();
  };
}

const REFUSAL = { rate: [429, "3600"], budget: [503, "3600"], unknown: [503, "300"] };

/** Rota, origem e método. Pedido que não é um `GET /ice-servers` do app: a resposta pronta; senão `null`. */
function rejectOrPreflight(request, env, origin) {
  if (new URL(request.url).pathname !== "/ice-servers") return new Response("not found", { status: 404 });
  if (!policy.isAllowedOrigin(origin, env)) return new Response("origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "GET") return json({ error: "method" }, 405, origin);
  return null;
}

/**
 * Atende um pedido. `deps` troca o orçamento e o `fetch` nos testes.
 * @param {Request} request
 * @param {object} env
 * @param {{ budget?: (ipKey: string) => Promise<{ ok: boolean, reason?: string }>, fetch?: typeof fetch, now?: () => number }} [deps]
 * @returns {Promise<Response>}
 */
export async function handleRequest(request, env, deps = {}) {
  const origin = request.headers.get("Origin") || "";
  return rejectOrPreflight(request, env, origin) || issueCredentials(request, env, deps, origin);
}

/** Orçamento e limite por IP; liberado, pede a credencial ao Cloudflare. */
async function issueCredentials(request, env, deps, origin) {
  const admit = deps.budget || defaultBudget(env);
  const verdict = await admit(await ipKeyOf(request.headers.get("CF-Connecting-IP") || ""));
  if (!verdict?.ok) {
    const [status, retryAfter] = REFUSAL[verdict?.reason] || REFUSAL.unknown;
    return json({ error: verdict?.reason || "unknown" }, status, origin, { "Retry-After": retryAfter });
  }
  const iceServers = await generateIceServers(env, deps.fetch || ((...args) => fetch(...args)));
  if (!iceServers) return json({ error: "upstream" }, 502, origin, { "Retry-After": "300" });
  const now = (deps.now || Date.now)();
  return json({ iceServers, ttl: policy.CREDENTIAL_TTL_S, expiresAt: now + policy.CREDENTIAL_TTL_S * 1000 }, 200, origin);
}

export default {
  /**
   * Ponto de entrada do Worker.
   * @param {Request} request
   * @param {object} env
   * @returns {Promise<Response>}
   */
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
