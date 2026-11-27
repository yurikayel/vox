/**
 * @file PM-117 — guarda o inventário dos E2E Python (`docs/process/e2e-inventario.md`): todo arquivo de `e2e/`
 * está listado, e as colunas "PR" e "Noite" batem com o que o `ci.yml` e o `nightly-audit.yml` realmente rodam.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "docs/process/e2e-inventario.md";

/** Lê um arquivo do repositório; vazio se não existir (o assert do teste explica a falta). */
function readOrEmpty(file) {
  const abs = join(ROOT, file);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
}

/** Arquivos Python versionados em `e2e/`. */
function e2eFiles() {
  const out = execFileSync("git", ["ls-files", "e2e/*.py"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean).sort();
}

/** Linhas da tabela do inventário: arquivo, e as colunas PR e Noite (as duas últimas). */
function inventoryRows() {
  return readOrEmpty(DOC)
    .split("\n")
    .filter((line) => /^\| `e2e\/[^`]+\.py` \|/.test(line))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      return { file: cells[0].replaceAll("`", ""), pr: cells.at(-2), night: cells.at(-1) };
    });
}

/** O `ci.yml` roda algum E2E Python? (`npm run test:e2e`, `unittest` apontado para `e2e` ou um arquivo de `e2e/`; o `unittest` do relay não conta.) */
function ciRunsPythonE2e() {
  return /test:e2e|unittest[^\n]*\be2e\b|e2e[\\/](test_|capture_|verify_)/.test(readOrEmpty(".github/workflows/ci.yml"));
}

/** O nightly roda `npm run test:e2e`, e esse script descobre `e2e/test_*.py`? */
function nightlyRunsAllTests() {
  const nightly = readOrEmpty(".github/workflows/nightly-audit.yml");
  const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts["test:e2e"] || "";
  return /run:\s*npm run test:e2e/.test(nightly) && /discover -s e2e -p "test_\*\.py"/.test(script);
}

test("o inventário dos E2E Python existe", () => {
  assert.ok(existsSync(join(ROOT, DOC)), `${DOC} existe`);
  assert.ok(inventoryRows().length > 0, "a tabela de arquivos tem linhas");
});

test("todo arquivo de e2e/ está no inventário, e o inventário não cita arquivo que não existe", () => {
  const listed = inventoryRows().map((r) => r.file).sort();
  assert.deepEqual(listed, e2eFiles());
});

test("a coluna PR diz a verdade sobre o ci.yml", () => {
  const rows = inventoryRows();
  assert.ok(rows.length > 0, "há linhas para conferir");
  for (const row of rows) {
    assert.equal(row.pr, ciRunsPythonE2e() ? "sim" : "não", `${row.file}: roda em PR?`);
  }
});

test("a coluna Noite diz a verdade sobre o nightly: todo test_*.py roda, os scripts não", () => {
  const rows = inventoryRows();
  assert.ok(rows.length > 0, "há linhas para conferir");
  assert.ok(nightlyRunsAllTests(), "o nightly roda npm run test:e2e e o script descobre test_*.py");
  for (const row of rows) {
    const isTest = /^e2e\/test_[^/]+\.py$/.test(row.file);
    assert.equal(row.night, isTest ? "sim" : "não", `${row.file}: roda à noite?`);
  }
});
