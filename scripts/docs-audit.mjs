#!/usr/bin/env node
/**
 * @file Auditoria de documentação — a norma está em docs/process/documentacao.md.
 *
 * Verifica, lendo a árvore sintática (espree, o parser do ESLint), nunca por contagem de linhas:
 *  1. `header`   — todo módulo de client/js e client/aviso abre com um bloco de comentário que diz para que ele serve;
 *  2. `jsdoc`    — todo export desses módulos tem um bloco JSDoc (`/** … *\/`) logo acima;
 *  3. `param`    — toda função exportada documenta cada parâmetro com `@param`;
 *  4. `returns`  — toda função exportada que devolve valor tem `@returns`;
 *  5. `link`     — todo link relativo em Markdown aponta para um arquivo que existe;
 *  6. `orphan`   — todo doc em docs/ é alcançável a partir do índice docs/README.md;
 *  7. `status`   — todo doc em docs/ (menos os gerados em docs/metrics/) abre com o banner `**Status:**`,
 *                  e a primeira palavra dele está no vocabulário fechado de docs/CONTRIBUTING-DOCS.md §2.1.
 *
 * A dívida antiga fica em scripts/docs-debt.json e funciona como catraca: pode diminuir, nunca crescer.
 * Achado novo (fora da dívida) reprova. Dívida paga que continua no arquivo também reprova, para o
 * arquivo não esconder regressão futura: rode `--prune` para tirá-la.
 *
 * Uso: `npm run audit:docs` · `npm run audit:docs -- --prune` (só remove dívida paga; nunca acrescenta).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEBT_FILE = path.join(ROOT, "scripts", "docs-debt.json");
const DOCS_INDEX = "docs/README.md";
/** Pastas com Markdown do projeto. Fora: dependências, worktrees e saídas geradas. */
const MD_ROOTS = [".", "docs", "client", "relay", "workers", "scripts", "tools", "android", "packaging", ".github", ".agents"];
const MD_SKIP = new Set(["node_modules", ".git", ".claude", "dist", "build"]);
/** Código de produção do cliente: o app (`client/js`) e a página leve do aviso (`client/aviso`). */
const JS_ROOTS = ["client/js", "client/aviso"];
/** Dados de demonstração, não código a documentar. */
const JS_SKIP = new Set(["client/js/mock.js"]);
/** Vocabulário fechado do banner de status (docs/CONTRIBUTING-DOCS.md §2.1): vale para qualquer doc. */
const STATUS_GENERAL = ["canônico", "rascunho", "brainstorm", "pesquisa", "auditoria", "histórico", "superseded"];
/** Decisão numerada (ADR, RFC): só o ciclo de vida da decisão. */
const STATUS_DECISION = ["proposed", "accepted", "superseded"];
/** Spec: o vocabulário geral mais o estado de implementação. */
const STATUS_SPEC = [...STATUS_GENERAL, "aceita", "parcial", "implementada"];
/** Arquivos gerados por `npm run audit:complexity`, sem banner. */
const STATUS_SKIP = "docs/metrics/";
/** Quantas linhas do topo (depois do front matter) podem conter o banner. */
const STATUS_HEAD_LINES = 12;

const rel = (abs) => path.relative(ROOT, abs).replaceAll("\\", "/");

/** Lista arquivos com a extensão `ext` sob `dir`; `deep` = false olha só o primeiro nível. */
function listFiles(dir, ext, deep = true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return deep && !MD_SKIP.has(entry.name) ? listFiles(full, ext) : [];
    return entry.name.endsWith(ext) ? [full] : [];
  });
}

// ---------------------------------------------------------------- JavaScript

/** Separação aceita entre o JSDoc e o export: uma quebra de linha, sem linha em branco (como no eslint-plugin-jsdoc). */
const ATTACHED_GAP = /^[ \t]*\r?\n[ \t]*$/;

/** Bloco JSDoc logo acima do nó (sem linha em branco no meio), ou null. Cabeçalho de arquivo não conta. */
function leadingJsDoc(ast, src, node) {
  const before = ast.comments.filter((c) => c.type === "Block" && c.value.startsWith("*") && c.range[1] <= node.range[0]);
  const last = before.at(-1);
  return last && ATTACHED_GAP.test(src.slice(last.range[1], node.range[0])) ? last : null;
}

/** Nome e função (se houver) de um `export` com declaração. */
function exportedSymbol(node) {
  const decl = node.declaration;
  if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") return { name: decl.id?.name || "default", fn: decl.type === "FunctionDeclaration" ? decl : null };
  if (decl.type === "VariableDeclaration") {
    const first = decl.declarations[0];
    const init = first.init;
    const fn = init && /Function/.test(init.type) ? init : null;
    return { name: first.id.name || "default", fn };
  }
  return { name: "default", fn: /Function/.test(decl.type) ? decl : null };
}

