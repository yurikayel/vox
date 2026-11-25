#!/usr/bin/env node
/**
 * Auditoria jurídica/técnica LEG-01..05 (`node scripts/legal-compliance-audit.mjs`).
 *
 * Confere SPDX/LICENSE, mídia versionada, flags BR/CSP/páginas legais, PII em logs
 * do relay/Rust e scripts CDN fora do inventário. Exit 0 só se todas PASS.
 * CLI: `--json` emite `{ results, ok }`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_SPDX = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "CC-BY-4.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "AGPL-3.0-or-later",
  "AGPL-3.0",
]);
const FORBIDDEN_SPDX = /^(?:GPL-2\.0-only|SSPL(?:-1\.0)?|BUSL(?:-1\.1)?|UNLICENSED|PolyForm-[A-Za-z0-9.-]+)$/i;
const RAW_EXT = /\.(?:psd|ai|sketch|fig|zip|rar|exe|apk)$/i;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const MEDIA_ALLOW = [
  "client/icons/",
  "client/images/",
  "docs/branding/",
  "docs/design/stitch-captures/dungeon-ui-",
  "android/res/mipmap-",
  "packaging/",
];
const LEG03_REQUIRED = [
  "client/config/flags.json",
  "client/js/feature-flags.js",
  "client/_headers",
  "client/privacy.html",
  "client/data-deletion.html",
  "client/js/render/about.js",
  "client/js/age-gate.js",
  "client/js/electoral-period.js",
  "docs/legal/licenca-e-contribuicoes.md",
];
const PII = /\b(?:email|cpf|pix|telefone|x-forwarded-for|authorization|password|senha|privateKey)\b/i;
const LOG_LINE = /\b(?:print|logging\.\w+|logger\.\w+|_LOG\.\w+|eprintln!|println!|log::\w+)\b/;
const ERR500_PY = /_send_json\s*\(\s*\{[^}]*\bstr\s*\(\s*(?:error|e|err)\s*\)[^}]*\}\s*,\s*500\b/;
const ERR500_RS = /(?:StatusCode::INTERNAL_SERVER_ERROR|\bstatus\s*\(\s*500\s*\))[\s\S]{0,120}format!\s*\(\s*"\{e\}"/;
const SCRIPT_HTTPS = /<script[^>]*\bsrc=["'](https:\/\/[^"']+)["'][^>]*>/gi;
const JS_HTTPS = /(?:\.src\s*=\s*|loadScript\s*\(\s*|import\s*\(\s*)["'](https:\/\/[^"']+)["']/g;
const ANALYTICS = /googletagmanager|google-analytics\.com|plausible\.io|hotjar|mixpanel|amplitude\.com|segment\.(?:io|com)|doubleclick\.net/i;

/** @returns {{ rule: string, file: string, line: number, reason: string }} */
export function finding(rule, file, line, reason) {
  return { rule, file, line, reason };
}

