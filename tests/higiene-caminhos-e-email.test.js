/**
 * @file PM-111 da higiene do repositório: nenhum arquivo versionado carrega caminho de usuário do Windows ou
 * caminho da pasta de trabalho local, e as fixtures de `tests/` não usam e-mail de provedor de conta real
 * (só domínios reservados ou fictícios, como `example.*`, `exemplo.*` ou `@vox.*`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT_FILE = /\.(js|mjs|cjs|py|ps1|cs|md|json|html|css|yml|yaml|txt|sh)$/i;
/** Fixtures sintéticas de higienização de erro (`C:\Users\secret\…`) ficam de fora de propósito. */
const SYNTHETIC_PATH_FIXTURES = new Set(["relay/test_relay_error_sanitization.py"]);
const USER_PATH = /[A-Za-z]:[\\/]+(?:Users[\\/]+(?!secret\b|Public\b|Default\b)[^\\/\s"'`<%*{$]+|project[\\/]+politica)/;
const EMAIL = /[\w.+-]+@([\w-]+\.)+[A-Za-z]{2,}/g;
/** Provedores de e-mail de conta real: fixture com endereço nesses domínios pode ser conta de pessoa de verdade. */
const REAL_PROVIDER = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|proton|protonmail|uol|bol|terra|ig)\.[a-z.]+$/i;

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter((f) => f && TEXT_FILE.test(f));
}

function read(file) {
  return readFileSync(join(ROOT, file), "utf8");
}

test("nenhum arquivo versionado tem caminho de usuário do Windows ou da pasta de trabalho local", () => {
  const hits = trackedFiles()
    .filter((f) => !SYNTHETIC_PATH_FIXTURES.has(f))
    .filter((f) => USER_PATH.test(read(f)));
  assert.deepEqual(hits, []);
});

test("fixtures de tests/ não usam e-mail de provedor de conta real (usam example.*, exemplo.* ou @vox.*)", () => {
  const hits = trackedFiles()
    .filter((f) => f.startsWith("tests/") && f !== "tests/higiene-caminhos-e-email.test.js")
    .filter((f) => [...read(f).matchAll(EMAIL)].some((m) => REAL_PROVIDER.test(m[0].split("@")[1])));
  assert.deepEqual(hits, []);
});
