/**
 * Proposta de financiamento — todo ID de item citado existe no ROADMAP.
 * Evita referências a itens inexistentes (ex.: IDs inventados ou renumerados).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = /\b(?:PM|LAN|SUB|REV|EXP|NET|PIL)-\d+\b/g;

/** Lê um arquivo do repositório como texto UTF-8. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("proposta NLnet: IDs citados existem no ROADMAP", () => {
  const roadmap = new Set(read("docs/ROADMAP.md").match(ID));
  const cited = new Set(read("docs/strategy/proposta-nlnet-restack-2027.md").match(ID));
  assert.ok(cited.size > 0, "a proposta deve citar ao menos um ID");
  const missing = [...cited].filter((id) => !roadmap.has(id));
  assert.deepEqual(missing, [], `IDs ausentes do ROADMAP: ${missing.join(", ")}`);
});
