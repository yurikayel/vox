import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "embed");
const js = fs.readFileSync(path.join(root, "vox-embed.js"), "utf8");

test("vox-embed - reads data-topic and data-base attributes", () => {
  assert.match(js, /data-topic/);
  assert.match(js, /data-base/);
  assert.match(js, /data-ref/);
  assert.match(js, /#/);
});

test("vox-embed - demo.html loads script", () => {
  const html = fs.readFileSync(path.join(root, "demo.html"), "utf8");
  assert.ok(html.includes("vox-embed.js"));
});