/** A função devolve valor? Procura `return <expr>` no próprio corpo, sem entrar em funções internas. */
function returnsValue(fn) {
  if (fn.type === "ArrowFunctionExpression" && fn.expression) return true;
  const stack = [fn.body];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node.type !== "string") continue;
    if (node.type === "ReturnStatement" && node.argument) return true;
    if (node !== fn.body && /Function/.test(node.type)) continue;
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent" || !value || typeof value !== "object") continue;
      stack.push(...(Array.isArray(value) ? value : [value]));
    }
  }
  return false;
}

/** Pula um tipo JSDoc (`{…}`, com chaves aninhadas) que começa em `start`; devolve onde ele termina. */
function skipType(text, start) {
  if (text[start] !== "{") return start;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

/** Tags de um bloco JSDoc: nomes de `@param` de primeiro nível (sem `a.b`) e se tem `@returns`. */
function docTags(comment) {
  const text = comment.value;
  const params = [];
  for (const m of text.matchAll(/@param\s+/g)) {
    const after = skipType(text, m.index + m[0].length);
    const name = /^\s*\[?([\w$.]+)/.exec(text.slice(after))?.[1] || "";
    if (name && !name.includes(".")) params.push(name);
  }
  return { params, returns: /@returns?\b/.test(text) };
}

/** Nome documentável do parâmetro na posição `i`; desestruturação aceita qualquer nome. */
function paramName(param, i) {
  const inner = param.type === "AssignmentPattern" ? param.left : param.type === "RestElement" ? param.argument : param;
  return inner.type === "Identifier" ? inner.name : `#${i + 1}`;
}

/** Achados de `@param` e `@returns` para uma função exportada. */
function functionFindings(name, fn, comment) {
  const tags = docTags(comment);
  const out = [];
  fn.params.forEach((p, i) => {
    const want = paramName(p, i);
    const ok = want.startsWith("#") ? tags.params.length > i : tags.params.includes(want);
    if (!ok) out.push(`param:${name}:${want}`);
  });
  if (returnsValue(fn) && !tags.returns) out.push(`returns:${name}`);
  return out;
}

/** Todos os achados de um módulo JS. */
function jsFindings(file) {
  const src = fs.readFileSync(file, "utf8");
  const ast = espree.parse(src, { ecmaVersion: 2024, sourceType: "module", comment: true, range: true });
  const first = ast.body[0];
  const out = ast.comments.some((c) => c.type === "Block" && (!first || c.range[1] <= first.range[0])) ? [] : ["header"];
  for (const node of ast.body) {
    if (!/^Export(Named|Default)Declaration$/.test(node.type) || !node.declaration) continue;
    const { name, fn } = exportedSymbol(node);
    const comment = leadingJsDoc(ast, src, node);
    if (!comment) out.push(`jsdoc:${name}`);
    else if (fn) out.push(...functionFindings(name, fn, comment));
  }
  return out;
}

// ---------------------------------------------------------------- Markdown

/** Links relativos de um Markdown, sem blocos de código nem código em linha. */
function markdownLinks(src) {
  const text = src.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  const links = [...text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]);
  return links.filter((l) => !/^([a-z][\w+.-]*:|#|\/\/)/i.test(l)).map((l) => {
    const clean = l.split("#")[0].split("?")[0];
    try { return decodeURIComponent(clean); } catch { return clean; }
  }).filter(Boolean);
}

/** Todos os Markdown do projeto (a raiz só no primeiro nível). */
function markdownFiles() {
  return [...new Set(MD_ROOTS.flatMap((d) => listFiles(path.join(ROOT, d), ".md", d !== ".")))];
}

/** Achados `link:<alvo>` por Markdown, e o grafo de links para checar órfãos. */
function markdownFindings(files) {
  const graph = new Map();
  const found = {};
  for (const file of files) {
    const targets = markdownLinks(fs.readFileSync(file, "utf8")).map((l) => path.resolve(path.dirname(file), l));
    graph.set(file, targets);
    const broken = targets.filter((t) => !fs.existsSync(t)).map((t) => `link:${rel(t)}`);
    if (broken.length) found[rel(file)] = [...new Set(broken)];
  }
  return { found, graph };
}

/**
 * Para onde um link leva na busca de órfãos. Link para pasta: o README dela, se houver; sem README,
 * todos os Markdown do primeiro nível (ex.: `metrics/`, cujos arquivos são gerados pelas auditorias).
 */
function linkTargets(file, graph) {
  if (!fs.existsSync(file) || !fs.statSync(file).isDirectory()) return graph.get(file) || [];
  const readme = path.join(file, "README.md");
  return fs.existsSync(readme) ? [readme] : listFiles(file, ".md", false);
}

/** Docs em docs/ que o índice não alcança, seguindo os links a partir de docs/README.md. */
function orphanFindings(graph) {
  const seen = new Set();
  const queue = [path.join(ROOT, DOCS_INDEX)];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...linkTargets(file, graph));
  }
  const docs = [...graph.keys()].filter((f) => rel(f).startsWith("docs/"));
  return Object.fromEntries(docs.filter((f) => !seen.has(f)).map((f) => [rel(f), ["orphan"]]));
}

