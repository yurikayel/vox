import test from "node:test";
import assert from "node:assert/strict";

function validateBridgePosse(data) {
  if (!data || typeof data !== "object") return false;
  if (data.v !== 1) return false;
  if (data.type !== "vox-bridge-posse") return false;
  if (!String(data.topicId || "").trim()) return false;
  if (!String(data.canonicalUrl || "").trim()) return false;
  return true;
}

test("vox-bridge - posse message schema", () => {
  assert.ok(
    validateBridgePosse({
      v: 1,
      type: "vox-bridge-posse",
      topicId: "top_x",
      canonicalUrl: "https://example/#/t/top_x",
      title: "T",
    }),
  );
  assert.ok(!validateBridgePosse({ v: 1, type: "other" }));
});
