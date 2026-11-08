import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUploadError, toHonestError, honestMessage } from "../client/js/honest-errors.js";

test("LAN-21: classifica falhas de envio", () => {
  assert.equal(classifyUploadError(Object.assign(new Error("x"), { status: 402 })), "payment");
  assert.equal(classifyUploadError(new Error("HTTP 429")), "rateLimit");
  assert.equal(classifyUploadError(new Error("Insufficient balance")), "quota");
  assert.equal(classifyUploadError(Object.assign(new Error("signal timed out"), { name: "TimeoutError" })), "timeout");
  assert.equal(classifyUploadError(new TypeError("Failed to fetch")), "offline");
  assert.equal(classifyUploadError(new Error("HTTP 500")), "");
});

test("LAN-21: toHonestError troca o texto e guarda a causa", () => {
  const cause = new Error("HTTP 402");
  const e = toHonestError(cause);
  assert.equal(e.kind, "payment");
  assert.equal(e.cause, cause);
  assert.match(e.message, /pediu pagamento/);
  const other = new Error("HTTP 500");
  assert.equal(toHonestError(other), other);
});

test("LAN-21: todos os estados do backlog têm texto", () => {
  for (const k of ["quota", "payment", "gatewaysDown", "signalingDown", "dmNoRelay"]) {
    assert.ok(honestMessage(k).length > 20, k);
  }
});