/** SPDX permitido se algum termo OR (e todos AND nele) estiver na allowlist. */
export function isSpdxAllowed(expr) {
  const trimmed = String(expr || "").trim();
  if (!trimmed || FORBIDDEN_SPDX.test(trimmed)) return false;
  return trimmed.split(/\s+OR\s+/i).some((part) => {
    const andParts = part
      .replace(/[()]/g, "")
      .split(/\s+AND\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    return andParts.length > 0 && andParts.every((p) => ALLOWED_SPDX.has(p));
  });
}

/** LEG-01: licenses do lock + LICENSE AGPL. */
export function checkLeg01(input = {}) {
  const out = [];
  const lockText = input.lockText ?? fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8");
  const licenseText = input.licenseText ?? safeRead(path.join(ROOT, "LICENSE"));
  for (const [pkgPath, meta] of Object.entries(JSON.parse(lockText).packages || {})) {
    const lic = meta?.license;
    const label = pkgPath || ".";
    if (lic == null || lic === "") {
      out.push(finding("LEG-01", "package-lock.json", 0, `${label}: license vazia`));
    } else if (!isSpdxAllowed(String(lic))) {
      out.push(finding("LEG-01", "package-lock.json", 0, `${label}: SPDX incompatível (${lic})`));
    }
  }
  if (!licenseText || !/AGPL-3\.0|GNU AFFERO GENERAL PUBLIC LICENSE/i.test(licenseText)) {
    out.push(finding("LEG-01", "LICENSE", 0, "LICENSE ausente ou sem AGPL-3.0"));
  }
  return out;
}

/** LEG-02: extensões brutas e imagens fora da allowlist. */
export function checkLeg02(files) {
  const out = [];
  for (const file of files) {
    const norm = file.replace(/\\/g, "/");
    if (RAW_EXT.test(norm)) out.push(finding("LEG-02", norm, 0, "extensão bruta versionada"));
    else if (IMAGE_EXT.test(norm) && !MEDIA_ALLOW.some((p) => norm.startsWith(p))) {
      out.push(finding("LEG-02", norm, 0, "imagem fora da allowlist"));
    }
  }
  return out;
}

/** LEG-03: Arweave off, CSP, páginas legais e CC-BY-4.0. */
export function checkLeg03(opts = {}) {
  const read = opts.read || ((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
  const present = new Set(opts.files || LEG03_REQUIRED);
  const out = [];
  for (const req of LEG03_REQUIRED) {
    if (!present.has(req)) {
      out.push(finding("LEG-03", req, 0, "arquivo obrigatório ausente"));
      continue;
    }
    try {
      out.push(...scanLeg03File(req, read(req)));
    } catch {
      out.push(finding("LEG-03", req, 0, "arquivo obrigatório ausente"));
    }
  }
  return out;
}

/** @param {string} file @param {string} text */
function scanLeg03File(file, text) {
  const out = [];
  if (file.endsWith("flags.json") && JSON.parse(text).flags?.arweaveUpload !== false) {
    out.push(finding("LEG-03", file, 0, "arweaveUpload ≠ false"));
  }
  if (file.endsWith("feature-flags.js") && /arweaveUpload\s*:\s*true\b/.test(text)) {
    out.push(finding("LEG-03", file, 0, "arweaveUpload ≠ false"));
  }
  if (file.endsWith("_headers") && /script-src\s+\*/.test(text)) {
    out.push(finding("LEG-03", file, 0, "CSP com script-src *"));
  }
  if (file.endsWith("licenca-e-contribuicoes.md") && !/CC-BY-4\.0/.test(text)) {
    out.push(finding("LEG-03", file, 0, "CC-BY-4.0 ausente"));
  }
  return out;
}

/** LEG-04: PII em logs e 500 com str(error)/format!("{e}"). */
export function checkLeg04(opts = {}) {
  const read = opts.read || ((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
  const files =
    opts.files ||
    trackedFiles().filter((f) => /^relay\/.+\.py$/.test(f) || /^rust\/vox-node\/src\/.+\.rs$/.test(f));
  const out = [];
  for (const file of files) {
    try {
      out.push(...scanLeg04Text(file, read(file)));
    } catch {
      /* skip */
    }
  }
  return out;
}

/** @param {string} file @param {string} text */
function scanLeg04Text(file, text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (LOG_LINE.test(line) && PII.test(line)) out.push(finding("LEG-04", file, i + 1, "log/print com PII"));
  });
  if (file.endsWith(".py") && ERR500_PY.test(text)) {
    out.push(finding("LEG-04", file, 0, "HTTP 500 com str(error)"));
  }
  if (file.endsWith(".rs") && ERR500_RS.test(text)) {
    out.push(finding("LEG-04", file, 0, 'HTTP 500 com format!("{e}")'));
  }
  return out;
}

/** LEG-05: script HTTPS / analytics fora de DEPENDENCIAS.md. */
export function checkLeg05(opts = {}) {
  const read = opts.read || ((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
  const inventory =
    opts.inventoryText ?? fs.readFileSync(path.join(ROOT, "docs/DEPENDENCIAS.md"), "utf8");
  const hosts = inventoriedHosts(inventory);
  const files =
    opts.files ||
    trackedFiles().filter((f) => /^client\/.+\.html$/.test(f) || /^client\/js\/.+\.js$/.test(f));
  const out = [];
  for (const file of files) {
    try {
      out.push(...scanLeg05Text(file, read(file), hosts));
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Hosts HTTPS citados no inventário. */
export function inventoriedHosts(inventory) {
  const hosts = new Set();
  for (const m of inventory.matchAll(/https:\/\/([^/\s`)|]+)/g)) hosts.add(m[1].toLowerCase());
  return hosts;
}

/** @param {string} file @param {string} text @param {Set<string>} hosts */
function scanLeg05Text(file, text, hosts) {
  const out = [];
  for (const re of [SCRIPT_HTTPS, JS_HTTPS]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const host = m[1].replace(/^https:\/\//i, "").split("/")[0].toLowerCase();
      if (!hosts.has(host)) out.push(finding("LEG-05", file, 0, `script CDN não inventariado (${host})`));
    }
  }
  const hit = text.match(ANALYTICS)?.[0];
  if (hit && ![...hosts].some((h) => h.includes(hit.toLowerCase()) || hit.toLowerCase().includes(h))) {
    out.push(finding("LEG-05", file, 0, `analytics não inventariado (${hit})`));
  }
  return out;
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Arquivos versionados (`git ls-files`). */
export function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, "/"));
}

/** Roda LEG-01..05. */
export function runAudit(opts = {}) {
  const files = opts.files || trackedFiles();
  const checks = [
    ["LEG-01", () => checkLeg01(opts.leg01 || {})],
    ["LEG-02", () => checkLeg02(opts.leg02Files || files)],
    ["LEG-03", () => checkLeg03(opts.leg03 || {})],
    ["LEG-04", () => checkLeg04(opts.leg04 || {})],
    ["LEG-05", () => checkLeg05(opts.leg05 || {})],
  ];
  const results = checks.map(([rule, fn]) => {
    const findings = fn();
    return { rule, ok: findings.length === 0, findings };
  });
  return { results, ok: results.every((r) => r.ok) };
}

function printReport(report, asJson) {
  if (asJson) {
    console.log(JSON.stringify(report));
    return;
  }
  for (const r of report.results) {
    if (r.ok) {
      console.log(`[PASS] ${r.rule}`);
      continue;
    }
    for (const f of r.findings) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      console.log(`[FAIL] ${r.rule} — ${loc} — ${f.reason}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runAudit();
  printReport(report, process.argv.includes("--json"));
  process.exitCode = report.ok ? 0 : 1;
}
