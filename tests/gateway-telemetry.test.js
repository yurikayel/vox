import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  recordGatewayAttempt,
  recordReadOrigin,
  getGatewayHealthState,
  getGatewayHealthSummary,
  getReadOriginAggregate,
  READ_ORIGIN_MIN_SAMPLE,
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

test("gateway-telemetry - read_origin agrega só com amostra mínima", () => {
  __resetGatewayHealthForTests();
  const comm = "praça-teste";
  for (let i = 0; i < READ_ORIGIN_MIN_SAMPLE - 1; i++) {
    recordReadOrigin("mesh", comm);
  }
  let agg = getReadOriginAggregate(comm);
  assert.equal(agg.total, READ_ORIGIN_MIN_SAMPLE - 1);
  assert.equal(agg.sufficient, false);
  assert.equal(agg.localReadPct, null);

  recordReadOrigin("gateway", comm);
  agg = getReadOriginAggregate(comm);
  assert.equal(agg.total, READ_ORIGIN_MIN_SAMPLE);
  assert.equal(agg.sufficient, true);
  assert.equal(agg.localReadPct, 80);

  recordReadOrigin("cache_idb", comm);
  agg = getReadOriginAggregate(comm);
  assert.equal(agg.localReadPct, 85);
});

test("gateway-telemetry - read_origin ignora comunidade vazia", () => {
  __resetGatewayHealthForTests();
  recordReadOrigin("relay", "");
  assert.equal(getReadOriginAggregate("").total, 0);
});
