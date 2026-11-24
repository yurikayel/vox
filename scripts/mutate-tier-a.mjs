#!/usr/bin/env node
/**
 * @file Protótipo de mutador AST mínimo para módulos Tier A (PM-112).
 *
 * Usa o parser `espree` (já instalado via ESLint, zero dependência nova) para
 * gerar mutantes sintáticos seguros em módulos ESM e executá-los via
 * `node --test` com hook de carregamento ESM em sandbox temporário (`os.tmpdir()`).
 * O arquivo original no repositório nunca é sobrescrito e seu hash SHA-256 é
 * conferido antes e depois de cada rodada.
 *
 * Uso:
 *   node scripts/mutate-tier-a.mjs --file client/js/sig-format.js --test tests/sig-format.test.js [--max 10] [--json]
 *   node scripts/mutate-tier-a.mjs --base origin/develop [--max 20] [--json]
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as espree from "espree";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_TIER_A = Object.freeze([
  "client/js/identity/", "client/js/vault/",
  "client/js/crypto-dm.js", "client/js/sig-format.js", "client/js/inbox.js",
]);

const OPERATOR_SWAPS = Object.freeze({
  "===": "!==", "!==": "===",
  "==": "!=", "!=": "==",
  "<": "<=", "<=": "<",
  ">": ">=", ">=": ">",
  "&&": "||", "||": "&&",
});

const HOOKS_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  'import { fileURLToPath } from "node:url";',
  'const norm = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));',
  'const target = norm(process.env.VOX_MUTATE_TARGET || "");',
  'const sourceFile = process.env.VOX_MUTATE_SOURCE || "";',
  'export async function load(url, context, nextLoad) {',
  '  if (target && url.startsWith("file:") && norm(fileURLToPath(url)) === target) {',
  '    return { format: "module", shortCircuit: true, source: fs.readFileSync(sourceFile, "utf8") };',
  '  }',
  '  return nextLoad(url, context);',
  '}',
].join("\n");

const REGISTER_SOURCE = 'import { register } from "node:module";\nregister("./hooks.mjs", import.meta.url);\n';

/**
 * Calcula o SHA-256 em hexadecimal.
 * @param {Buffer|string} buf Conteúdo a resumir.
 * @returns {string}
 */
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
/**
 * Troca barras invertidas por barras normais no caminho.
 * @param {string} filePath Caminho do arquivo.
 * @returns {string}
 */
const toPosix = (filePath) => filePath.replace(/\\/g, "/");
/**
 * Roda o git com os argumentos dados e devolve a saída padrão.
 * @param {string[]} args Argumentos do git.
 * @param {string} cwd Diretório de trabalho.
 * @returns {string}
 */
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * Faz o parse dos argumentos de linha de comando do mutador.
 * @param {string[]} argv Lista de argumentos (sem `node` e caminho do script).
 * @returns {{ file: string|null, tests: string[], base: string|null, max: number|null, timeoutMs: number, json: boolean, help: boolean }} Opções normalizadas.
 */
