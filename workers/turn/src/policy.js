/**
 * @file REV-10 — regras puras do Worker de TURN: origens aceitas, limpeza das URLs, janela do mês,
 * consulta de uso ao Cloudflare e limite por IP. Sem rede e sem estado: testável no Node.
 */

/** Origens do app (as mesmas do relay, `relay/request_guard.py`). */
export const APP_ORIGINS = ["https://yurikayel.github.io", "https://vox-9df.pages.dev"];
/** Teto padrão do mês, abaixo dos 1.000 GB grátis divididos com o SFU (pesquisa V5, decisão B9). */
export const DEFAULT_BUDGET_GB = 800;
/** Vida da credencial: cobre uma sessão longa; o Cloudflare aceita até 48 h. */
export const CREDENTIAL_TTL_S = 4 * 60 * 60;
/** Credenciais por IP por hora. Uma pessoa com 3 abas e reconexões fica bem abaixo disso. */
export const IP_LIMIT_PER_HOUR = 30;
/** Uso do mês mais velho que isso é consultado de novo antes de liberar credencial. */
export const USAGE_MAX_AGE_MS = 60 * 60 * 1000;
/** IPs distintos guardados por hora; acima disso, IP novo é recusado (protege a memória do objeto). */
export const MAX_TRACKED_IPS = 5000;

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * A origem pode pedir credencial? App publicado, localhost, ou as liberadas em `ALLOWED_ORIGINS` (vírgulas).
 * @param {string | null} origin
 * @param {{ ALLOWED_ORIGINS?: string }} [env]
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, env = {}) {
  const text = String(origin || "").trim();
  if (!text) return false;
  const extra = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return APP_ORIGINS.includes(text) || extra.includes(text) || LOCALHOST.test(text);
}

const isPort53 = (url) => /:53(\?|$)/.test(url);

/**
 * Tira as URLs na porta 53 (o navegador bloqueia e o ICE espera o tempo esgotar) e entradas sem URL.
 * @param {Array<{ urls: string | string[], username?: string, credential?: string }>} iceServers
 * @returns {Array<{ urls: string[], username?: string, credential?: string }>}
 */
export function filterIceServers(iceServers) {
  const out = [];
  for (const server of Array.isArray(iceServers) ? iceServers : []) {
    const urls = [].concat(server?.urls || []).filter((u) => typeof u === "string" && !isPort53(u));
    if (urls.length) out.push({ ...server, urls });
  }
  return out;
}

const isoDay = (date) => date.toISOString().slice(0, 10);

/**
 * Do primeiro dia do mês (UTC) até hoje: a janela da franquia mensal.
 * @param {number} now
 * @returns {{ month: string, from: string, to: string }}
 */
export function monthWindow(now) {
  const today = new Date(now);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { month: isoDay(first).slice(0, 7), from: isoDay(first), to: isoDay(today) };
}

/**
 * Corpo da consulta GraphQL de uso do TURN (bytes enviados do Cloudflare para as pessoas, os que são cobrados).
 * @param {string} accountId
 * @param {{ from: string, to: string }} window
 * @returns {{ query: string, variables: object }}
 */
export function buildUsageQuery(accountId, { from, to }) {
  const query = `query TurnUsage($accountId: string!, $from: Date!, $to: Date!) {
  viewer { accounts(filter: { accountTag: $accountId }) {
    callsTurnUsageAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) { sum { egressBytes } }
  } }
}`;
  return { query, variables: { accountId, from, to } };
}

/**
 * Soma os bytes da resposta. Resposta com erro ou fora do formato: `null` (uso desconhecido, não zero).
 * @param {any} json
 * @returns {number | null}
 */
export function sumEgressBytes(json) {
  if (!json || (Array.isArray(json.errors) && json.errors.length)) return null;
  const groups = json?.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups;
  if (!Array.isArray(groups)) return null;
  return groups.reduce((total, g) => total + (Number(g?.sum?.egressBytes) || 0), 0);
}

/**
 * Teto do mês em bytes, de `BUDGET_GB` (ou o padrão).
 * @param {{ BUDGET_GB?: string }} [env]
 * @returns {number}
 */
export function budgetBytes(env = {}) {
  const gb = Number(env.BUDGET_GB);
  return (Number.isFinite(gb) && gb > 0 ? gb : DEFAULT_BUDGET_GB) * 1e9;
}

/**
 * Conta mais um pedido do IP na hora corrente. Muda a hora, a contagem recomeça.
 * @param {{ hour: number, counts: Record<string, number> } | null} state
 * @param {string} ipKey
 * @param {number} now
 * @returns {{ allowed: boolean, state: { hour: number, counts: Record<string, number> } }}
 */
export function countRequest(state, ipKey, now) {
  const hour = Math.floor(now / 3_600_000);
  const counts = state?.hour === hour ? { ...state.counts } : {};
  const seen = counts[ipKey] || 0;
  const full = !seen && Object.keys(counts).length >= MAX_TRACKED_IPS;
  if (full || seen >= IP_LIMIT_PER_HOUR) return { allowed: false, state: { hour, counts } };
  counts[ipKey] = seen + 1;
  return { allowed: true, state: { hour, counts } };
}

/**
 * Decide se libera credencial pelo uso do mês. Uso desconhecido ou velho demais: não libera (o teto vale mais
 * que a conveniência; sem TURN, o app segue tentando conexão direta).
 * @param {{ month: string, bytes: number | null, checkedAt: number } | null} usage
 * @param {{ now: number, limitBytes: number }} opts
 * @returns {"ok" | "budget" | "unknown"}
 */
export function budgetVerdict(usage, { now, limitBytes }) {
  if (!usage || usage.bytes === null || usage.month !== monthWindow(now).month) return "unknown";
  if (now - usage.checkedAt > USAGE_MAX_AGE_MS) return "unknown";
  return usage.bytes >= limitBytes ? "budget" : "ok";
}
