/**
 * LEG-01..05 — fixtures positivas/negativas sem rede.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkLeg01,
  checkLeg02,
  checkLeg03,
  checkLeg04,
  checkLeg05,
  isSpdxAllowed,
  runAudit,
} from "../scripts/legal-compliance-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function lockWith(license) {
  return JSON.stringify({
    packages: {
      "": { name: "vox", license: "AGPL-3.0-or-later" },
      "node_modules/x": { license },
    },
  });
}

test("LEG-01: BUSL falha; MIT passa; LICENSE sem AGPL falha", () => {
  assert.equal(isSpdxAllowed("BUSL-1.1"), false);
  assert.ok(checkLeg01({ lockText: lockWith("BUSL-1.1"), licenseText: "AGPL-3.0" }).length > 0);
  assert.equal(checkLeg01({ lockText: lockWith("MIT"), licenseText: "AGPL-3.0-or-later" }).length, 0);
  assert.ok(checkLeg01({ lockText: lockWith("MIT"), licenseText: "MIT only" }).some((f) => f.file === "LICENSE"));
  assert.ok(isSpdxAllowed("MIT OR Apache-2.0"));
});

test("LEG-02: .psd e imagem fora da allowlist falham; dungeon-ui passa", () => {
  const bad = checkLeg02(["draft.psd", "tmp/shot.png"]);
  assert.ok(bad.some((f) => f.file === "draft.psd"));
  assert.ok(bad.some((f) => f.file === "tmp/shot.png"));
  assert.equal(checkLeg02(["docs/design/stitch-captures/dungeon-ui-2026-11-20__a.png"]).length, 0);
});

test("LEG-03: arweaveUpload true falha; tip real passa (smoke)", () => {
  const files = {
    "client/config/flags.json": JSON.stringify({ flags: { arweaveUpload: true } }),
    "client/js/feature-flags.js": "export const FLAGS = { arweaveUpload: false };",
    "client/_headers": "Content-Security-Policy: script-src 'self'",
    "client/privacy.html": "<html></html>",
    "client/data-deletion.html": "<html></html>",
    "client/js/render/about.js": "export {}",
    "client/js/age-gate.js": "export {}",
    "client/js/electoral-period.js": "export {}",
    "docs/legal/licenca-e-contribuicoes.md": "CC-BY-4.0",
  };
  const bad = checkLeg03({ files: Object.keys(files), read: (f) => files[f] });
  assert.ok(bad.some((f) => /arweaveUpload/.test(f.reason)));
  assert.equal(checkLeg03().length, 0);
});

test("LEG-04: print(email) falha; tip com internal_error passa", () => {
  const snippet = "def f(email):\n    print(email)\n";
  const bad = checkLeg04({ files: ["relay/bad.py"], read: () => snippet });
  assert.ok(bad.some((f) => f.reason.includes("PII")));
  const tip = fs.readFileSync(path.join(ROOT, "relay/server.py"), "utf8");
  assert.ok(tip.includes('{"error": "internal_error"}'));
  assert.equal(checkLeg04({ files: ["relay/server.py"], read: () => tip }).length, 0);
});

test("LEG-05: script CDN não inventariado falha", () => {
  const html = '<script src="https://evil.example/x.js"></script>';
  const bad = checkLeg05({
    files: ["client/x.html"],
    inventoryText: "https://accounts.google.com/gsi/client",
    read: () => html,
  });
  assert.ok(bad.some((f) => /evil\.example/.test(f.reason)));
});

test("runAudit agrega ok quando fixtures limpas", () => {
  const report = runAudit({
    files: [],
    leg01: { lockText: lockWith("MIT"), licenseText: "GNU AFFERO GENERAL PUBLIC LICENSE" },
    leg02Files: ["client/icons/a.png"],
    leg03: {
      files: [
        "client/config/flags.json",
        "client/js/feature-flags.js",
        "client/_headers",
        "client/privacy.html",
        "client/data-deletion.html",
        "client/js/render/about.js",
        "client/js/age-gate.js",
        "client/js/electoral-period.js",
        "docs/legal/licenca-e-contribuicoes.md",
      ],
      read: (f) => {
        if (f.endsWith("flags.json")) return JSON.stringify({ flags: { arweaveUpload: false } });
        if (f.endsWith("_headers")) return "script-src 'self'";
        if (f.endsWith(".md")) return "CC-BY-4.0";
        return "arweaveUpload: false";
      },
    },
    leg04: { files: [], read: () => "" },
    leg05: { files: [], inventoryText: "", read: () => "" },
  });
  assert.equal(report.ok, true);
});
