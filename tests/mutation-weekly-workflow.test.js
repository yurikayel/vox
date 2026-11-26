/**
 * @file Contrato do workflow semanal da mutação Tier A (PM-112): gatilhos,
 * comando completo, permissões mínimas e ausência de bloqueio de merge.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "mutation-weekly.yml");
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Lê o YAML do workflow; devolve `null` se não existir (falha por assert, não por exceção).
 * @returns {string|null} Texto do workflow.
 */
function readWorkflow() {
  return fs.existsSync(WORKFLOW) ? fs.readFileSync(WORKFLOW, "utf8") : null;
}

test("workflow semanal existe", () => {
  assert.notEqual(readWorkflow(), null, "falta .github/workflows/mutation-weekly.yml");
});

test("gatilhos: cron semanal fora das 06:00 UTC da nightly + workflow_dispatch", () => {
  const yml = readWorkflow() ?? "";
  const cron = /^\s*-\s*cron:\s*"([^"]+)"/m.exec(yml);
  assert.ok(cron, "sem schedule/cron");
  const [min, hour, dom, mon, dow] = cron[1].split(/\s+/);
  assert.ok(/^\d$/.test(dow), `dia da semana fixo esperado, veio ${dow}`);
  assert.equal(dom + mon, "**", "cron semanal não fixa dia do mês nem mês");
  assert.notEqual(`${hour}:${min}`, "6:0", "colide com a nightly das 06:00 UTC");
  assert.match(yml, /^\s*workflow_dispatch:/m);
});

test("roda o script completo (base = árvore vazia), sem piso nem --max", () => {
  const yml = readWorkflow() ?? "";
  const run = /run:\s*(npm run audit:mutate:tier-a.*)$/m.exec(yml);
  assert.ok(run, "sem comando de mutação");
  assert.ok(run[1].includes(`--base ${EMPTY_TREE}`), "base deve ser a árvore vazia");
  assert.doesNotMatch(run[1], /--min-score|--max/);
});

test("permissões mínimas e actions fixadas por SHA", () => {
  const yml = readWorkflow() ?? "";
  assert.match(yml, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(yml, /(write|pull_request)/);
  const uses = [...yml.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `action sem SHA: ${u}`);
});
