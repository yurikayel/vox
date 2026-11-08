import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("release-metadata: cache_name acompanha o CACHE_NAME do sw.js (REV-03)", () => {
  const sw = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
  const meta = JSON.parse(readFileSync(new URL("../docs/release-metadata.json", import.meta.url), "utf8"));
  const m = sw.match(/const\s+CACHE_NAME\s*=\s*"([^"]+)"/);
  assert.ok(m, "CACHE_NAME não encontrado em client/sw.js");
  assert.equal(
    meta.cache_name,
    m[1],
    "docs/release-metadata.json desatualizado: rode `npm run release-metadata` após trocar o CACHE_NAME",
  );
});
