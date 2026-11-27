#!/usr/bin/env node
/**
 * @file Auditoria interno × público (norma: docs/process/interno-e-publico.md).
 *
 * Lê os arquivos versionados (`git ls-files`) e conta, por padrão e por arquivo, o que não deve ir para o repositório.
 * Os padrões estão em scripts/internal-audit.patterns.json, as exceções (cada uma com motivo e dono) em
 * scripts/internal-audit.allow.json e a contagem aceita em docs/metrics/internal-audit-baseline.json (catraca).
 * Reprova: arquivo novo com ocorrência, contagem de um arquivo acima do baseline, total por padrão acima do baseline.
 * Em commit e PR (só os novos): o trailer de coautoria e o rodapé de ferramenta são ERROR; os demais padrões, aviso.
 * Nunca imprime o texto que casou: só `arquivo:linha:padrão`.
 *
 * Uso: `npm run audit:internal` (relatório) · `-- --check` (CI) · `-- --write-baseline` (grava; recusa subir)
 *      · `-- --check --base origin/develop --event <arquivo do evento do PR>` (mensagens e PR).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "docs/metrics/internal-audit-baseline.json";
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".zip", ".gz", ".wasm", ".mp3", ".mp4", ".ogg", ".webm", ".apk", ".jar", ".exe", ".dll", ".bin"]);
const MAX_BYTES = 2_000_000;
const COMMENT_LINE = /(\/\/|\/\*|^\s*\*|^\s*#|<!--)/;

/** Padrão compilado a partir da definição do JSON. */
function compile(def) {
  return { ...def, re: def.regex ? new RegExp(def.regex, def.flags ?? "i") : null, pathRe: def.path ? new RegExp(def.path) : null };
}

/** Exceção por linha compilada: `skip` descarta a linha, `strip` apaga o trecho antes de procurar. */
function compileLineException(ex) {
  return { ...ex, skipRe: ex.skip ? new RegExp(ex.skip, "i") : null, stripRe: ex.strip ? new RegExp(ex.strip, "gi") : null };
}

/**
 * Carrega padrões e exceções. Padrões extras locais (fora do repositório, por exemplo a lista de terceiros) vêm de
 * `VOX_AUDIT_EXTRA_PATTERNS`, um JSON com a lista no mesmo formato.
 * @param {string} [root] Raiz do repositório.
 * @param {object} [env] Variáveis de ambiente.
 * @returns {{patterns: object[], allow: object, cutoff: string}} Regras prontas.
 */
export function loadRules(root = ROOT, env = process.env) {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const defs = read(path.join(root, "scripts", "internal-audit.patterns.json"));
  const allow = read(path.join(root, "scripts", "internal-audit.allow.json"));
  const extra = env.VOX_AUDIT_EXTRA_PATTERNS ? read(env.VOX_AUDIT_EXTRA_PATTERNS) : [];
  allow.lineExceptions = allow.lineExceptions.map(compileLineException);
  return { patterns: [...defs.patterns, ...extra].map(compile), allow, cutoff: defs.commitCutoff };
}

/** O padrão vale para este arquivo e esta linha? */
function inScope(rule, rel, line) {
  const ext = path.extname(rel).toLowerCase();
  if (rule.skipExt?.includes(ext)) return false;
  if (rule.scope === "md") return ext === ".md";
  if (rule.scope === "md-or-comment") return ext === ".md" || COMMENT_LINE.test(line);
  return true;
}

/** Linha depois das exceções (trecho apagado), ou null se a linha inteira é permitida. */
function afterLineExceptions(rel, line, allow) {
  let out = line;
  for (const ex of allow.lineExceptions) {
    if (ex.paths && !ex.paths.includes(rel)) continue;
    if (ex.skipRe?.test(out)) return null;
    if (ex.stripRe) out = out.replace(ex.stripRe, "");
  }
  return out;
}

/** O arquivo está isento deste padrão (isenção própria ou exceção por caminho)? */
function pathExempt(rel, id, allow) {
  if (allow.selfExempt.some((e) => e.path === rel)) return true;
  return allow.pathExceptions.some((e) => rel === e.path && (e.ids === "*" || e.ids.includes(id)));
}

