import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, classifyRejection, summarize, loadConfiguredRelays } from "../scripts/nostr-smoke.mjs";

test("nostr-smoke - parseArgs lê --json, --timeout e relays", () => {
  const o = parseArgs(["--json", "out.json", "--timeout", "5000", "wss://a.example", "lixo"]);
  assert.equal(o.json, "out.json");
  assert.equal(o.timeout, 5000);
  assert.deepEqual(o.relays, ["wss://a.example"]);
});

test("nostr-smoke - classifyRejection reconhece auth, PoW, pagamento e limite", () => {
  assert.equal(classifyRejection("auth-required: we only accept events from registered users"), "auth");
  assert.equal(classifyRejection("pow: difficulty 20 is required"), "pow");
  assert.equal(classifyRejection("blocked: you must pay to write"), "pagamento");
  assert.equal(classifyRejection("rate-limited: slow down"), "limite de taxa");
  assert.equal(classifyRejection(""), "");
});

test("nostr-smoke - summarize conta relays que aceitaram e repassaram", () => {
  const s = summarize([
    { relay: "wss://a", connected: true, accepted: true, relayed: true, latencyMs: 200, reason: "" },
    { relay: "wss://b", connected: true, accepted: false, relayed: false, latencyMs: null, reason: "pagamento" },
  ]);
  assert.equal(s.ok, 1);
  assert.equal(s.total, 2);
  assert.ok(s.markdown.includes("**1/2**"));
  assert.ok(s.markdown.includes("pagamento"));
});

test("nostr-smoke - pool configurado não tem relay pago conhecido", () => {
  const relays = loadConfiguredRelays();
  assert.ok(relays.length >= 5);
  assert.ok(!relays.includes("wss://eden.nostr.land"));
});
