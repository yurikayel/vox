/**
 * @file Métricas por símbolo para a catraca do PM-116, sem E/S: lê o código pela árvore sintática (espree) e mede cada
 * função de produção (linhas, parâmetros, aninhamento, complexidade ciclomática), cada teste (`test`/`it`, só linhas) e o
 * módulo (só linhas). Compara duas medições do mesmo arquivo e só julga o que passa do máximo de docs/HARDENING.md: símbolo
 * novo ou que cruza o máximo reprova; símbolo legado que já estava acima não pode piorar.
 * Usado por `scripts/symbol-ratchet.mjs` e pelos testes.
 *
 * As métricas seguem as regras do ESLint do projeto (`max-lines-per-function` sem comentários e brancas, `max-depth`,
 * `complexity`, `max-params`), mas são uma aproximação própria: o que vale é a mesma medição na base e no código atual,
 * não bater com o ESLint no último ponto. A complexidade não conta `?.` nem valores padrão de parâmetro.
 */

import * as espree from "espree";

/** Máximos de docs/HARDENING.md, por tipo de símbolo. */
export const LIMITS = Object.freeze({
  prod: Object.freeze({ lloc: 30, params: 5, depth: 4, cc: 15 }),
  test: Object.freeze({ lloc: 45 }),
  module: Object.freeze({ lloc: 350 }),
});

const MODULE_KEY = "<módulo>";
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const DEPTH_NODES = new Set(["IfStatement", "ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement", "SwitchStatement", "TryStatement", "WithStatement"]);
const LOOP_NODES = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const LOGICAL_ASSIGN = new Set(["&&=", "||=", "??="]);
const SKIPPED_KEYS = new Set(["loc", "range", "comments", "tokens"]);

/**
 * Tipo de símbolo medido num arquivo, pelo caminho relativo à raiz do repositório.
 * @param {string} rel ex.: "client/js/peers.js", "tests/peers.test.js", "scripts/x.mjs"
 * @returns {"prod"|"test"|null} `null` quando o arquivo não entra na catraca.
 */
export function classifyFile(rel) {
  if (!/\.(js|mjs)$/.test(rel) || rel.endsWith("client/js/mock.js")) return null;
  if (rel.startsWith("tests/")) return "test";
  return /^(client\/js\/|client\/sw\.js$|scripts\/)/.test(rel) ? "prod" : null;
}

function parseSource(source) {
  return espree.parse(source, { ecmaVersion: 2024, sourceType: "module", loc: true, range: true, comment: true });
}

/**
 * Contador de linhas de código por intervalo: não conta linha em branco nem linha só de comentário.
 * @param {string} source Código-fonte.
 * @param {object[]} comments Comentários da árvore sintática.
 * @returns {(from: number, to: number) => number} Linhas de código entre as linhas `from` e `to` (1 a n).
 */
function makeLineCounter(source, comments) {
  const chars = source.split("");
  for (const c of comments) {
    for (let i = c.range[0]; i < c.range[1]; i += 1) if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
  }
  const prefix = [0];
  for (const line of chars.join("").split("\n")) prefix.push(prefix[prefix.length - 1] + (line.trim() === "" ? 0 : 1));
  return (from, to) => prefix[Math.min(to, prefix.length - 1)] - prefix[from - 1];
}

function childNodes(node) {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) if (item && typeof item.type === "string") out.push([key, item]);
  }
  return out;
}

function branchWeight(node) {
  if (node.type === "SwitchCase") return node.test ? 1 : 0;
  if (node.type === "AssignmentExpression") return LOGICAL_ASSIGN.has(node.operator) ? 1 : 0;
  const counted = node.type === "IfStatement" || node.type === "ConditionalExpression" || node.type === "CatchClause" || node.type === "LogicalExpression";
  return counted || LOOP_NODES.has(node.type) ? 1 : 0;
}

/**
 * Aninhamento máximo e complexidade ciclomática do corpo de uma função, sem entrar nas funções internas (cada uma é medida à parte).
 * @param {object} fn Nó de função.
 * @returns {{ depth: number, cc: number }}
 */
function scanBody(fn) {
  const acc = { depth: 0, cc: 1 };
  const visit = (node, depth, isElseIf) => {
    const here = DEPTH_NODES.has(node.type) && !isElseIf ? depth + 1 : depth;
    acc.depth = Math.max(acc.depth, here);
    acc.cc += branchWeight(node);
    for (const [key, child] of childNodes(node)) {
      if (!FUNCTION_TYPES.has(child.type)) visit(child, here, node.type === "IfStatement" && key === "alternate" && child.type === "IfStatement");
    }
  };
  visit(fn.body, 0, false);
  return acc;
}

function keyName(key) {
  if (!key) return "<anon>";
  return key.name ?? String(key.value ?? "<anon>");
}

