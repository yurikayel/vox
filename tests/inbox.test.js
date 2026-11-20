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

    const deleted = await inbox.deleteSealed("addr_bob", "dm_123", "ab".repeat(16));
    assert.equal(deleted, true);
    assert.equal(requests[2].options.method, "DELETE");
    assert.equal(requests[2].options.headers["X-Vox-Delete-Token"], "ab".repeat(16), "PM-94: chave de apagar vai no cabeçalho");
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

async function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  localStorage.clear();
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }
}

test("inbox - normalizeRelayHttpBase, limpeza de buddy e deduplicação em getRelayHttpUrls", () => {
  localStorage.clear();
  assert.equal(inbox.normalizeRelayHttpBase(null), null);
  assert.equal(inbox.normalizeRelayHttpBase(""), null);
  assert.equal(inbox.normalizeRelayHttpBase("   "), null);
  assert.equal(
    inbox.normalizeRelayHttpBase("wss://relay.exemplo.com:3921///"),
    "https://relay.exemplo.com:3920",
  );
  assert.deepEqual(inbox.getRelayHttpUrls("   "), ["http://127.0.0.1:3920"]);

  inbox.saveRelayHttpUrl("https://relay.unico.org/");
  inbox.saveRelayBuddyHttpUrl("https://relay.unico.org");
  assert.deepEqual(inbox.getRelayHttpUrls(), ["https://relay.unico.org"]);

  inbox.saveRelayBuddyHttpUrl("");
  assert.equal(inbox.getRelayBuddyHttpUrl(), null);
  localStorage.clear();
});

test("inbox - pushSealed rejeita quando toAddress ou envelope estiverem ausentes", async () => {
  let fetchCalls = 0;
  await withMockFetch(
    async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ status: "queued" }) };
    },
    async () => {
      await assert.rejects(
        () => inbox.pushSealed("vx_alvo", null),
        /toAddress e envelope são obrigatórios/,
      );
      await assert.rejects(
        () => inbox.pushSealed("", { v: 1, id: "dm_1" }),
        /toAddress e envelope são obrigatórios/,
      );
      assert.equal(fetchCalls, 0);
    },
  );
});

test("inbox - pushSealed propaga lastErr em falha total e usa erro padrão quando lastErr é ausente", async () => {
  await withMockFetch(
    async () => ({ ok: false, status: 500, text: async () => "sobrecarregado" }),
    async () => {
      await assert.rejects(
        () => inbox.pushSealed("vx_alvo", { id: "1" }, "https://r1.test"),
        /HTTP 500\): sobrecarregado/,
      );
    },
  );

  await withMockFetch(
    async () => {
      throw new Error("rede indisponivel");
    },
    async () => {
      await assert.rejects(
        () => inbox.pushSealed("vx_alvo", { id: "2" }, "https://r1.test"),
        /rede indisponivel/,
      );
    },
  );

  await withMockFetch(
    async () => ({ ok: true, json: async () => null }),
    async () => {
      await assert.rejects(
        () => inbox.pushSealed("vx_alvo", { id: "3" }, "https://r1.test"),
        /Falha no envio ao inbox em todos os relays configurados/,
      );
    },
  );
});

test("inbox - pushSealed faz failover para o relay buddy quando o primário falha", async () => {
  const urls = [];
  await withMockFetch(
    async (url) => {
      urls.push(url);
      if (url.includes("primario.falha.test")) {
        return { ok: false, status: 503, text: async () => "indisponivel" };
      }
      return { ok: true, json: async () => ({ status: "queued", relay: "buddy" }) };
    },
    async () => {
      inbox.saveRelayHttpUrl("https://primario.falha.test");
      inbox.saveRelayBuddyHttpUrl("https://buddy.ok.test");
      const res = await inbox.pushSealed("vx_destino", { v: 1, id: "dm_failover" });
      assert.deepEqual(res, { status: "queued", relay: "buddy" });
      assert.equal(urls.length, 2);
    },
  );
});

test("inbox - pullMine trata endereço vazio, HTTP não-ok e envelopes fora do formato array", async () => {
  let fetchCalls = 0;
  await withMockFetch(
    async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ envelopes: [{ id: "inesperado" }] }) };
    },
    async () => {
      assert.deepEqual(await inbox.pullMine(""), []);
      assert.equal(fetchCalls, 0);
    },
  );

  await withMockFetch(
    async (url) => {
      if (url.includes("primario.503.test")) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ envelopes: "nao-array" }) };
    },
    async () => {
      inbox.saveRelayHttpUrl("https://primario.503.test");
      inbox.saveRelayBuddyHttpUrl("https://buddy.invalido.test");
      assert.deepEqual(await inbox.pullMine("vx_eu"), []);
    },
  );
});

test("inbox - deleteSealed retorna false sem chamar fetch quando myAddress ou messageId faltam", async () => {
  let fetchCalls = 0;
  await withMockFetch(
    async () => {
      fetchCalls += 1;
      return { ok: true };
    },
    async () => {
      assert.strictEqual(await inbox.deleteSealed("", "dm_1"), false);
      assert.strictEqual(await inbox.deleteSealed("vx_eu", ""), false);
      assert.strictEqual(await inbox.deleteSealed("", ""), false);
      assert.equal(fetchCalls, 0);
    },
  );
});

test("inbox - deleteSealed retorna false em falhas de relay e true quando ao menos um aceita", async () => {
  let seenHeaders = null;
  await withMockFetch(
    async (_url, options) => {
      seenHeaders = options.headers;
      return { ok: false, status: 403 };
    },
    async () => {
      const ok = await inbox.deleteSealed("vx_eu", "dm_1", null, "https://r1.test");
      assert.strictEqual(ok, false);
      assert.deepEqual(seenHeaders, {});
    },
  );

  await withMockFetch(
    async () => {
      throw new Error("timeout de rede");
    },
    async () => {
      const ok = await inbox.deleteSealed("vx_eu", "dm_1", "tok", "https://r1.test");
      assert.strictEqual(ok, false);
    },
  );

  const urls = [];
  await withMockFetch(
    async (url) => {
      urls.push(url);
      return { ok: url.includes("buddy.ok.test"), status: url.includes("buddy.ok.test") ? 200 : 500 };
    },
    async () => {
      inbox.saveRelayHttpUrl("https://primario.err.test");
      inbox.saveRelayBuddyHttpUrl("https://buddy.ok.test");
      assert.strictEqual(await inbox.deleteSealed("vx_eu", "dm_2", "tok"), true);
      assert.equal(urls.length, 2);
    },
  );
});