export function parseArgs(argv) {
  const opts = { file: null, tests: [], base: null, max: null, timeoutMs: DEFAULT_TIMEOUT_MS, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") opts.file = argv[++i] ?? null;
    else if (arg === "--test") { if (argv[i + 1]) opts.tests.push(argv[++i]); }
    else if (arg === "--base") opts.base = argv[++i] ?? null;
    else if (arg === "--max") opts.max = Number.parseInt(argv[++i], 10);
    else if (arg === "--timeout") opts.timeoutMs = Number.parseInt(argv[++i], 10) || DEFAULT_TIMEOUT_MS;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

/**
 * Carrega os caminhos Tier A (`client/js/...`) a partir de `.github/CODEOWNERS`.
 * @param {string} root Diretório raiz do repositório.
 * @returns {string[]} Prefixos ou arquivos relativos pertencentes ao Tier A.
 */
export function loadTierAPatterns(root) {
  const codeowners = path.join(root, ".github", "CODEOWNERS");
  if (!fs.existsSync(codeowners)) return [...DEFAULT_TIER_A];
  const lines = fs.readFileSync(codeowners, "utf8").split(/\r?\n/);
  const patterns = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const token = trimmed.split(/\s+/)[0];
    if (token.startsWith("/client/js/")) patterns.push(token.slice(1));
  }
  return patterns.length > 0 ? patterns : [...DEFAULT_TIER_A];
}

/**
 * Verifica se um caminho relativo pertence ao Tier A.
 * @param {string} relPath Caminho relativo ao repositório.
 * @param {string[]} [patterns] Padrões Tier A (prefixos terminados em `/` ou arquivos exatos).
 * @returns {boolean} `true` se o arquivo faz parte do Tier A.
 */
export function isTierAFile(relPath, patterns = DEFAULT_TIER_A) {
  const norm = toPosix(relPath).replace(/^\.\//, "");
  return patterns.some((pat) => (pat.endsWith("/") ? norm.startsWith(pat) : norm === pat));
}

/**
 * Extrai, de um `git diff --unified=0`, o conjunto de linhas alteradas/adicionadas por arquivo.
 * @param {string} diffText Saída textual do `git diff --unified=0`.
 * @returns {Map<string, Set<number>>} Mapa `arquivo -> Set<linha 1-based>`.
 */
export function parseChangedLines(diffText) {
  const changed = new Map();
  let current = null;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      current = line.slice(6).trim();
      if (!changed.has(current)) changed.set(current, new Set());
      continue;
    }
    const hunk = current && /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    const start = Number.parseInt(hunk[1], 10);
    const count = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10);
    for (let n = 0; n < count; n += 1) changed.get(current).add(start + n);
  }
  return changed;
}

/**
 * Resolve arquivos de teste correspondentes a um módulo Tier A em `tests/`.
 * @param {string} relFile Caminho relativo do módulo (ex.: `client/js/sig-format.js`).
 * @param {string} root Diretório raiz do repositório.
 * @returns {string[]} Lista ordenada de caminhos relativos em `tests/*.test.js`.
 */
export function resolveTestsForFile(relFile, root) {
  const testsDir = path.join(root, "tests");
  if (!fs.existsSync(testsDir)) return [];
  const norm = toPosix(relFile);
  const stem = path.basename(norm, ".js");
  const all = fs.readdirSync(testsDir).filter((f) => f.endsWith(".test.js")).sort();
  const byName = all.filter((f) => f === `${stem}.test.js` || f.startsWith(`${stem}-`));
  if (byName.length > 0) return byName.map((f) => `tests/${f}`);
  const suffix = `/${path.basename(norm)}`;
  const byImport = all.filter((f) => {
    const body = fs.readFileSync(path.join(testsDir, f), "utf8");
    return body.includes(norm) || body.includes(suffix);
  });
  return byImport.map((f) => `tests/${f}`);
}

/**
 * Percorre a árvore sintática chamando `visit` em cada nó.
 * @param {object} node Nó inicial.
 * @param {Function} visit Função chamada com cada nó.
 */
function walkAst(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || !value || typeof value !== "object") continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) walkAst(child, visit);
  }
}

/**
 * Acha o token do operador entre os dois lados de uma expressão binária.
 * @param {object} node Nó da expressão.
 * @param {object[]} tokens Tokens do arquivo.
 * @returns {object|undefined}
 */
function findOperatorToken(node, tokens) {
  const leftEnd = node.left.range[1];
  const rightStart = node.right.range[0];
  return tokens.find(
    (t) => t.type === "Punctuator" && t.value === node.operator && t.range[0] >= leftEnd && t.range[1] <= rightStart,
  );
}

/**
 * Cria o mutante que troca o operador (por exemplo `===` por `!==`), ou `null` se não há troca.
 * @param {object} node Nó da expressão.
 * @param {object[]} tokens Tokens do arquivo.
 * @returns {object|null}
 */
function operatorMutant(node, tokens) {
  const replacement = OPERATOR_SWAPS[node.operator];
  if (!replacement) return null;
  const token = findOperatorToken(node, tokens);
  if (!token) return null;
  return {
    kind: node.type === "LogicalExpression" ? "logical" : "binary",
    line: token.loc.start.line,
    column: token.loc.start.column + 1,
    start: token.range[0],
    end: token.range[1],
    original: node.operator,
    replacement,
    description: `${node.operator} -> ${replacement}`,
  };
}

