/**
 * @file Catraca de esperas fixas nos testes, contada pela árvore sintática (espree), em todos os arquivos: o total não
 * pode crescer. Vê `new Promise` que embrulha `setTimeout`/`setImmediate`, chamadas de `setTimeout`/`setImmediate` de
 * `node:timers/promises` (qualquer apelido, por namespace) e chamadas de helpers que só dormem. `setImmediate` isolado é
 * barreira de uma passada do laço de eventos e não conta; em laço conta. Espera por condição usa `waitUntil`
 * (`tests/helpers/wait-until.js`); dormir tempo fixo falha sob carga. Os restantes são timers simulados, ordenação de
 * partida entre pares, provas de ausência sem barreira observável e o `realSleep(4)` do relógio virtual do Fairplay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const EXCLUDED = /sem-esperas-fixas/;
const TIMER_NAMES = new Set(["setTimeout", "setImmediate"]);
const TIMERS_PROMISES = /^(node:)?timers\/promises$/;
/** Medido por AST: 33 (eram 32 pelo regex; a contagem passou a ver `realSleep` de `timers/promises` e embrulhos com tempo variável, e deixou de contar a definição de helper sem chamadas: mede mais, não afrouxa). Antes, com helpers contados: 32, agora sem exclusões (VTT/Fairplay/Diorama já estavam em zero ao tirar a lista de exceções; as esperas de `until`/laços de 0 ms viraram `waitUntil`) (eram 35 antes do SUB-09 parte 5: `peer-sync` passou a drenar as entregas em voo, e a espera final de `pm01-lazy-fifth-screen` e de `credential-persistence` era inútil; antes 35, eram 41 antes do SUB-09 parte 4: 6 laços de espera por tempo viraram `waitUntil` em aviso, sorteio, edição de post, entrada P2P e memória central; antes 51; 10 convertidas para `waitUntil` em lead-tab, círculos, aviso consultivo e explode; antes, 15 só nos 5 helpers apontados, antes de converter 8 delas). */
const CEILING = 33;

/** Percorre a árvore: `visit(node, ancestrais)`; devolve `false` para não descer nos filhos. */
function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== "string") return;
  if (visit(node, ancestors) === false) return;
  const next = [...ancestors, node];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, next));
    else if (value && typeof value === "object") walk(value, visit, next);
  }
}

/** Nomes locais que apontam para `setTimeout`/`setImmediate` de `timers/promises` (com qualquer apelido) e namespaces dele. */
function timerImports(ast) {
  const named = new Map();
  const namespaces = new Set();
  for (const node of ast.body.filter((n) => n.type === "ImportDeclaration" && TIMERS_PROMISES.test(n.source.value))) {
    for (const spec of node.specifiers) {
      if (spec.type === "ImportSpecifier") { if (TIMER_NAMES.has(spec.imported.name)) named.set(spec.local.name, spec.imported.name); }
      else namespaces.add(spec.local.name);
    }
  }
  return { named, namespaces };
}

/** Qual temporizador a chamada usa (`setTimeout` ou `setImmediate`), pelo nome original; `null` se não for de `timers/promises`. */
function promisesTimerKind(node, imports) {
  if (node.type !== "CallExpression") return null;
  const { callee } = node;
  if (callee.type === "Identifier") return imports.named.get(callee.name) || null;
  const viaNamespace = callee.type === "MemberExpression" && callee.object.type === "Identifier" && imports.namespaces.has(callee.object.name);
  return viaNamespace && TIMER_NAMES.has(callee.property.name) ? callee.property.name : null;
}

/** `new Promise(... setTimeout|setImmediate(...) ...)`: o embrulho clássico de dormir; devolve o temporizador usado. */
function promiseWrapKind(node) {
  if (node.type !== "NewExpression" || node.callee.name !== "Promise") return null;
  let kind = null;
  walk(node.arguments[0], (n) => {
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && TIMER_NAMES.has(n.callee.name)) kind = n.callee.name;
  });
  return kind;
}

const sleeperKind = (node, imports) => promisesTimerKind(node, imports) || promiseWrapKind(node);
const LOOPS = new Set(["ForStatement", "WhileStatement", "DoWhileStatement", "ForOfStatement", "ForInStatement"]);

/**
 * `setTimeout` é sempre espera por tempo. `setImmediate` isolado é só uma barreira de uma passada do laço de eventos
 * (deterministica) e não conta; dentro de um laço vira espera por tentativas e conta.
 */
const countsHere = (kind, ancestors) => kind === "setTimeout" || ancestors.some((a) => LOOPS.has(a.type));

