/**
 * REV-20 — testes do gerador de relatório anual de transparência de moderação
 * (agregação, ano vazio, invariante zero-PII, rejeição de entrada malformada e CLI).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEMA_VERSION,
  aggregateModerationLog,
  generateTransparencyReport,
  parseCliArgs,
} from "../scripts/transparency-report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(ROOT, "scripts", "transparency-report.mjs");

function sampleLog() {
  return [
    { id: "m-1", date: "2026-01-10", category: "doxxing", source: "non-user", action: "hidden", appealed: true, appealOutcome: "overturned", responseHours: 2 },
    { id: "m-2", date: "2026-02-14", category: "fraud", source: "user", action: "rejected", appealed: false, responseHours: 4 },
    { id: "m-3", date: "2026-03-01", category: "judicial", source: "judicial", action: "hidden", appealed: true, appealOutcome: "upheld", responseHours: 10 },
    { id: "m-4", date: "2026-04-20", category: "doxxing", source: "user", action: "escalated", appealed: true, appealOutcome: "pending", responseHours: 20 },
    { id: "m-5", date: "2026-05-05", category: "csam", source: "non-user", action: "pending", appealed: false, responseHours: null },
    { id: "m-9", date: "2025-12-31", category: "fraud", source: "user", action: "hidden", appealed: false, responseHours: 1 },
  ];
}

test("REV-20: agrega totais por categoria, origem, ação, recursos e latência (mediana e p95)", () => {
  const summary = aggregateModerationLog(sampleLog(), 2026);
  assert.equal(summary.schemaVersion, SCHEMA_VERSION);
  assert.equal(summary.year, 2026);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byCategory, { csam: 1, doxxing: 2, fraud: 1, judicial: 1 });
  assert.deepEqual(summary.bySource, { user: 2, "non-user": 2, judicial: 1 });
  assert.deepEqual(summary.byAction, { hidden: 2, rejected: 1, escalated: 1, pending: 1 });
  assert.deepEqual(summary.appeals, { total: 3, overturned: 1, upheld: 1, pending: 1, resolved: 2, overturnRate: 0.5 });
  // Amostras ordenadas: [2, 4, 10, 20] -> mediana = (4+10)/2 = 7, p95 nearest-rank ceil(0.95*4)-1 = index 3 -> 20
  assert.deepEqual(summary.responseTimeHours, { sampleSize: 4, median: 7, p95: 20 });
});

test("REV-20: ano sem registros gera sumário zerado e Markdown válido sem NaN", () => {
  const { summary, markdown } = generateTransparencyReport(sampleLog(), 2027);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.byCategory, {});
  assert.equal(summary.appeals.overturnRate, null);
  assert.deepEqual(summary.responseTimeHours, { sampleSize: 0, median: null, p95: null });
  assert.match(markdown, /Total de registros:\*\* 0/);
  assert.match(markdown, /_Nenhum registro para o ano selecionado\._/);
  assert.match(markdown, /\| Mediana \| N\/A \|/);
  assert.doesNotMatch(markdown, /NaN|Infinity|undefined/);
});

test("REV-20: invariante zero-PII remove identificadores, e-mails, IPs, nomes e notas livres", () => {
  const piiSecrets = [
    "case-secret-id-999",
    "Maria Joaquina da Silva",
    "denunciante@exemplo.org",
    "198.51.100.77",
    "123.456.789-00",
    "Nota privada contendo endereço Rua das Flores 42",
  ];
  const dirtyLog = [{
    id: piiSecrets[0],
    date: "2026-06-15",
    category: "doxxing",
    source: "non-user",
    action: "hidden",
    appealed: false,
    responseHours: 1.5,
    reporterName: piiSecrets[1],
    reporterEmail: piiSecrets[2],
    ip: piiSecrets[3],
    cpf: piiSecrets[4],
    notes: piiSecrets[5],
  }];
  const { summary, markdown } = generateTransparencyReport(dirtyLog, 2026);
  const serialized = JSON.stringify(summary);
  for (const secret of piiSecrets) {
    assert.equal(serialized.includes(secret), false, `sumário vazou PII: ${secret}`);
    assert.equal(markdown.includes(secret), false, `markdown vazou PII: ${secret}`);
  }
});

test("REV-20: rejeita entrada malformada, datas inexistentes, enums inválidos e PII em category", () => {
  assert.throws(() => aggregateModerationLog({ not: "array" }, 2026), TypeError);
  assert.throws(() => aggregateModerationLog([], 1969), RangeError);
  const invalidEntries = [
    { date: "2026-02-30", category: "fraud", source: "user", action: "hidden" },
    { date: "2026-01-01", category: "alice@exemplo.org", source: "user", action: "hidden" },
    { date: "2026-01-01", category: "fraud", source: "admin", action: "hidden" },
    { date: "2026-01-01", category: "fraud", source: "user", action: "deleted" },
    { date: "2026-01-01", category: "fraud", source: "user", action: "hidden", appealed: false, appealOutcome: "upheld" },
    { date: "2026-01-01", category: "fraud", source: "user", action: "hidden", responseHours: -1 },
  ];
  for (const bad of invalidEntries) {
    assert.throws(() => aggregateModerationLog([bad], 2026), RangeError);
  }
});

test("REV-20: CLI gera arquivo Markdown a partir de fixture temporária e falha com args inválidos", () => {
  const dir = mkdtempSync(join(tmpdir(), "vox-rev20-"));
  try {
    const inputPath = join(dir, "log.json");
    const outputPath = join(dir, "report.md");
    writeFileSync(inputPath, JSON.stringify(sampleLog()), "utf8");
    execFileSync(process.execPath, [CLI_PATH, "--input", inputPath, "--year", "2026", "--output", outputPath], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const md = readFileSync(outputPath, "utf8");
    assert.match(md, /Relatório Anual de Transparência de Moderação — 2026/);
    assert.match(md, /\| doxxing \| 2 \|/);
    assert.match(md, /\| Taxa de reversão \(sobre resolvidos\) \| 50\.0% \|/);
    assert.throws(() => parseCliArgs(["--year", "2026"]), /Uso:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
