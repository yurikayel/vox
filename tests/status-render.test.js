import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as render from "../client/js/render.js";

function createContainer() {
  return { innerHTML: "" };
}

test("renderStatusPage - shows gateway state and relay", () => {
  const main = createContainer();
  Object.defineProperty(main, "innerHTML", {
    set(v) {
      this._html = v;
    },
    get() {
      return this._html || "";
    },
  });
  render.renderStatusPage(main, {
    gatewayHealth: { state: "degraded", gateways: { arweave_net: { ok: 1, fail: 3 } } },
    relayStatus: { online: false },
    relayHttpUrl: "http://127.0.0.1:8787",
  });
  assert.ok(main.innerHTML.includes("degraded"));
  assert.ok(main.innerHTML.includes("arweave_net"));
  assert.ok(main.innerHTML.includes("Offline"));
});