/**
 * Cria o mutante que troca a condição do `if` por `false`.
 * @param {object} node Nó do `if`.
 * @param {string} source Código-fonte do arquivo.
 * @returns {object}
 */
function ifConditionMutant(node, source) {
  const [start, end] = node.test.range;
  const original = source.slice(start, end);
  const preview = original.replace(/\s+/g, " ").slice(0, 60);
  return {
    kind: "if-condition",
    line: node.test.loc.start.line,
    column: node.test.loc.start.column + 1,
    start,
    end,
    original,
    replacement: `!(${original})`,
    description: `if (${preview}) -> if (!(${preview}))`,
  };
}

/**
 * Cria o mutante que inverte um literal booleano.
 * @param {object} node Nó do literal.
 * @returns {object}
 */
function booleanMutant(node) {
  const original = node.value ? "true" : "false";
  const replacement = node.value ? "false" : "true";
  return {
    kind: "boolean-literal",
    line: node.loc.start.line,
    column: node.loc.start.column + 1,
    start: node.range[0],
    end: node.range[1],
    original,
    replacement,
    description: `${original} -> ${replacement}`,
  };
}

/**
 * Escolhe o mutante adequado ao tipo do nó, ou `null` se o nó não é mutável.
 * @param {object} node Nó da árvore sintática.
 * @param {string} source Código-fonte do arquivo.
 * @param {object[]} tokens Tokens do arquivo.
 * @returns {object|null}
 */
function mutantForNode(node, source, tokens) {
  if (node.type === "BinaryExpression" || node.type === "LogicalExpression") return operatorMutant(node, tokens);
  if (node.type === "IfStatement") return ifConditionMutant(node, source);
  if (node.type === "Literal" && typeof node.value === "boolean") return booleanMutant(node);
  return null;
}

/**
 * Descobre mutantes sintáticos via AST (`espree`) em código-fonte ESM.
 * @param {string} source Código-fonte JavaScript (ESM).
 * @param {{ lines?: Set<number>|null, max?: number|null }} [options] Filtros opcionais de linha e teto.
 * @returns {Array<{ id: number, kind: string, line: number, column: number, start: number, end: number, original: string, replacement: string, description: string }>} Lista de mutantes descobertos.
 */
export function discoverMutants(source, options = {}) {
  const ast = espree.parse(source, { ecmaVersion: 2024, sourceType: "module", range: true, loc: true, tokens: true });
  const raw = [];
  walkAst(ast, (node) => {
    const mutant = mutantForNode(node, source, ast.tokens);
    if (!mutant) return;
    if (options.lines && !options.lines.has(mutant.line)) return;
    raw.push(mutant);
  });
  const limit = Number.isInteger(options.max) && options.max > 0 ? options.max : raw.length;
  return raw.slice(0, limit).map((m, idx) => ({ id: idx + 1, ...m }));
}

/**
 * Aplica um mutante específico ao código-fonte original, validando o trecho alvo.
 * @param {string} source Código-fonte original.
 * @param {{ start: number, end: number, original: string, replacement: string }} mutant Mutante a aplicar.
 * @returns {string} Código-fonte mutado.
 */
export function applyMutant(source, mutant) {
  const slice = source.slice(mutant.start, mutant.end);
  if (slice !== mutant.original) {
    throw new Error(`Offset inconsistente para mutante em [${mutant.start}, ${mutant.end}]: esperado "${mutant.original}", obtido "${slice}".`);
  }
  return source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end);
}

/**
 * Cria o diretório temporário com os ganchos de carga que trocam o módulo alvo pelo mutante.
 * @returns {object}
 */
function createSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-mutate-"));
  fs.writeFileSync(path.join(dir, "hooks.mjs"), HOOKS_SOURCE, "utf8");
  const registerPath = path.join(dir, "register.mjs");
  fs.writeFileSync(registerPath, REGISTER_SOURCE, "utf8");
  return { dir, registerUrl: pathToFileURL(registerPath).href, mutatedPath: path.join(dir, "mutated.js") };
}

