/**
 * @file Transporte GraphQL: configuração de gateways, consulta e leitura raw.
 */

import { fetchWithTimeout, readResponseText } from "./fetch-timeout.js";
import { honestMessage } from "./honest-errors.js";
import { recordGatewayAttempt } from "./gateway-telemetry.js";
import { filterGraphqlData } from "./genesis.js";
import { QUERIES } from "./graphql-queries.js";
import { clearInFlight, dedupeAsync } from "./shared/async-dedupe.js";

const GATEWAY_TIMEOUT_MS = 8000;

let gatewayConfig = null;

/**
 * Carrega Config do armazenamento ou rede (deduplicando chamadas concorrentes).
 * @returns {*} Resultado da operação.
 */
export async function loadConfig() {
  if (gatewayConfig) return gatewayConfig;
  return dedupeAsync("gateway:config", async () => {
    const res = await fetchWithTimeout("./config/gateways.json");
    gatewayConfig = await res.json();
    return gatewayConfig;
  });
}

/**
 * PM-50: só gateways com URL GraphQL entram nas consultas.
 * @param {*} [cfg] Configuração carregada.
 * @returns {*} Resultado da operação.
 */
export function graphqlGateways(cfg) {
  return (cfg?.gateways || []).filter((gw) => typeof gw.graphql === "string" && gw.graphql.startsWith("http"));
}

/** Reset de estado interno para testes. */
export function __resetGatewayConfigForTests() {
  gatewayConfig = null;
  clearInFlight("gateway:");
}

/**
 * POST GraphQL em um gateway.
 * @param {string} gqlUrl
 * @param {string} query
 * @param {object} variables
 * @returns {*} Resultado da operação.
 */
export async function queryOne(gqlUrl, query, variables) {
  const res = await fetchWithTimeout(gqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }, { timeoutMs: GATEWAY_TIMEOUT_MS });
  let json;
  if (typeof res.text === "function") {
    const raw = await readResponseText(res, 4096);
    if (!res.ok) throw new Error(`HTTP ${res.status}${raw ? `: ${raw.slice(0, 200)}` : ""}`);
    json = JSON.parse(raw);
  } else {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  }
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return filterGraphqlData(json.data);
}

/**
 * Tenta gateways em ordem até um responder.
 * @param {Function} fn
 * @returns {*} Resultado da operação.
 */
export async function withGateways(fn) {
  const cfg = await loadConfig();
  let lastErr = null;
  for (const gw of graphqlGateways(cfg)) {
    const label = gw.label || gw.graphql || "gateway";
    try {
      const data = await fn(gw.graphql);
      recordGatewayAttempt(label, true);
      return { data, gateway: gw.label };
    } catch (e) {
      recordGatewayAttempt(label, false);
      lastErr = e;
    }
  }
  const err = new Error(honestMessage("gatewaysDown"));
  err.kind = "gatewaysDown";
  err.cause = lastErr;
  throw err;
}

/**
 * Consulta todos os gateways GraphQL (PM-50 corroboração).
 * @param {*} [query]
 * @param {*} [variables]
 * @returns {*} Resultado da operação.
 */
export async function queryAllGateways(query, variables) {
  const cfg = await loadConfig();
  const gateways = graphqlGateways(cfg);
  const results = [];

  for (const gw of gateways) {
    const label = gw.label || gw.graphql || "gateway";
    try {
      const data = await queryOne(gw.graphql, query, variables);
      recordGatewayAttempt(label, true);
      results.push({ gateway: label, data });
    } catch {
      recordGatewayAttempt(label, false);
    }
  }
  return results;
}

/**
 * Registra a aresta no mapa, ligando-a ao gateway de origem.
 * @param {Map<string, object>} edgeMap Mapa de arestas
 * @param {object} edge Aresta
 * @param {string} gateway Gateway de origem
 */
function recordEdgeInMap(edgeMap, edge, gateway) {
  const id = edge.node?.id;
  if (!id) return;
  if (!edgeMap.has(id)) {
    edgeMap.set(id, {
      node: edge.node,
      cursor: edge.cursor,
      witnesses: [gateway],
      conflict: false,
    });
    return;
  }
  const item = edgeMap.get(id);
  item.witnesses.push(gateway);
  if (item.node?.owner?.address !== edge.node?.owner?.address) {
    item.conflict = true;
  }
}

