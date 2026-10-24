import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  recordGatewayAttempt,
  getGatewayHealthState,
  getGatewayHealthSummary,
  __resetGatewayHealthForTests,
} from "../client/js/gateway-telemetry.js";

test("gateway-telemetry - all_ok sem histórico", () => {
  __resetGatewayHealthForTests();
  assert.equal(getGatewayHealthState(), "all_ok");
});

test("gateway-telemetry - degraded quando falhas superam ok", () => {
  __resetGatewayHealthForTests();
  recordGatewayAttempt("gw-a", false);
  recordGatewayAttempt("gw-a", false);
  recordGatewayAttempt("gw-a", true);
  assert.equal(getGatewayHealthState(), "degraded");
});

test("gateway-telemetry - critical quando só falhas", () => {
  __resetGatewayHealthForTests();
  recordGatewayAttempt("gw-b", false);
  assert.equal(getGatewayHealthState(), "critical");
});

test("gateway-telemetry - summary expõe gateways", () => {
  __resetGatewayHealthForTests();
  recordGatewayAttempt("turbo", true);
  const s = getGatewayHealthSummary();
  assert.ok(s.gateways.turbo);
  assert.equal(s.gateways.turbo.ok, 1);
});
