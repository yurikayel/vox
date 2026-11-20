/**
 * #306 (cliente): após 413/429 do relay com `Connection: close`, o cliente drena o corpo
 * para o socket fechar sem RST (ex.: erro 10053 no Windows) e o status permanece legível.
 * Espelha o contrato em `docs/specs/relay-api.md` (resposta antecipada).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as centralMemory from "../client/js/central-memory.js";
import { uploadToTurbo, TURBO_ENDPOINTS } from "../client/js/upload.js";

const RELAY_413 = JSON.stringify({ code: "mirror.body_too_large", error: "Corpo acima do teto" });
const RELAY_429 = JSON.stringify({ code: "rate_limit", error: "Muitas requisições", retryAfter: 30 });

function relayRejectedResponse(status, bodyText) {
  return new Response(bodyText, {
    status,
    headers: {
      "Content-Type": "application/json",
      Connection: "close",
      "Content-Length": String(Buffer.byteLength(bodyText, "utf8")),
    },
  });
}

test("relay cliente — readResponseText drena JSON de 413 (mirror.body_too_large)", async () => {
  const { readResponseText } = await import("../client/js/fetch-timeout.js");
  const res = relayRejectedResponse(413, RELAY_413);
  const text = await readResponseText(res);
  assert.equal(text, RELAY_413);
  assert.equal(res.bodyUsed, true);
  assert.match(text, /mirror\.body_too_large/);
});

test("relay cliente — readResponseText drena JSON de 429 (rate_limit)", async () => {
  const { readResponseText } = await import("../client/js/fetch-timeout.js");
  const res = relayRejectedResponse(429, RELAY_429);
  const text = await readResponseText(res);
  assert.equal(text, RELAY_429);
  assert.equal(res.bodyUsed, true);
});

test("relay cliente — central-memory sync drena cada 413 antes de falhar", async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).includes("/memory/sync")) {
      return { ok: false, text: async () => "" };
    }
    const res = relayRejectedResponse(413, RELAY_413);
    seen.push(res);
    assert.equal(options.method, "POST");
    return res;
  };
  try {
    const result = await centralMemory.syncWithCentralMemory();
    assert.equal(result.ok, false);
    assert.ok(seen.length >= 1, "tentou pelo menos um endpoint de memória");
    for (const res of seen) {
      assert.equal(res.bodyUsed, true, "corpo drenado evita RST ao fechar");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("relay cliente — upload Turbo drena 413 e preserva trecho do corpo no erro", async () => {
  const originalFetch = globalThis.fetch;
  const drained = [];
  globalThis.fetch = async (url) => {
    assert.ok(TURBO_ENDPOINTS.some((base) => String(url).startsWith(base)));
    const res = relayRejectedResponse(413, RELAY_413);
    drained.push(res);
    return res;
  };
  try {
    const out = await uploadToTurbo(new Uint8Array([1, 2, 3]));
    assert.equal(out.ok, false);
    assert.equal(out.error?.status, 413);
    assert.match(String(out.error?.message), /413/);
    assert.match(String(out.error?.message), /mirror\.body_too_large/);
    assert.equal(drained.length, TURBO_ENDPOINTS.length);
    for (const res of drained) assert.equal(res.bodyUsed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});