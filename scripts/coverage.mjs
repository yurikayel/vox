#!/usr/bin/env node
/**
 * Cobertura de linhas do cliente (`client/js`, `client/aviso`) com catraca.
 *
 * Roda a suíte `node:test` com `--experimental-test-coverage` (lcov) e conta só linhas de código:
 * linhas em branco e só de comentário ficam de fora (medição por tokens do espree, não por regex), para
 * que JSDoc novo não infle o número. Arquivo de produção que nenhum teste carrega entra com 0%.
 * O piso fica em `scripts/coverage-floor.json` e funciona como catraca: só sobe.
 *
 * Uso: `npm run coverage:js` · `npm run coverage:js -- --lcov <arquivo>` (reaproveita um lcov pronto)
 * · `npm run coverage:js -- --raise` (sobe o piso para o valor medido; nunca desce).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLOOR_FILE = path.join(ROOT, "scripts", "coverage-floor.json");
/** Código de produção medido; o mesmo recorte de `scripts/docs-audit.mjs`. */
const JS_ROOTS = ["client/js", "client/aviso"];
/** Dados de demonstração, não código de produção. */
const JS_SKIP = new Set(["client/js/mock.js"]);

const rel = (abs) => path.relative(ROOT, abs).replaceAll("\\", "/");

/**
 * Lista os `.js` de produção sob as raízes medidas.
 * @param {string} dir Pasta absoluta.
 * @returns {string[]} Caminhos relativos à raiz do repositório.
 */
function listJs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "vendor" ? [] : listJs(full);
    return entry.name.endsWith(".js") ? [rel(full)] : [];
  });
}

/**
 * Linhas (1-based) que têm ao menos um token de código.
 * @param {string} file Caminho relativo.
 * @returns {Set<number>} Linhas de código.
 */
function codeLines(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const opts = { ecmaVersion: "latest", sourceType: "module", tokens: true, loc: true };
  const lines = new Set();
  for (const tok of espree.tokenize(src, opts)) {
    for (let l = tok.loc.start.line; l <= tok.loc.end.line; l += 1) lines.add(l);
  }
  return lines;
}

/**
 * Lê um lcov e devolve, por arquivo, as linhas executadas ao menos uma vez.
 * @param {string} lcovPath Caminho do lcov.
 * @returns {Map<string, Set<number>>} Arquivo relativo → linhas com hit.
 */
function parseLcov(lcovPath) {
  const hits = new Map();
  let current = null;
  for (const line of fs.readFileSync(lcovPath, "utf8").split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      current = rel(path.resolve(ROOT, line.slice(3)));
      hits.set(current, new Set());
    } else if (line.startsWith("DA:") && current) {
      const [num, count] = line.slice(3).split(",").map(Number);
      if (count > 0) hits.get(current).add(num);
    }
  }
  return hits;
}

/**
 * Roda a suíte do cliente gerando lcov num arquivo temporário.
 * @returns {string} Caminho do lcov gerado.
 */
function runSuite() {
  const out = path.join(ROOT, ".coverage-js.lcov");
  const tests = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".test.js"));
  const args = ["--test", "--experimental-test-coverage", "--test-reporter=spec",
    "--test-reporter-destination=stdout", "--test-reporter=lcov", `--test-reporter-destination=${out}`,
    ...tests.map((f) => path.join("tests", f))];
  const res = spawnSync(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  if (res.status !== 0) throw new Error(`suíte do cliente falhou (exit ${res.status})`);
  return out;
}

/**
 * Soma linhas de código e linhas cobertas de todos os arquivos de produção.
 * @param {Map<string, Set<number>>} hits Saída de `parseLcov`.
 * @returns {{total: number, covered: number, rows: Array<[string, number, number]>}} Totais e linhas por arquivo.
 */
function measure(hits) {
  const files = JS_ROOTS.flatMap((r) => listJs(path.join(ROOT, r))).filter((f) => !JS_SKIP.has(f));
  const rows = files.map((file) => {
    const code = codeLines(file);
    const hit = hits.get(file) ?? new Set();
    const covered = [...code].filter((l) => hit.has(l)).length;
    return [file, code.size, covered];
  });
  const total = rows.reduce((s, r) => s + r[1], 0);
  const covered = rows.reduce((s, r) => s + r[2], 0);
  return { total, covered, rows };
}

/**
 * Imprime o resumo e os arquivos com mais linhas descobertas.
 * @param {{total: number, covered: number, rows: Array<[string, number, number]>}} m Medição.
 * @returns {number} Percentual coberto, com uma casa decimal.
 */
function report(m) {
  const pct = Math.floor((1000 * m.covered) / Math.max(m.total, 1)) / 10;
  const worst = [...m.rows].sort((a, b) => (b[1] - b[2]) - (a[1] - a[2])).slice(0, 10);
  console.log(`\nCobertura do cliente: ${m.covered}/${m.total} linhas de código = ${pct}%`);
  for (const [file, total, covered] of worst) console.log(`  ${total - covered} descobertas  ${file}`);
  return pct;
}

/**
 * Compara com o piso e, com `--raise`, sobe a catraca.
 * @param {number} pct Percentual medido.
 * @param {boolean} raise Se deve gravar o novo piso.
 * @returns {number} Código de saída do processo.
 */
function checkFloor(pct, raise) {
  const floor = JSON.parse(fs.readFileSync(FLOOR_FILE, "utf8"));
  if (raise && pct > floor.js) {
    floor.js = pct;
    fs.writeFileSync(FLOOR_FILE, `${JSON.stringify(floor, null, 2)}\n`);
    console.log(`Piso do cliente sobe para ${pct}%.`);
  }
  if (pct < floor.js) {
    console.error(`Cobertura do cliente ${pct}% abaixo do piso ${floor.js}% (scripts/coverage-floor.json).`);
    return 1;
  }
  console.log(`Piso ${floor.js}% · meta ${floor.target}%.`);
  return 0;
}

/**
 * Ponto de entrada da CLI.
 * @param {string[]} argv Argumentos após o script.
 * @returns {number} Código de saída.
 */
function main(argv) {
  const lcovIdx = argv.indexOf("--lcov");
  const lcov = lcovIdx >= 0 ? argv[lcovIdx + 1] : runSuite();
  const pct = report(measure(parseLcov(lcov)));
  if (lcovIdx < 0) fs.rmSync(lcov, { force: true });
  return checkFloor(pct, argv.includes("--raise"));
}

process.exitCode = main(process.argv.slice(2));