/**
 * Procura os padrões de conteúdo num texto.
 * @param {string} rel Caminho (ou rótulo, como `commit:abc`) usado no relatório.
 * @param {string} text Conteúdo.
 * @param {{patterns: object[], allow: object}} rules Regras.
 * @param {boolean} [message] Texto de commit ou PR: só padrões com `messages`, e os `messagesOnly` entram.
 * @returns {Array<{rel: string, line: number, id: string, error: boolean}>} Ocorrências.
 */
function scanLines(rel, text, rules, message) {
  const hits = [];
  const active = rules.patterns.filter((p) => p.re && (message ? p.messages || p.messagesOnly : !p.messagesOnly));
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = afterLineExceptions(rel, raw, rules.allow);
    if (line === null) return;
    for (const rule of active) {
      if (inScope(rule, rel, line) && !pathExempt(rel, rule.id, rules.allow) && rule.re.test(line)) hits.push({ rel, line: i + 1, id: rule.id, error: Boolean(rule.error) });
    }
  });
  return hits;
}

/**
 * Ocorrências de uma mensagem de commit ou do título e corpo de um PR.
 * @param {string} label Rótulo para o relatório (`commit:<sha>`, `pr`).
 * @param {string} text Mensagem.
 * @param {{patterns: object[], allow: object}} rules Regras.
 * @returns {Array<{rel: string, line: number, id: string, error: boolean}>} Ocorrências; `error` marca as que reprovam.
 */
export function scanMessage(label, text, rules) {
  return scanLines(label, text, rules, true);
}

/** Ocorrências por caminho (padrões com `path`). */
function pathHits(rel, rules) {
  return rules.patterns.filter((p) => p.pathRe?.test(rel)).map((p) => ({ rel, line: 0, id: p.id, error: false }));
}

/** O arquivo é de regra dos agentes (contado à parte)? */
const isAgentRule = (rel, allow) => allow.agentRules.some((r) => rel === r || (r.endsWith("/") && rel.startsWith(r)));

/** Texto do arquivo, ou null se é binário, grande demais ou ilegível. */
function readText(abs, rel) {
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) return null;
  try {
    const buf = fs.readFileSync(abs);
    return buf.length > MAX_BYTES || buf.subarray(0, 8000).includes(0) ? null : buf.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Escaneia uma lista de arquivos.
 * @param {string} root Raiz.
 * @param {string[]} rels Caminhos relativos (com `/`).
 * @param {{patterns: object[], allow: object}} rules Regras.
 * @returns {{files: object, patterns: object, agentRules: number, hits: object[]}} Contagem por arquivo e por padrão.
 */
export function scanFiles(root, rels, rules) {
  const out = { files: {}, patterns: {}, agentRules: 0, hits: [] };
  for (const rel of rels) {
    if (rel === "package-lock.json") continue;
    const text = readText(path.join(root, rel), rel);
    if (text === null) continue;
    const hits = [...pathHits(rel, rules), ...scanLines(rel, text, rules, false)];
    if (isAgentRule(rel, rules.allow)) { out.agentRules += hits.length; continue; }
    for (const h of hits) {
      out.files[rel] ??= {};
      out.files[rel][h.id] = (out.files[rel][h.id] ?? 0) + 1;
      out.patterns[h.id] = (out.patterns[h.id] ?? 0) + 1;
      out.hits.push(h);
    }
  }
  return out;
}

/**
 * Escaneia a árvore versionada (`git ls-files`).
 * @param {string} [root] Raiz do repositório.
 * @param {{patterns: object[], allow: object}} rules Regras.
 * @returns {{files: object, patterns: object, agentRules: number, hits: object[]}} Contagem.
 */
export function scanTree(root, rules) {
  const list = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  return scanFiles(root, list.split("\0").filter(Boolean), rules);
}

/**
 * Catraca: o que passou do baseline.
 * @param {{files: object, patterns: object}} cur Medição atual.
 * @param {{files?: object, patterns?: object}} base Baseline versionado.
 * @returns {string[]} Violações em português; vazio = passa.
 */
export function compareBaseline(cur, base) {
  const bad = [];
  for (const [rel, ids] of Object.entries(cur.files)) {
    const old = base.files?.[rel];
    if (!old) { bad.push(`${rel}: arquivo novo com ocorrência (${Object.keys(ids).join(", ")})`); continue; }
    for (const [id, n] of Object.entries(ids)) if (n > (old[id] ?? 0)) bad.push(`${rel}: ${id} subiu de ${old[id] ?? 0} para ${n}`);
  }
  for (const [id, n] of Object.entries(cur.patterns)) if (n > (base.patterns?.[id] ?? 0)) bad.push(`total ${id}: ${n} acima do baseline ${base.patterns?.[id] ?? 0}`);
  return bad;
}

/** Mensagens dos commits novos (fora da base e fora do histórico até o corte). */
function newCommitMessages(root, base, cutoff) {
  const args = ["log", "HEAD", `^${base}`, `^${cutoff}`, "--format=%H%x1f%B%x1e"];
  const raw = execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  return raw.split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => r.split("\x1f"));
}

