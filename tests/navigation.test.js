/**
 * Desvio de roteamento (`navigation.js`): quebra o ciclo de import entre telas e `route.js`.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { route, setRoute } from "../client/js/app/navigation.js";

describe("navigation — desvio do roteador", () => {
  it("route() chama a implementação registrada por setRoute", async () => {
    let calls = 0;
    setRoute(async () => {
      calls += 1;
    });
    await route();
    assert.equal(calls, 1);
  });

  it("setRoute substitui a implementação anterior", async () => {
    const order = [];
    setRoute(async () => {
      order.push("a");
    });
    setRoute(async () => {
      order.push("b");
    });
    await route();
    assert.deepEqual(order, ["b"]);
  });
});