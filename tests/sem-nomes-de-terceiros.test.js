/**
 * Regra do mantenedor: nenhum nome de outro produto ou serviço entra no repositório
 * (docs/, client/, README). Exceções: a atribuição CC-BY do SRD 5.2 (dndbeyond.com/srd)
 * e os sistemas suportados (Tormenta20, GURPS, D&D 5e), que não constam da lista.
 * Os nomes ficam fragmentados aqui para o próprio teste não os citar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = [
  ["Foun", "dry"],
  ["Owl", "bear"],
  ["Roll", "20"],
  ["Mini ", "Kraken"],
  ["ER", "PG"],
  ["Fantasy ", "Grounds"],
  ["Dia", "blo"],
].map((parts) => parts.join(""));
const PATTERN = new RegExp(`(?<![A-Za-z0-9])(?:${NAMES.join("|")})(?![A-Za-z0-9])`, "i");
const SKIP_DIRS = new Set(["node_modules", "vendor", ".git"]);
const TEXT_EXT = /\.(md|js|mjs|json|html|css|txt)$/i;
const ALLOWED_LINE = /dndbeyond\.com\/srd/i;

/** Lista recursivamente os arquivos de texto de uma pasta, ignorando vendorizados. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

test("sem nomes de terceiros em docs/, client/ e README (exceto atribuição do SRD)", () => {
  const files = [...walk(path.join(ROOT, "docs")), ...walk(path.join(ROOT, "client")), path.join(ROOT, "README.md")];
  const hits = [];
  for (const file of files) {
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (PATTERN.test(line) && !ALLOWED_LINE.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
      });
  }
  assert.deepEqual(hits, [], `nomes de terceiros em: ${hits.join(", ")}`);
});