/** Título e corpo do PR a partir do arquivo do evento (`GITHUB_EVENT_PATH`); nada vem de variável de shell. */
function prText(eventFile) {
  const pr = JSON.parse(fs.readFileSync(eventFile, "utf8")).pull_request;
  return pr ? `${pr.title ?? ""}\n${pr.body ?? ""}` : "";
}

/** Ocorrências em commits novos e no PR. */
function messageHits(args, rules) {
  const hits = [];
  if (args.base) for (const [sha, msg] of newCommitMessages(ROOT, args.base, rules.cutoff)) hits.push(...scanMessage(`commit:${sha.slice(0, 8)}`, msg, rules));
  if (args.event) hits.push(...scanMessage("pr", prText(args.event), rules));
  return hits;
}

/** Argumentos de linha de comando. */
function parseArgs(argv) {
  const get = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  return { check: argv.includes("--check"), write: argv.includes("--write-baseline"), base: get("--base"), event: get("--event") };
}

/** Grava o baseline medido; recusa se algum número subiria em relação ao existente. */
function writeBaseline(cur, file) {
  const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const bad = prior ? compareBaseline(cur, prior) : [];
  if (bad.length) { console.error(`Recusado: o baseline só pode descer.\n${bad.join("\n")}`); return 1; }
  const body = { version: 1, patterns: cur.patterns, agentRules: cur.agentRules, files: cur.files };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`Baseline gravado: ${Object.values(cur.patterns).reduce((a, b) => a + b, 0)} ocorrências em ${Object.keys(cur.files).length} arquivos.`);
  return 0;
}

/** Resultado de `--check`: violações da catraca e das mensagens; devolve o código de saída. */
function runCheck(cur, args, rules) {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE), "utf8"));
  const bad = compareBaseline(cur, base);
  const msgs = messageHits(args, rules);
  for (const h of msgs) console.log(`${h.error ? "ERROR" : "WARN"} ${h.rel}:${h.line}:${h.id}`);
  for (const b of bad) console.error(`ERROR ${b}`);
  const errors = bad.length + msgs.filter((h) => h.error).length;
  console.log(errors ? `audit:internal reprovou (${errors}).` : "audit:internal ok: nada acima do baseline.");
  return errors ? 1 : 0;
}

/** Ponto de entrada. */
function main() {
  const args = parseArgs(process.argv.slice(2));
  const rules = loadRules();
  const cur = scanTree(ROOT, rules);
  if (args.write) process.exit(writeBaseline(cur, path.join(ROOT, BASELINE)));
  if (args.check) process.exit(runCheck(cur, args, rules));
  for (const h of cur.hits) console.log(`${h.rel}:${h.line}:${h.id}`);
  console.log(`Total por padrão: ${JSON.stringify(cur.patterns)} · regras de agente (à parte): ${cur.agentRules}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
