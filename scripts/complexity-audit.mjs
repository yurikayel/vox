#!/usr/bin/env node
/**
 * ESLint-based complexity audit for client/js (flat + subdirs).
 * Writes docs/metrics/baseline-YYYY-MM-DD.json and .md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CLIENT_JS = path.join(ROOT, "client", "js");
const METRICS_DIR = path.join(ROOT, "docs", "metrics");

const SKIP = new Set(["mock.js"]);

/**
 * Lista recursivamente os `.js` de um diretório, pulando os nomes em `SKIP`.
 * @param {string} dir Diretório raiz da busca.
 * @returns {string[]}
 */
function collectJsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (ent.name.endsWith(".js") && !SKIP.has(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

const eslint = new ESLint({ cwd: ROOT });

const RULES = ["complexity", "max-depth", "max-lines-per-function"];

/**
 * Reúne os arquivos do cliente que entram na auditoria (módulos de `client/js` e `client/sw.js`).
 * @returns {string[]}
 */
function getFilesToLint() {
  const files = collectJsFiles(CLIENT_JS);
  const swPath = path.join(ROOT, "client", "sw.js");
  if (fs.existsSync(swPath)) {
    files.push(swPath);
  }
  return files;
}

/**
 * Converte o resultado do ESLint nas violações das regras medidas.
 * @param {object[]} results Resultados de `eslint.lintFiles`.
 * @returns {object[]}
 */
function extractViolations(results) {
  const violations = [];
  for (const r of results) {
    const rel = path.relative(ROOT, r.filePath).replace(/\\/g, "/");
    for (const m of r.messages) {
      if (!RULES.includes(m.ruleId)) continue;
      violations.push({
        file: rel,
        line: m.line,
        rule: m.ruleId,
        message: m.message,
        severity: m.severity === 2 ? "error" : "warn",
      });
    }
  }
  return violations;
}

/**
 * Monta o relatório de complexidade em Markdown (as 40 piores violações).
 * @param {string[]} files Arquivos varridos.
 * @param {object[]} violations Violações encontradas.
 * @param {string} date Data do relatório (AAAA-MM-DD).
 * @returns {string}
 */
function formatMarkdownReport(files, violations, date) {
  const top = violations.slice(0, 40);
  return [
    `# Complexity baseline — ${date}`,
    "",
    `Files scanned: **${files.length}** · Violations: **${violations.length}**`,
    "",
    "## Top violations",
    "",
    "| File | Line | Rule | Message |",
    "|------|------|------|---------|",
    ...top.map(
      (v) => `| \`${v.file}\` | ${v.line} | ${v.rule} | ${v.message.replace(/\|/g, "\\|")} |`
    ),
    "",
    `Full JSON: \`docs/metrics/baseline-${date}.json\``,
    "",
  ].join("\n");
}

/**
 * Grava o relatório em JSON e Markdown em `docs/metrics/`.
 * @param {string[]} files Arquivos varridos.
 * @param {object[]} violations Violações encontradas.
 * @param {string} date Data do relatório (AAAA-MM-DD).
 */
function writeReports(files, violations, date) {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  const jsonPath = path.join(METRICS_DIR, `baseline-${date}.json`);
  const mdPath = path.join(METRICS_DIR, `baseline-${date}.md`);

  const payload = {
    generatedAt: new Date().toISOString(),
    filesScanned: files.length,
    violationCount: violations.length,
    violations,
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(mdPath, formatMarkdownReport(files, violations, date));
  return jsonPath;
}

/**
 * Roda o ESLint nos arquivos do cliente, ordena as violações e grava os relatórios.
 * @returns {Promise<void>}
 */
async function main() {
  const files = getFilesToLint();
  const results = await eslint.lintFiles(files);
  const violations = extractViolations(results);

  violations.sort((a, b) => {
    const rank = { complexity: 0, "max-lines-per-function": 1, "max-depth": 2 };
    return (rank[a.rule] ?? 9) - (rank[b.rule] ?? 9) || a.file.localeCompare(b.file);
  });

  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = writeReports(files, violations, date);

  console.log(`Wrote ${path.relative(ROOT, jsonPath)} (${violations.length} violations)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