/** O corpo de uma função é só a espera (`const settle = (ms) => new Promise(...)`): vira helper e conta nas chamadas. */
function soleBody(fn) {
  const body = fn.body.type === "BlockStatement" && fn.body.body.length === 1 ? fn.body.body[0] : fn.body;
  if (body.type === "ReturnStatement" || body.type === "ExpressionStatement") return body.argument || body.expression;
  return body;
}

function helperDefinitions(ast, imports) {
  const helpers = new Map();
  const bodies = new Set();
  const consider = (name, fn) => {
    if (!fn || !/Function/.test(fn.type)) return;
    let body = soleBody(fn);
    if (body.type === "AwaitExpression") body = body.argument;
    const kind = sleeperKind(body, imports);
    if (kind) { helpers.set(name, kind); bodies.add(body); }
  };
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier") consider(n.id.name, n.init);
    if (n.type === "FunctionDeclaration" && n.id) consider(n.id.name, n);
  });
  return { helpers, bodies };
}

/**
 * Conta esperas fixas de um texto pela árvore sintática (espree), sem regex sobre o código: `new Promise` que embrulha
 * `setTimeout`/`setImmediate`, chamadas de `setTimeout`/`setImmediate` importados de `node:timers/promises` (com qualquer
 * apelido ou por namespace) e chamadas de helpers cujo corpo é só uma dessas esperas (a definição não conta, as chamadas sim).
 * `setImmediate` só conta dentro de laço (ver `countsHere`).
 * @param {string} src Código-fonte de um módulo ES.
 * @returns {number} Quantidade de esperas.
 */
export function countSleepsIn(src) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  const imports = timerImports(ast);
  const { helpers, bodies } = helperDefinitions(ast, imports);
  let count = 0;
  walk(ast, (node, ancestors) => {
    if (bodies.has(node)) return false;
    const kind = sleeperKind(node, imports);
    if (kind) { if (countsHere(kind, ancestors)) count += 1; return false; }
    const callee = node.type === "CallExpression" && node.callee.type === "Identifier" ? node.callee.name : null;
    if (callee && helpers.has(callee) && countsHere(helpers.get(callee), ancestors)) count += 1;
    return true;
  });
  return count;
}

function countSleeps() {
  const perFile = {};
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".test.js") && !EXCLUDED.test(n))) {
    const n = countSleepsIn(readFileSync(DIR + f, "utf8"));
    if (n) perFile[f] = n;
  }
  return perFile;
}

test("esperas fixas nos testes não crescem além do medido", () => {
  const perFile = countSleeps();
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);
  assert.ok(total <= CEILING, `${total} esperas fixas > ${CEILING}: use waitUntil. ${JSON.stringify(perFile)}`);
});

test("um helper settle(ms) plantado é contado (chamadas, não a definição)", () => {
  const planted = [
    "const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));",
    "await settle(); await settle(20);",
  ].join("\n");
  assert.equal(countSleepsIn(planted), 2);
  assert.equal(countSleepsIn("await new Promise((r) => setTimeout(r, 50));"), 1);
  assert.equal(countSleepsIn("await waitUntil(() => ok);"), 0);
});

test("a catraca vê `timers/promises` com qualquer apelido, por namespace e `setImmediate` em laço (um realSleep novo seria pego)", () => {
  const imp = (names, from = "node:timers/promises") => `import ${names} from "${from}";\n`;
  assert.equal(countSleepsIn(`${imp("{ setTimeout as realSleep }")}await realSleep(4);`), 1);
  assert.equal(countSleepsIn(`${imp("{ setTimeout as nap }", "timers/promises")}await nap(1); await nap(2);`), 2);
  assert.equal(countSleepsIn(`${imp("* as t")}await t.setTimeout(5);`), 1);
  assert.equal(countSleepsIn(`${imp("{ setImmediate as tick }")}for (let i = 0; i < 9; i += 1) await tick();`), 1);
  assert.equal(countSleepsIn("for (let i = 0; i < 9; i += 1) await new Promise((r) => setImmediate(r));"), 1);
  assert.equal(countSleepsIn("const wait = (ms) => new Promise((r) => setTimeout(r, ms));\nawait wait(ms);"), 1);
});

test("a catraca não conta o que não é espera por tempo: setImmediate isolado, outro módulo, helper sem chamadas", () => {
  assert.equal(countSleepsIn("await new Promise((r) => setImmediate(r));"), 0);
  assert.equal(countSleepsIn('import { setTimeout as sleep } from "node:fs";\nawait sleep(1);'), 0);
  assert.equal(countSleepsIn("await waitUntil(() => ok);"), 0);
  assert.equal(countSleepsIn("const settle = () => new Promise((r) => setTimeout(r, 10));"), 0, "a definição sem chamadas não conta");
});
