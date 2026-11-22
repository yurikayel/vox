/**
 * Anti-drift parity test between the JS source of truth (`client/js/genesis.js`,
 * `client/js/data/test-route-ids.js`) and `rust/vox-core/src/genesis_data.rs`,
 * plus verification that `rust/Cargo.lock` has zero external dependencies (ADR-039).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GENESIS_MS } from "../client/js/genesis.js";
import { TEST_ROUTE_IDS } from "../client/js/data/test-route-ids.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readUtf8Direct(relPath) {
  try {
    return readFileSync(join(ROOT, relPath), "utf8");
  } catch (err) {
    assert.fail(`Não foi possível ler ${relPath}: ${err.message}`);
  }
}

function parseRustGenesisMs(src) {
  const match = src.match(/pub\s+const\s+GENESIS_MS\s*:\s*i64\s*=\s*([0-9_]+)\s*;/);
  assert.ok(match, "GENESIS_MS não encontrado em rust/vox-core/src/genesis_data.rs");
  return Number(match[1].replaceAll("_", ""));
}

function parseRustTestRouteIds(src) {
  const block = src.match(/pub\s+const\s+TEST_ROUTE_IDS\s*:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/);
  assert.ok(block, "TEST_ROUTE_IDS não encontrado em rust/vox-core/src/genesis_data.rs");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function parseLockPackageNames(lockText) {
  return [...lockText.matchAll(/^\[\[package\]\]\r?\nname\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
}

test("rust/vox-core genesis_data.rs matches JS GENESIS_MS and TEST_ROUTE_IDS 100%", () => {
  const rustSrc = readUtf8Direct("rust/vox-core/src/genesis_data.rs");
  assert.equal(parseRustGenesisMs(rustSrc), GENESIS_MS);
  const rustIds = parseRustTestRouteIds(rustSrc);
  const jsSet = new Set(TEST_ROUTE_IDS);
  const rustSet = new Set(rustIds);
  const missing = TEST_ROUTE_IDS.filter((id) => !rustSet.has(id));
  const extra = rustIds.filter((id) => !jsSet.has(id));
  assert.equal(rustIds.length, TEST_ROUTE_IDS.length, "contagem de TEST_ROUTE_IDS diverge");
  assert.deepEqual(missing, [], "IDs do JS ausentes em Rust");
  assert.deepEqual(extra, [], "IDs extras em Rust fora da lista JS");
});

test("rust/Cargo.lock contains zero external crate dependencies (only vox-core)", () => {
  const lockText = readUtf8Direct("rust/Cargo.lock");
  const pkgs = parseLockPackageNames(lockText);
  assert.deepEqual(pkgs, ["vox-core"], "rust/Cargo.lock deve conter apenas vox-core");
  assert.ok(!/^dependencies\s*=/m.test(lockText), "vox-core não pode ter dependências externas");
});
