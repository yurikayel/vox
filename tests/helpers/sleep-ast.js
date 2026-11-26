/**
 * @file Conta esperas fixas de um módulo pela árvore sintática (espree): serve à catraca `tests/sem-esperas-fixas.test.js`.
 * Vê todo jeito de dormir que o Node oferece: `new Promise` embrulhando `setTimeout`/`setImmediate`/`setInterval` (global,
 * `globalThis.x`, `timers.x`), `timers/promises` por `import`, `require` ou `import()` (qualquer apelido ou namespace),
 * `scheduler.wait`/`scheduler.yield`, `promisify(setTimeout)` e helpers que só dormem (a definição não conta, as chamadas sim).
 * `setImmediate` isolado é barreira de uma passada do laço de eventos e não conta; em laço, `forEach`/`map` ou recursão conta.
 */
import * as espree from "espree";

const TIMER_KINDS = { setTimeout: "setTimeout", setInterval: "setTimeout", setImmediate: "setImmediate" };
const GLOBALS = new Set(["globalThis", "global", "window", "self"]);
const PROMISES_MODULE = /^(node:)?timers\/promises$/;
const PLAIN_MODULE = /^(node:)?timers$/;
const LOOPS = new Set(["ForStatement", "WhileStatement", "DoWhileStatement", "ForOfStatement", "ForInStatement"]);
const ITERATORS = new Set(["forEach", "map", "flatMap", "filter", "reduce", "some", "every", "from"]);
const isFunction = (n) => /Function/.test(n.type);

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

/** Fonte do módulo em `require("x")`, `await import("x")` ou `import("x")`; `null` se não for nenhum dos dois. */
function moduleSource(node) {
  const inner = node?.type === "AwaitExpression" ? node.argument : node;
  if (inner?.type === "ImportExpression" && inner.source.type === "Literal") return String(inner.source.value);
  const isRequire = inner?.type === "CallExpression" && inner.callee.type === "Identifier" && inner.callee.name === "require";
  return isRequire && inner.arguments[0]?.type === "Literal" ? String(inner.arguments[0].value) : null;
}

function newBindings() {
  return { named: new Map(), namespaces: new Set(), schedulers: new Set(), plainNamed: new Map(), plainNs: new Set() };
}

/** Registra um nome local que veio de `timers`/`timers/promises` (`imported` é o nome original; `"*"` para o módulo todo). */
function bindName(b, source, imported, local) {
  const promises = PROMISES_MODULE.test(source);
  if (!promises && !PLAIN_MODULE.test(source)) return;
  if (imported === "*") (promises ? b.namespaces : b.plainNs).add(local);
  else if (imported === "scheduler") b.schedulers.add(local);
  else if (TIMER_KINDS[imported]) (promises ? b.named : b.plainNamed).set(local, TIMER_KINDS[imported]);
}

function bindDeclarator(b, node) {
  const source = moduleSource(node.init);
  if (!source) return;
  if (node.id.type === "Identifier") {
    bindName(b, source, "*", node.id.name);
    return;
  }
  for (const prop of node.id.type === "ObjectPattern" ? node.id.properties : []) {
    if (prop.type === "Property" && prop.value.type === "Identifier") bindName(b, source, prop.key.name, prop.value.name);
  }
}

/** Nomes ligados a `timers`/`timers/promises` por `import`, `require` ou `import()` (apelidos incluídos). */
function collectBindings(ast) {
  const b = newBindings();
  walk(ast, (n) => {
    if (n.type === "ImportDeclaration") {
      for (const spec of n.specifiers) bindName(b, n.source.value, spec.type === "ImportSpecifier" ? spec.imported.name : "*", spec.local.name);
    }
    if (n.type === "VariableDeclarator" && n.id) bindDeclarator(b, n);
  });
  return b;
}

/** Que temporizador é essa expressão (`setTimeout`, `globalThis.setTimeout`, `timers.setTimeout`...); `null` se não for um. */
function timerRefKind(node, b) {
  if (node.type === "Identifier") return b.plainNamed.get(node.name) || b.named.get(node.name) || TIMER_KINDS[node.name] || null;
  if (node.type !== "MemberExpression" || node.computed || !TIMER_KINDS[node.property.name]) return null;
  const { object } = node;
  const known = object.type === "Identifier" && (GLOBALS.has(object.name) || b.plainNs.has(object.name) || b.namespaces.has(object.name));
  const source = moduleSource(object) || "";
  return known || PROMISES_MODULE.test(source) || PLAIN_MODULE.test(source) ? TIMER_KINDS[node.property.name] : null;
}

const isPromisify = (node) => node.type === "CallExpression"
  && (node.callee.name === "promisify" || (node.callee.type === "MemberExpression" && node.callee.property.name === "promisify"));

/** `scheduler.wait(ms)` / `scheduler.yield()` de `timers/promises` (importado, por namespace ou `timers.scheduler`). */
function schedulerKind(callee, b) {
  if (callee.type !== "MemberExpression" || !["wait", "yield"].includes(callee.property.name)) return null;
  const o = callee.object;
  const direct = o.type === "Identifier" && b.schedulers.has(o.name);
  const viaNamespace = o.type === "MemberExpression" && o.property.name === "scheduler" && o.object.type === "Identifier"
    && (b.namespaces.has(o.object.name) || b.plainNs.has(o.object.name));
  if (!direct && !viaNamespace) return null;
  return callee.property.name === "wait" ? "setTimeout" : "setImmediate";
}

