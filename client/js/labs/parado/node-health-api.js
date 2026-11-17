/**
 * Cliente de Ping e Telemetria de Nós (Fase Piloto 1-3-9 / A2 junior-api)
 * Realiza sondagens HTTP/WS leves para medir latência com abort de timeout.
 */

import { createNodeHealthRecord, NODE_STATUS } from "./node-health-model.js";
import { classifyNodeStatus } from "./node-health-evaluator.js";

const DEFAULT_TIMEOUT_MS = 2500;

export async function pingNodeEndpoint(url, timeoutMs = DEFAULT_TIMEOUT_MS, fetchFn = null) {
  const runner = fetchFn || (typeof fetch === "function" ? fetch : null);
  if (!runner || !url) {
    return createNodeHealthRecord({ url, status: NODE_STATUS.OFFLINE, error: "no_fetch_client" });
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const start = Date.now();

  try {
    const opts = { method: "HEAD", signal: controller?.signal, cache: "no-store" };
    await runner(url, opts);
    const latencyMs = Math.max(1, Date.now() - start);
    const status = classifyNodeStatus(latencyMs);
    return createNodeHealthRecord({ url, latencyMs, status });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isAbort = err?.name === "AbortError";
    const status = NODE_STATUS.OFFLINE;
    return createNodeHealthRecord({ url, latencyMs, status, error: isAbort ? "timeout" : "network_error" });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function pingNodeList(urls = [], timeoutMs = DEFAULT_TIMEOUT_MS, fetchFn = null) {
  if (!Array.isArray(urls)) return [];
  const tasks = urls.map((u) => pingNodeEndpoint(u, timeoutMs, fetchFn));
  const results = await Promise.allSettled(tasks);
  return results.map((res, idx) => {
    if (res.status === "fulfilled") return res.value;
    return createNodeHealthRecord({ url: urls[idx], status: NODE_STATUS.OFFLINE, error: "failed" });
  });
}
