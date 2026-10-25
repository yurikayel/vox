import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const host = await import("../client/js/open-frames-host.js");

test("open-frames-host - rejects unknown message types", () => {
  const msg = host.handleFrameMessage(
    { origin: "https://example.com", data: { type: "evil", payload: {} } },
    { allowedOrigins: ["https://example.com"] },
  );
  assert.equal(msg, null);
});

test("open-frames-host - accepts resize from allowed origin", () => {
  const msg = host.handleFrameMessage(
    { origin: "https://example.com", data: { type: "of:resize", payload: { height: 200 } } },
    { allowedOrigins: ["https://example.com"] },
  );
  assert.equal(msg.type, "of:resize");
  assert.equal(msg.payload.height, 200);
});