/** Palavras de status aceitas para o doc: decisão numerada (ADR, RFC), spec ou o vocabulário geral. */
function statusVocabulary(name) {
  if (/^docs\/(adr|rfc)\/\d/.test(name)) return STATUS_DECISION;
  return name.startsWith("docs/specs/") ? STATUS_SPEC : STATUS_GENERAL;
}

/** Primeira palavra do banner `**Status:**` no topo do doc (depois do front matter YAML), em minúsculas; `null` sem banner. */
function bannerStatus(src) {
  const body = src.normalize("NFC").replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const head = body.split(/\r?\n/).slice(0, STATUS_HEAD_LINES).join("\n");
  const match = head.match(/\*\*Status:\*\*\s*`?(\p{L}+)/u);
  return match ? match[1].toLowerCase() : null;
}

/** Achados `status` (doc de docs/ sem banner) e `status:<palavra>` (palavra fora do vocabulário do tipo). */
function statusFindings(files) {
  const found = {};
  for (const file of files) {
    const name = rel(file);
    if (!name.startsWith("docs/") || name.startsWith(STATUS_SKIP)) continue;
    const status = bannerStatus(fs.readFileSync(file, "utf8"));
    if (status === null) found[name] = ["status"];
    else if (!statusVocabulary(name).includes(status)) found[name] = [`status:${status}`];
  }
  return found;
}

// ---------------------------------------------------------------- catraca

/** Achados atuais de todo o projeto: `{ arquivo: [chave, …] }`. */
function collectFindings() {
  const found = {};
  for (const file of JS_ROOTS.flatMap((dir) => listFiles(path.join(ROOT, dir), ".js"))) {
    if (JS_SKIP.has(rel(file))) continue;
    const keys = jsFindings(file);
    if (keys.length) found[rel(file)] = keys;
  }
  const files = markdownFiles();
  const md = markdownFindings(files);
  for (const group of [md.found, orphanFindings(md.graph), statusFindings(files)]) {
    for (const [file, keys] of Object.entries(group)) found[file] = [...(found[file] || []), ...keys];
  }
  return found;
}

/** Compara achados com a dívida: `fresh` reprova (novo), `paid` reprova até sair do arquivo (`--prune`). */
function compare(found, debt) {
  const fresh = [];
  const paid = [];
  for (const [file, keys] of Object.entries(found)) {
    const known = new Set(debt[file] || []);
    fresh.push(...keys.filter((k) => !known.has(k)).map((k) => `${file} ${k}`));
  }
  for (const [file, keys] of Object.entries(debt)) {
    if (file.startsWith("_")) continue;
    const now = new Set(found[file] || []);
    paid.push(...keys.filter((k) => !now.has(k)).map((k) => `${file} ${k}`));
  }
  return { fresh, paid };
}

/** Grava a dívida sem o que já foi pago. Nunca acrescenta achado novo. */
function prune(found, debt) {
  const next = { _leia: debt._leia };
  for (const [file, keys] of Object.entries(debt)) {
    if (file.startsWith("_")) continue;
    const now = new Set(found[file] || []);
    const left = keys.filter((k) => now.has(k));
    if (left.length) next[file] = left;
  }
  fs.writeFileSync(DEBT_FILE, `${JSON.stringify(next, null, 1)}\n`);
}

function main() {
  const debt = JSON.parse(fs.readFileSync(DEBT_FILE, "utf8"));
  const found = collectFindings();
  if (process.argv.includes("--prune")) prune(found, debt);
  const { fresh, paid } = compare(found, process.argv.includes("--prune") ? JSON.parse(fs.readFileSync(DEBT_FILE, "utf8")) : debt);
  const total = Object.entries(found).reduce((n, [, k]) => n + k.length, 0);
  console.log(`Auditoria de documentação: ${total} achados, todos na dívida conhecida salvo os listados abaixo.`);
  for (const line of fresh) console.error(`  NOVO  ${line}`);
  for (const line of paid) console.error(`  PAGO  ${line}  (rode: npm run audit:docs -- --prune)`);
  if (fresh.length || paid.length) {
    console.error(`\nReprovado: ${fresh.length} novo(s), ${paid.length} pago(s) ainda na dívida. Norma: docs/process/documentacao.md`);
    process.exit(1);
  }
}

main();
