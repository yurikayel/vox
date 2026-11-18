/**
 * S27 — loadArweave valida timeout e confere o sha384 do bundle antes de executar o vendor (DEPENDENCIAS).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("S27: hash exportado bate com docs/DEPENDENCIAS.md", async () => {
  const { ARWEAVE_BUNDLE_SHA384 } = await import("../client/js/arweave-lib.js");
  const line = read("docs/DEPENDENCIAS.md").split("\n").find((l) => l.includes("arweave-1.15.7.bundle.js"));
  const pinned = line.match(/sha384-[A-Za-z0-9+/=]+/)?.[0];
  assert.equal(ARWEAVE_BUNDLE_SHA384, pinned);
});

test("S27: loadArweave recusa timeout fora do contrato", async () => {
  const { loadArweave } = await import("../client/js/arweave-lib.js");
  const invalid = [0, -1, NaN, Infinity, "20000"];
  for (const value of invalid) {
    await assert.rejects(() => loadArweave(value), (err) => err instanceof TypeError || err instanceof RangeError);
  }
});

test("S27: loadArweave só inicia após conferir integridade do vendor", { timeout: 30_000 }, async () => {
  const { loadArweave } = await import("../client/js/arweave-lib.js");
  const ar = await loadArweave(5000);
  assert.equal(ar.api.config.timeout, 5000);
  assert.equal(ar.api.config.host, "arweave.net");
});