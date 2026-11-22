import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("higiene de testes: nenhum arquivo temporario ou artificial coverage-* em tests/", () => {
  const testFiles = fs.readdirSync(__dirname);
  const forbiddenFiles = testFiles.filter((name) => name.startsWith("coverage-"));
  assert.deepEqual(
    forbiddenFiles,
    [],
    `Arquivos de cobertura proibidos encontrados em tests/: ${forbiddenFiles.join(", ")}`
  );
});