/**
 * Roda a suíte de testes com o módulo alvo trocado pelo mutante.
 * @param {object} options Parâmetros da execução.
 * @param {string[]} options.tests Arquivos de teste.
 * @param {string} options.cwd Diretório de trabalho.
 * @param {number} options.timeoutMs Limite de tempo, em ms.
 * @param {string} options.registerUrl URL do módulo de registro dos ganchos.
 * @param {string} options.targetFile Arquivo alvo da mutação.
 * @param {string} options.mutatedPath Caminho do arquivo mutado.
 * @returns {object}
 */
function runTestSuite({ tests, cwd, timeoutMs, registerUrl, targetFile, mutatedPath }) {
  const { NODE_TEST_CONTEXT: _ignored, ...baseEnv } = process.env;
  const env = registerUrl
    ? { ...baseEnv, VOX_MUTATE_TARGET: targetFile, VOX_MUTATE_SOURCE: mutatedPath }
    : baseEnv;
  const args = registerUrl ? ["--import", registerUrl, "--test", ...tests] : ["--test", ...tests];
  const started = Date.now();
  const res = spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: timeoutMs, env });
  const durationMs = Date.now() - started;
  if (res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM" || res.signal === "SIGKILL") {
    return { status: "timeout", durationMs };
  }
  return { status: res.status === 0 ? "survived" : "killed", durationMs };
}

/**
 * Calcula a nota de mutação (percentual de mutantes mortos), ou `null` sem mutantes.
 * @param {number} killed Mutantes mortos.
 * @param {number} total Total de mutantes.
 * @returns {number|null}
 */
const computeScore = (killed, total) => (total === 0 ? null : Number(((killed / total) * 100).toFixed(1)));

/**
 * Roda a suíte contra cada mutante e registra se foi morto, sobreviveu ou estourou o tempo.
 * @param {object} options Parâmetros da avaliação.
 * @param {string} options.source Código-fonte original.
 * @param {string} options.absFile Caminho absoluto do alvo.
 * @param {string} options.relFile Caminho relativo do alvo.
 * @param {string[]} options.absTests Testes (caminhos absolutos).
 * @param {string} options.cwd Diretório de trabalho.
 * @param {number} options.timeoutMs Limite de tempo por mutante, em ms.
 * @param {object[]} options.mutants Mutantes a avaliar.
 * @param {object} options.sandbox Sandbox com os ganchos.
 * @returns {object[]}
 */
function evaluateMutants({ source, absFile, relFile, absTests, cwd, timeoutMs, mutants, sandbox }) {
  const results = [];
  for (const mutant of mutants) {
    fs.writeFileSync(sandbox.mutatedPath, applyMutant(source, mutant), "utf8");
    const outcome = runTestSuite({
      tests: absTests, cwd, timeoutMs,
      registerUrl: sandbox.registerUrl, targetFile: absFile, mutatedPath: sandbox.mutatedPath,
    });
    results.push({ ...mutant, file: relFile, location: `${relFile}:${mutant.line}`, ...outcome });
  }
  return results;
}

/**
 * Monta o relatório de mutação de um arquivo.
 * @param {string} relFile Caminho relativo do alvo.
 * @param {string[]} relTests Testes usados.
 * @param {object[]} evaluated Mutantes avaliados.
 * @param {number} started Instante de início, em ms.
 * @returns {object}
 */
function buildFileReport(relFile, relTests, evaluated, started) {
  const killed = evaluated.filter((r) => r.status === "killed").length;
  const survivors = evaluated.filter((r) => r.status === "survived");
  const timeout = evaluated.filter((r) => r.status === "timeout").length;
  return {
    file: relFile, tests: relTests, total: evaluated.length,
    killed, survived: survivors.length, timeout,
    score: computeScore(killed, evaluated.length),
    durationMs: Date.now() - started, survivors, mutants: evaluated,
  };
}