function functionName(fn, parent) {
  if (fn.type === "FunctionDeclaration") return fn.id?.name ?? "<anon>";
  if (parent?.type === "VariableDeclarator") return keyName(parent.id);
  if (["MethodDefinition", "Property", "PropertyDefinition"].includes(parent?.type)) return keyName(parent.key);
  if (parent?.type === "AssignmentExpression") return keyName(parent.left.property ?? parent.left);
  return "<anon>";
}

function testTitle(call) {
  const [first] = call.arguments;
  if (first?.type === "Literal") return String(first.value);
  return first?.type === "TemplateLiteral" ? first.quasis.map((q) => q.value.cooked).join("…") : null;
}

function isTestCall(call) {
  if (call.type !== "CallExpression") return false;
  const callee = call.callee.type === "MemberExpression" ? call.callee.object : call.callee;
  return callee.type === "Identifier" && (callee.name === "test" || callee.name === "it");
}

function uniqueKey(seen, key) {
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  return n === 1 ? key : `${key}#${n}`;
}

/**
 * Lista as funções de produção (com chave estável: caminho de nomes, `#n` nos repetidos) ou os testes (`test:<título>`).
 * @param {object} ast Árvore sintática do módulo.
 * @param {"prod"|"test"} kind Tipo de símbolo a listar.
 * @returns {{ key: string, node: object }[]}
 */
function listSymbols(ast, kind) {
  const found = [];
  const seen = new Map();
  const walk = (node, parent, path) => {
    let next = path;
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") next = [...path, node.id?.name ?? "<class>"];
    if (node.type === "ObjectExpression" && parent?.type === "VariableDeclarator") next = [...path, keyName(parent.id)];
    if (kind === "prod" && FUNCTION_TYPES.has(node.type)) {
      next = [...path, functionName(node, parent)];
      found.push({ key: uniqueKey(seen, next.join(">")), node });
    }
    if (kind === "test" && isTestCall(node)) {
      const fn = node.arguments.find((a) => FUNCTION_TYPES.has(a.type));
      if (fn) found.push({ key: uniqueKey(seen, `test:${testTitle(node) ?? "<sem título>"}`), node: fn });
    }
    for (const [, child] of childNodes(node)) walk(child, node, next);
  };
  walk(ast, null, []);
  return found;
}

/**
 * Mede os símbolos de um arquivo.
 * @param {string} source Código-fonte do módulo.
 * @param {"prod"|"test"} kind Função de produção ou caso de teste.
 * @returns {Map<string, {lloc: number, params?: number, depth?: number, cc?: number, line: number}>} Chave do símbolo → métricas; `<módulo>` traz as linhas do arquivo todo.
 */
export function measureSource(source, kind) {
  const ast = parseSource(source);
  const lloc = makeLineCounter(source, ast.comments);
  const out = new Map([[MODULE_KEY, { lloc: lloc(1, source.split("\n").length), line: 1 }]]);
  for (const { key, node } of listSymbols(ast, kind)) {
    const base = { lloc: lloc(node.loc.start.line, node.loc.end.line), line: node.loc.start.line };
    out.set(key, kind === "prod" ? { ...base, params: node.params.length, ...scanBody(node) } : base);
  }
  return out;
}

function limitsFor(key, kind) {
  return key === MODULE_KEY ? LIMITS.module : LIMITS[kind];
}

function verdict(before, value, max, metric) {
  if (value <= max) return null;
  if (!before) return `${metric} ${value} > ${max} (símbolo novo acima do máximo)`;
  if (before[metric] <= max) return `${metric} ${before[metric]} → ${value} (passou do máximo ${max})`;
  return value > before[metric] ? `${metric} ${before[metric]} → ${value} (legado acima do máximo piorou)` : null;
}

/**
 * Compara a medição atual com a da base. Só se julga o que passa do máximo: símbolo novo (ou de arquivo novo) acima do
 * máximo reprova; símbolo que cruza o máximo reprova; símbolo legado que já estava acima só não pode piorar.
 * @param {Map<string, object>} base Medição da base (vazia se o arquivo é novo).
 * @param {Map<string, object>} current Medição atual.
 * @param {"prod"|"test"} kind Tipo de símbolo do arquivo.
 * @returns {string[]} Mensagens de violação, em ordem de linha; vazio se a catraca passa.
 */
export function compareSymbols(base, current, kind) {
  const problems = [];
  for (const [key, now] of current) {
    for (const [metric, max] of Object.entries(limitsFor(key, kind))) {
      const text = verdict(base.get(key), now[metric], max, metric);
      if (text) problems.push({ line: now.line, text: `${key}: ${text}` });
    }
  }
  return problems.sort((a, b) => a.line - b.line).map((p) => `linha ${p.line} · ${p.text}`);
}