/** Chamada que já devolve promessa de espera: `timers/promises` (qualquer forma), `scheduler` ou `promisify(setTimeout)(...)`. */
function promisesTimerKind(node, b) {
  if (node.type !== "CallExpression") return null;
  const { callee } = node;
  if (callee.type === "Identifier") return b.named.get(callee.name) || null;
  if (isPromisify(callee)) return timerRefKind(callee.arguments[0] || {}, b);
  const scheduled = schedulerKind(callee, b);
  if (scheduled || callee.type !== "MemberExpression") return scheduled;
  const viaNamespace = callee.object.type === "Identifier"
    ? b.namespaces.has(callee.object.name)
    : PROMISES_MODULE.test(moduleSource(callee.object) || "");
  return viaNamespace && TIMER_KINDS[callee.property.name] ? TIMER_KINDS[callee.property.name] : null;
}

/** `new Promise(... <temporizador>(...) ...)`: o embrulho clássico de dormir; `setTimeout` (ou `setInterval`) prevalece. */
function promiseWrapKind(node, b) {
  if (node.type !== "NewExpression" || node.callee.name !== "Promise" || !node.arguments[0]) return null;
  const kinds = new Set();
  walk(node.arguments[0], (n) => {
    const kind = n.type === "CallExpression" ? timerRefKind(n.callee, b) : null;
    if (kind) kinds.add(kind);
  });
  return kinds.has("setTimeout") ? "setTimeout" : [...kinds][0] || null;
}

const sleeperKind = (node, b) => promisesTimerKind(node, b) || promiseWrapKind(node, b);

/** Nome com que a função pode se chamar (declaração, variável ou expressão nomeada). */
function functionName(fn, parent) {
  if (fn.id) return fn.id.name;
  return parent?.type === "VariableDeclarator" && parent.id.type === "Identifier" ? parent.id.name : null;
}

function callsItself(fn, name) {
  let found = false;
  walk(fn.body, (n) => { if (n.type === "CallExpression" && n.callee.name === name) found = true; });
  return found;
}

/** O ponto se repete: dentro de laço, de callback de `forEach`/`map`/`Array.from` ou de função recursiva. */
function repeats(ancestors) {
  return ancestors.some((a, i) => {
    if (LOOPS.has(a.type)) return true;
    if (!isFunction(a)) return false;
    const up = ancestors[i - 1];
    const iterated = up?.type === "CallExpression" && up.callee.type === "MemberExpression"
      && ITERATORS.has(up.callee.property.name) && up.arguments.includes(a);
    const name = functionName(a, up);
    return iterated || Boolean(name && callsItself(a, name));
  });
}

/** `setTimeout` é sempre espera por tempo; `setImmediate` só conta quando se repete (ver `repeats`). */
const countsHere = (kind, ancestors) => kind === "setTimeout" || repeats(ancestors);

/** O corpo de uma função é só a espera (`const settle = (ms) => new Promise(...)`): vira helper e conta nas chamadas. */
function soleBody(fn) {
  const body = fn.body.type === "BlockStatement" && fn.body.body.length === 1 ? fn.body.body[0] : fn.body;
  if (body.type === "ReturnStatement" || body.type === "ExpressionStatement") return body.argument || body.expression;
  return body;
}

function helperDefinitions(ast, b) {
  const helpers = new Map();
  const bodies = new Set();
  const add = (name, kind, node) => {
    if (!kind) return;
    helpers.set(name, kind);
    bodies.add(node);
  };
  const consider = (name, init) => {
    if (!init) return;
    if (isPromisify(init)) {
      add(name, timerRefKind(init.arguments[0] || {}, b), init);
      return;
    }
    if (!isFunction(init)) return;
    const body = soleBody(init);
    const call = body.type === "AwaitExpression" ? body.argument : body;
    add(name, sleeperKind(call, b), call);
  };
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier") consider(n.id.name, n.init);
    if (n.type === "FunctionDeclaration" && n.id) consider(n.id.name, n);
  });
  return { helpers, bodies };
}

function parse(src) {
  try {
    return espree.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    return espree.parse(src, { ecmaVersion: "latest", sourceType: "script" });
  }
}

/**
 * Conta esperas fixas de um código-fonte (ver o cabeçalho do módulo para o que vale como espera).
 * @param {string} src Código-fonte de um módulo ES (ou script CommonJS).
 * @returns {number} Quantidade de esperas.
 */
export function countSleepsIn(src) {
  const ast = parse(src);
  const b = collectBindings(ast);
  const { helpers, bodies } = helperDefinitions(ast, b);
  let count = 0;
  walk(ast, (node, ancestors) => {
    if (bodies.has(node)) return false;
    const kind = sleeperKind(node, b);
    if (kind) {
      if (countsHere(kind, ancestors)) count += 1;
      return false;
    }
    const callee = node.type === "CallExpression" && node.callee.type === "Identifier" ? node.callee.name : null;
    if (callee && helpers.has(callee) && countsHere(helpers.get(callee), ancestors)) count += 1;
    return true;
  });
  return count;
}
