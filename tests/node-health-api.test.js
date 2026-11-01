import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { pingNodeEndpoint, pingNodeList } from "../client/js/node-health-api.js";
import { NODE_STATUS } from "../client/js/node-health-model.js";

test("node-health-api - pingNodeEndpoint com resposta rápida classifica como healthy", async () => {
  const mockFetch = async () => ({ ok: true, status: 200 });
  const result = await pingNodeEndpoint("https://node-fast.vox.org", 500, mockFetch);

  assert.equal(result.url, "https://node-fast.vox.org");
  assert.equal(result.status, NODE_STATUS.HEALTHY);
  assert.equal(result.error, null);
  assert.ok(result.latencyMs >= 0);
});

test("node-health-api - pingNodeEndpoint com latência artificial classifica degraded", async () => {
  const mockFetch = async () => {
    await new Promise((r) => setTimeout(r, 320));
    return { ok: true, status: 200 };
  };
  const result = await pingNodeEndpoint("https://node-slow.vox.org", 1000, mockFetch);

  assert.equal(result.url, "https://node-slow.vox.org");
  assert.equal(result.status, NODE_STATUS.DEGRADED);
  assert.equal(result.error, null);
  assert.ok(result.latencyMs >= 300);
});

test("node-health-api - pingNodeEndpoint com falha de rede retorna offline", async () => {
  const mockFetch = async () => {
    throw new Error("Failed to fetch");
  };
  const result = await pingNodeEndpoint("https://node-dead.vox.org", 500, mockFetch);

  assert.equal(result.url, "https://node-dead.vox.org");
  assert.equal(result.status, NODE_STATUS.OFFLINE);
  assert.equal(result.error, "network_error");
});

test("node-health-api - pingNodeEndpoint com timeout aborta e marca erro de timeout", async () => {
  const mockFetch = async (_url, opts) => {
    return new Promise((resolve, reject) => {
      opts.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };

  const result = await pingNodeEndpoint("https://node-hang.vox.org", 50, mockFetch);
  assert.equal(result.url, "https://node-hang.vox.org");
  assert.equal(result.status, NODE_STATUS.OFFLINE);
  assert.equal(result.error, "timeout");
});

test("node-health-api - pingNodeList executa sondagens paralelas com robustez", async () => {
  const mockFetch = async (url) => {
    if (url.includes("fail")) throw new Error("Offline node");
    return { ok: true, status: 200 };
  };

  const targets = ["https://ok1.org", "https://fail.org", "https://ok2.org"];
  const results = await pingNodeList(targets, 200, mockFetch);

  assert.equal(results.length, 3);
  assert.equal(results[0].status, NODE_STATUS.HEALTHY);
  assert.equal(results[1].status, NODE_STATUS.OFFLINE);
  assert.equal(results[2].status, NODE_STATUS.HEALTHY);
});