/**
 * Mescla arestas de tópico com contagem de testemunhas.
 * @param {*} [gatewayResults]
 * @returns {*} Resultado da operação.
 */
export function mergeTopicEdgesWithConsensus(gatewayResults) {
  const edgeMap = new Map();
  for (const res of gatewayResults || []) {
    for (const edge of res.data?.transactions?.edges || []) {
      recordEdgeInMap(edgeMap, edge, res.gateway);
    }
  }

  return Array.from(edgeMap.values()).map((item) => ({
    node: item.node,
    cursor: item.cursor,
    crossChecked: item.witnesses.length >= 2,
    consensusCount: item.witnesses.length,
    witnesses: item.witnesses,
    conflict: item.conflict,
  }));
}

/**
 * Monta as URLs de leitura direta de uma transação nos gateways.
 * @param {object} cfg Configuração dos gateways
 * @param {string} txId Id da transação
 * @returns {string[]} URLs.
 */
function rawUrlsForTx(cfg, txId) {
  const urls = [];
  for (const gw of cfg.gateways || []) {
    if (typeof gw.raw === "string" && gw.raw.includes("{txId}")) {
      urls.push(gw.raw.replace("{txId}", txId));
    }
  }
  if (!urls.length) {
    urls.push(`https://arweave.net/${txId}`, `https://turbo-gateway.com/raw/${txId}`);
  }
  return urls;
}

/**
 * Interpreta o texto devolvido pelo gateway (JSON ou texto puro).
 * @param {string} text Texto recebido
 * @returns {object} Corpo e texto bruto.
 */
function parseGatewayRawPayload(text) {
  const parsed = { body: text, raw: text };
  try {
    const json = JSON.parse(text);
    if (typeof json === "object" && json !== null) {
      if (typeof json.body === "string") {
        parsed.body = json.body;
      } else if (typeof json.content === "string") {
        parsed.body = json.content;
      } else if (typeof json.text === "string") {
        parsed.body = json.text;
      } else {
        parsed.body = "";
      }
      parsed.title = typeof json.title === "string" ? json.title : "";
      if (json.mediaTx) parsed.mediaTx = json.mediaTx;
      if (json.communityId) parsed.communityId = json.communityId;
    }
  } catch {
    /* não-JSON */
  }
  return parsed;
}

/**
 * Diz se a resposta de leitura direta é utilizável (não vazia nem HTML).
 * @param {Response} res Resposta
 * @param {string} text Texto lido
 * @returns {boolean} `true` se válida.
 */
function isValidRawResponse(res, text) {
  if (!res.ok) return false;
  const ctype = res.headers?.get?.("content-type") || "";
  if (ctype.includes("text/html")) return false;
  const trimmed = text.trim().toLowerCase();
  return !trimmed.startsWith("<!doctype html") && !trimmed.startsWith("<html");
}

/**
 * Tenta ler a transação em uma URL, com timeout.
 * @param {string} url Endereço
 * @param {string} label Nome do gateway
 * @returns {Promise<object|null>} Resultado, ou `null` se falhar.
 */
async function tryFetchRawFromUrl(url, label) {
  try {
    const res = await fetchWithTimeout(url, {}, { timeoutMs: 6000 });
    const text = await res.text();
    if (!isValidRawResponse(res, text)) {
      recordGatewayAttempt(label, false);
      return null;
    }
    const parsed = parseGatewayRawPayload(text);
    recordGatewayAttempt(label, true);
    return parsed;
  } catch {
    recordGatewayAttempt(label, false);
    return null;
  }
}

/**
 * Lê transação raw nos gateways configurados.
 * @param {string} txId
 * @returns {*} Resultado da operação.
 */
export async function fetchRawFromGateways(txId) {
  const cfg = await loadConfig();
  const tried = new Set();
  for (const gw of cfg.gateways || []) {
    if (typeof gw.raw !== "string" || !gw.raw.includes("{txId}")) continue;
    const url = gw.raw.replace("{txId}", txId);
    if (tried.has(url)) continue;
    tried.add(url);
    const parsed = await tryFetchRawFromUrl(url, gw.label || url);
    if (parsed) return parsed;
  }
  for (const url of rawUrlsForTx(cfg, txId)) {
    if (tried.has(url)) continue;
    tried.add(url);
    const parsed = await tryFetchRawFromUrl(url, url);
    if (parsed) return parsed;
  }
  return null;
}

export { QUERIES };