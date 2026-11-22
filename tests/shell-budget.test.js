import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  analyzeShellBudget,
  classifyAssetCategory,
  estimateSlow3gTransfer,
  extractCriticalBootPaths,
  extractShellAssets,
} from "../scripts/shell-budget-check.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = path.join(ROOT, "scripts", "shell-budget-check.mjs");

function createSyntheticClient(files, shellAssets, indexHtml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-shell-budget-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  const swContent = `const SHELL_ASSETS = [\n${shellAssets.map((a) => `  "${a}",`).join("\n")}\n];\n`;
  fs.writeFileSync(path.join(dir, "sw.js"), swContent);
  fs.writeFileSync(path.join(dir, "index.html"), indexHtml);
  return dir;
}

test("LAN-23 real repository check passes default budgets with zero missing assets", () => {
  const report = analyzeShellBudget();
  assert.equal(report.ok, true, `Expected pass, got breaches: ${report.breaches.join("; ")}`);
  assert.deepEqual(report.missingAssets, []);
  assert.deepEqual(report.criticalBoot.missingAssets, []);
  assert.ok(report.assetCount > 100);
  assert.ok(report.totals.rawBytes > 0);
  assert.ok(report.totals.gzipBytes > 0 && report.totals.gzipBytes < report.totals.rawBytes);
  assert.ok(report.criticalBoot.slow3g.totalMs < 3000);
  assert.equal(report.topAssets.length, 10);
  for (let i = 1; i < report.topAssets.length; i++) {
    assert.ok(report.topAssets[i - 1].rawBytes >= report.topAssets[i].rawBytes);
  }
});

test("LAN-23 missing asset in SHELL_ASSETS fails budget gate", () => {
  const dir = createSyntheticClient(
    { "js/app.js": "console.log('ok');\n" },
    ["./", "./index.html", "./js/app.js", "./js/missing.js"],
    '<!doctype html><html><head></head><body><script type="module" src="js/app.js"></script></body></html>',
  );
  try {
    const report = analyzeShellBudget({ clientDir: dir });
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingAssets, ["js/missing.js"]);
    assert.ok(report.breaches.some((b) => b.includes("Missing precache assets")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LAN-23 raw, gzip, and Slow 3G boot-ms budget breaches return ok: false", () => {
  const bigJs = "const x = '" + "a1b2c3d4e5f6".repeat(2000) + "';\n";
  const dir = createSyntheticClient(
    { "css/style.css": "body{margin:0}", "js/app.js": bigJs },
    ["./index.html", "./css/style.css", "./js/app.js"],
    '<html><head><link rel="stylesheet" href="css/style.css"></head><body><script src="js/app.js"></script></body></html>',
  );
  try {
    const rawFail = analyzeShellBudget({ clientDir: dir, maxRawBytes: 500 });
    assert.equal(rawFail.ok, false);
    assert.ok(rawFail.breaches.some((b) => b.includes("Raw precache")));

    const gzFail = analyzeShellBudget({ clientDir: dir, maxGzipBytes: 50 });
    assert.equal(gzFail.ok, false);
    assert.ok(gzFail.breaches.some((b) => b.includes("Gzip precache")));

    const bootFail = analyzeShellBudget({ clientDir: dir, maxBootMs: 100 });
    assert.equal(bootFail.ok, false);
    assert.ok(bootFail.breaches.some((b) => b.includes("Critical boot Slow 3G")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LAN-23 category breakdown and top-N sorting are accurate across all categories", () => {
  const files = {
    "js/app.js": "export const a = 1;\n",
    "js/vendor/lib.js": "/* vendor */" + "x".repeat(400),
    "css/app.css": "body { color: #111; }\n" + "/* pad */".repeat(30),
    "icons/logo.svg": "<svg></svg>",
    "config/flags.json": '{"ok":true}',
  };
  const assets = ["./index.html", ...Object.keys(files).map((f) => `./${f}`)];
  const dir = createSyntheticClient(files, assets, "<html><head></head><body></body></html>");
  try {
    const report = analyzeShellBudget({ clientDir: dir, topN: 3 });
    assert.equal(report.ok, true);
    assert.equal(report.categories.js.count, 1);
    assert.equal(report.categories.vendor.count, 1);
    assert.equal(report.categories.css.count, 1);
    assert.equal(report.categories.html.count, 1);
    assert.equal(report.categories["icons/media"].count, 1);
    assert.equal(report.categories.other.count, 1);
    assert.equal(report.topAssets.length, 3);
    assert.equal(report.topAssets[0].path, "js/vendor/lib.js");
    assert.equal(report.topAssets[1].path, "css/app.css");
    assert.equal(classifyAssetCategory("js/vendor/dep.js"), "vendor");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LAN-23 safe parsing ignores comments and external tags without eval", () => {
  const sw = `
    // const SHELL_ASSETS = ["./fake.js"];
    const SHELL_ASSETS = [
      "./index.html", // inline comment "./ignored.js"
      /* block "./also-ignored.js" */
      './js/app.js',
    ];
  `;
  assert.deepEqual(extractShellAssets(sw), ["./index.html", "./js/app.js"]);

  const html = `
    <!-- <script src="js/commented.js"></script> -->
    <link href="css/a.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.example.com/ext.css">
    <script src="https://accounts.google.com/gsi/client"></script>
    <script type="module" src="js/app.js"></script>
  `;
  assert.deepEqual(extractCriticalBootPaths(html), ["index.html", "css/a.css", "js/app.js"]);
  const transfer = estimateSlow3gTransfer(75_000, { rtts: 2 });
  assert.equal(transfer.latencyMs, 800);
  assert.equal(transfer.transferMs, 800);
  assert.equal(transfer.totalMs, 1600);
});

test("LAN-23 CLI --json outputs valid JSON and exits 1 on budget breach", () => {
  const stdout = execFileSync(process.execPath, [CLI_PATH, "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.ok(typeof parsed.assetCount === "number" && parsed.assetCount > 0);
  assert.ok(typeof parsed.totals?.rawBytes === "number");
  assert.ok(typeof parsed.totals?.gzipBytes === "number");
  assert.ok(typeof parsed.criticalBoot?.slow3g?.totalMs === "number");
  assert.ok(typeof parsed.precacheTransfer?.slow3g?.totalMs === "number");
  assert.ok(Array.isArray(parsed.topAssets) && parsed.topAssets.length === 10);

  const failRun = spawnSync(
    process.execPath,
    [CLI_PATH, "--json", "--max-boot-ms", "1"],
    { encoding: "utf8" },
  );
  assert.equal(failRun.status, 1);
  const failParsed = JSON.parse(failRun.stdout);
  assert.equal(failParsed.ok, false);
  assert.ok(failParsed.breaches.length > 0);
});
