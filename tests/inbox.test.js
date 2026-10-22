import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as inbox from "../client/js/inbox.js";

test("inbox - getRelayHttpUrl resolução de endpoints", () => {
  localStorage.clear();
  assert.equal(inbox.getRelayHttpUrl(), "http://127.0.0.1:3920");

  localStorage.setItem("vox-custom-signaling-url", "ws://127.0.0.1:3921");
  assert.equal(inbox.getRelayHttpUrl(), "http://127.0.0.1:3920");

  localStorage.setItem("vox-custom-signaling-url", "wss://signal.exemplo.com");
  assert.equal(inbox.getRelayHttpUrl(), "https://signal.exemplo.com");
});

test("inbox - pushSealed, pullMine e deleteSealed com mock de fetch", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === "POST") {
      return {
        ok: true,
        json: async () => ({ status: "queued", id: "dm_123" }),
      };
    }
    if (options.method === "DELETE") {
      return { ok: true };
    }
    // GET
    return {
      ok: true,
      json: async () => ({
        envelopes: [{ v: 1, id: "dm_123", ct: "abc" }],
      }),
    };
  };

  try {
    const pushRes = await inbox.pushSealed("addr_bob", { v: 1, id: "dm_123", ct: "abc" });
    assert.equal(pushRes.status, "queued");
    assert.equal(requests[0].options.method, "POST");

    const pulled = await inbox.pullMine("addr_bob");
    assert.equal(pulled.length, 1);
    assert.equal(pulled[0].id, "dm_123");

    const deleted = await inbox.deleteSealed("addr_bob", "dm_123");
    assert.equal(deleted, true);
    assert.equal(requests[2].options.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
