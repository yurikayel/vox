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

  inbox.saveRelayHttpUrl("https://relay.vps.br:8443");
  assert.equal(inbox.getRelayHttpUrl(), "https://relay.vps.br:8443");

  inbox.saveRelayHttpUrl("192.168.1.50:3920");
  assert.equal(inbox.getRelayHttpUrl(), "http://192.168.1.50:3920");

  inbox.saveRelayHttpUrl("");
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

test("inbox - getRelayBuddyHttpUrl e getRelayHttpUrls (cascata e failover)", () => {
  localStorage.clear();
  assert.equal(inbox.getRelayBuddyHttpUrl(), null);
  assert.deepEqual(inbox.getRelayHttpUrls(), ["http://127.0.0.1:3920"]);

  inbox.saveRelayHttpUrl("https://relay.primario.org");
  inbox.saveRelayBuddyHttpUrl("https://relay.buddy.org");
  assert.equal(inbox.getRelayHttpUrl(), "https://relay.primario.org");
  assert.equal(inbox.getRelayBuddyHttpUrl(), "https://relay.buddy.org");
  assert.deepEqual(inbox.getRelayHttpUrls(), [
    "https://relay.primario.org",
    "https://relay.buddy.org",
  ]);

  // Sobrescreve com baseUrl explícito
  assert.deepEqual(inbox.getRelayHttpUrls("https://custom.relay.org"), [
    "https://custom.relay.org",
  ]);
});

test("inbox - pullMine faz failover automático para o relay buddy quando o primário cai", async () => {
  localStorage.clear();
  inbox.saveRelayHttpUrl("https://relay.primario.fora.org");
  inbox.saveRelayBuddyHttpUrl("https://relay.buddy.online.org");

  const originalFetch = globalThis.fetch;
  const queriedUrls = [];

  globalThis.fetch = async (url) => {
    queriedUrls.push(url);
    if (url.includes("primario.fora.org")) {
      throw new Error("Connection refused: 502 Bad Gateway");
    }
    if (url.includes("buddy.online.org")) {
      return {
        ok: true,
        json: async () => ({ envelopes: [{ v: 1, id: "msg_buddy_rescue", ct: "salvo_pelo_buddy" }] }),
      };
    }
    return { ok: false };
  };

  try {
    const envelopes = await inbox.pullMine("minha_carteira");
    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0].id, "msg_buddy_rescue");
    assert.equal(queriedUrls.length, 2);
    assert.ok(queriedUrls[0].includes("primario.fora.org"));
    assert.ok(queriedUrls[1].includes("buddy.online.org"));
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }
});