/**
 * Executa mutação AST segura contra um arquivo e seus testes sem modificar o disco do repositório.
 * @param {{ file: string, tests: string[], cwd?: string, max?: number|null, lines?: Set<number>|null, timeoutMs?: number }} options Parâmetros de execução.
 * @returns {{ file: string, tests: string[], total: number, killed: number, survived: number, timeout: number, score: number|null, durationMs: number, survivors: object[], mutants: object[] }} Resultado medido.
 */
export function runFileMutation(options) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const absFile = path.resolve(cwd, options.file);
  const relFile = toPosix(path.relative(cwd, absFile));
  const absTests = options.tests.map((t) => path.resolve(cwd, t));
  const relTests = absTests.map((t) => toPosix(path.relative(cwd, t)));
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const originalBuf = fs.readFileSync(absFile);
  const originalHash = sha256(originalBuf);
  const source = originalBuf.toString("utf8");
  const mutants = discoverMutants(source, { lines: options.lines, max: options.max });
  const started = Date.now();
  if (mutants.length === 0) return buildFileReport(relFile, relTests, [], started);
  const sandbox = createSandbox();
  try {
    const baseline = runTestSuite({ tests: absTests, cwd, timeoutMs });
    if (baseline.status !== "survived") {
      throw new Error(`Baseline falhou para ${relTests.join(", ")} (status: ${baseline.status}); mutação abortada.`);
    }
    const evaluated = evaluateMutants({ source, absFile, relFile, absTests, cwd, timeoutMs, mutants, sandbox });
    return buildFileReport(relFile, relTests, evaluated, started);
  } finally {
    fs.rmSync(sandbox.dir, { recursive: true, force: true });
    if (sha256(fs.readFileSync(absFile)) !== originalHash) {
      throw new Error(`Integridade violada: hash de ${relFile} mudou durante a mutação.`);
    }
  }
}

/**
 * Agrega resultados de um ou mais arquivos no formato estruturado de relatório.
 * @param {"file"|"diff"} mode Modo de execução.
 * @param {object[]} fileReports Relatórios individuais devolvidos por `runFileMutation`.
 * @returns {{ mode: string, total: number, killed: number, survived: number, timeout: number, score: number|null, durationMs: number, survivors: object[], files: object[] }} Relatório consolidado.
 */
export function aggregateReports(mode, fileReports) {
  const total = fileReports.reduce((n, r) => n + r.total, 0);
  const killed = fileReports.reduce((n, r) => n + r.killed, 0);
  const survived = fileReports.reduce((n, r) => n + r.survived, 0);
  const timeout = fileReports.reduce((n, r) => n + r.timeout, 0);
  const durationMs = fileReports.reduce((n, r) => n + r.durationMs, 0);
  const survivors = fileReports.flatMap((r) => r.survivors.map((s) => ({
    file: s.file, line: s.line, column: s.column, location: s.location,
    kind: s.kind, original: s.original, replacement: s.replacement, description: s.description,
  })));
  return { mode, total, killed, survived, timeout, score: computeScore(killed, total), durationMs, survivors, files: fileReports };
}

/**
 * Formata o relatório consolidado em texto legível para terminal.
 * @param {object} report Relatório retornado por `aggregateReports`.
 * @returns {string} Saída formatada.
 */
export function formatTextReport(report) {
  const scoreLabel = report.score === null ? "n/a" : `${report.score}%`;
  const lines = [
    `PM-112 AST Mutator (${report.mode}): ${report.killed} killed, ${report.survived} survived, ${report.timeout} timeout / ${report.total} total (score: ${scoreLabel}, ${report.durationMs}ms)`,
  ];
  if (report.survivors.length > 0) {
    lines.push("Sobreviventes:");
    for (const s of report.survivors) lines.push(`  - ${s.location} [${s.kind}] ${s.description}`);
  }
  return lines.join("\n");
}

/**
 * Formata o relatório consolidado em Markdown para `$GITHUB_STEP_SUMMARY`.
 * @param {object} report Relatório retornado por `aggregateReports`.
 * @returns {string} Resumo em Markdown.
 */
export function formatSummaryMarkdown(report) {
  const score = report.score === null ? "n/a" : `${report.score}%`;
  const cell = (v) => String(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const header = `## Mutação Tier A (PM-112 — aviso)\n\nModo \`${report.mode}\`: **${report.killed}** mortos, **${report.survived}** sobreviventes, **${report.timeout}** timeouts / **${report.total}** total (score: **${score}**, ${report.durationMs}ms).`;
  if (report.survivors.length === 0) return `${header}\n`;
  const rows = report.survivors.map((s) => `| \`${cell(s.location)}\` | \`${cell(s.kind)}\` | \`${cell(s.description)}\` |`);
  return [header, "", "| Local | Tipo | Mutação |", "|---|---|---|", ...rows, ""].join("\n");
}

/**
 * Resolve o commit-base do diff (`merge-base` com `HEAD`).
 * @param {string} baseRef Referência git da base.
 * @param {string} root Raiz do repositório.
 * @returns {string}
 */
function resolveBaseSha(baseRef, root) {
  try {
    return git(["merge-base", baseRef, "HEAD"], root).trim();
  } catch {
    return baseRef;
  }
}

/**
 * Modo diff: roda a mutação nos arquivos Tier A alterados em relação à base.
 * @param {object} opts Opções da linha de comando.
 * @param {string} root Raiz do repositório.
 * @returns {object}
 */
function runDiffMode(opts, root) {
  const patterns = loadTierAPatterns(root);
  const baseSha = resolveBaseSha(opts.base, root);
  const diffText = git(["diff", "--unified=0", "--diff-filter=AM", baseSha, "--", "client/js/"], root);
  const changed = parseChangedLines(diffText);
  const reports = [];
  let remaining = Number.isInteger(opts.max) && opts.max > 0 ? opts.max : null;
  for (const [relFile, lines] of changed.entries()) {
    if (!relFile.endsWith(".js") || !isTierAFile(relFile, patterns)) continue;
    if (remaining !== null && remaining <= 0) break;
    const tests = opts.tests.length > 0 ? opts.tests : resolveTestsForFile(relFile, root);
    if (tests.length === 0) continue;
    const report = runFileMutation({ file: relFile, tests, cwd: root, lines, max: remaining, timeoutMs: opts.timeoutMs });
    reports.push(report);
    if (remaining !== null) remaining -= report.total;
  }
  return aggregateReports("diff", reports);
}

/**
 * Modo arquivo único: roda a mutação em um arquivo, resolvendo seus testes se não foram dados.
 * @param {object} opts Opções da linha de comando.
 * @param {string} root Raiz do repositório.
 * @returns {object}
 */
function runSingleFileMode(opts, root) {
  const tests = opts.tests.length > 0 ? opts.tests : resolveTestsForFile(opts.file, root);
  if (tests.length === 0) throw new Error(`Nenhum teste resolvido para ${opts.file}; informe --test <caminho>.`);
  const report = runFileMutation({ file: opts.file, tests, cwd: root, max: opts.max, timeoutMs: opts.timeoutMs });
  return aggregateReports("file", [report]);
}

/**
 * Escolhe a referência-base padrão quando nem `--file` nem `--base` são informados.
 * @param {string} root Raiz do repositório.
 * @returns {string|null} Referência git válida ou `null`.
 */
function defaultBaseRef(root) {
  return [process.env.BASE_REF, "origin/develop", "develop"].filter(Boolean).find((ref) => {
    try { git(["rev-parse", "--verify", "--quiet", ref], root); return true; } catch { return false; }
  }) || null;
}

/**
 * Ponto de entrada: interpreta os argumentos, roda o modo escolhido e imprime o relatório.
 */
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const baseRef = opts.base || (!opts.file && !opts.help ? defaultBaseRef(root) : null);
  if (opts.help || (!opts.file && !baseRef)) {
    console.log("Uso: node scripts/mutate-tier-a.mjs (--file <caminho> [--test <teste>] | --base <gitRef>) [--max <N>] [--timeout <ms>] [--json]");
    process.exit(opts.help ? 0 : 1);
  }
  const report = baseRef ? runDiffMode({ ...opts, base: baseRef }, root) : runSingleFileMode(opts, root);
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatTextReport(report));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${formatSummaryMarkdown(report)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
