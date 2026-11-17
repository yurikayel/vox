/**
 * @file Regras de camada do cliente (ADR-035), sem E/S: classificar um módulo de `client/js`, ler os imports de um
 * código-fonte pela árvore sintática (espree) e dizer se um import atravessa camadas no sentido proibido.
 * Usado por `scripts/layers-audit.mjs` e pelos testes.
 */

import path from "node:path";
import * as espree from "espree";

/**
 * Camadas, da de cima para a de baixo. `app` liga tudo; `render` monta HTML; `base` é domínio, rede, cripto e
 * armazenamento; `labs` é o laboratório isolado (labs/ e dungeon/), que só a camada `app` e o próprio laboratório
 * carregam.
 */
export const LAYERS = ["app", "render", "base", "labs"];

/**
 * Camada de um módulo, pelo caminho relativo a `client/js` com barras normais.
 * @param {string} rel ex.: "app/route.js", "render/feed.js", "peers.js"
 * @returns {"app"|"render"|"base"|"labs"}
 */
export function layerOf(rel) {
  if (rel === "app.js" || rel.startsWith("app/")) return "app";
  if (rel === "render.js" || rel.startsWith("render/")) return "render";
  if (rel.startsWith("labs/") || rel.startsWith("dungeon/")) return "labs";
  return "base";
}

const ALLOWED = {
  app: new Set(["app", "render", "base", "labs"]),
  render: new Set(["render", "base"]),
  base: new Set(["base"]),
  labs: new Set(["labs", "base"]),
};

/**
 * Este import é permitido pelas camadas? (`app` → qualquer; `render` → render/base; `base` → base;
 * `labs` → labs/base.)
 * @param {string} fromRel módulo que importa
 * @param {string} toRel módulo importado
 * @returns {boolean}
 */
export function isAllowedImport(fromRel, toRel) {
  return ALLOWED[layerOf(fromRel)].has(layerOf(toRel));
}

function literalSource(node) {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : null;
}

function sourceOf(node) {
  if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") return literalSource(node.source);
  if (node.type === "ExportNamedDeclaration") return node.source ? literalSource(node.source) : null;
  if (node.type === "ImportExpression") return literalSource(node.source);
  return null;
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit));
    else if (child && typeof child === "object") walk(child, visit);
  }
}

/**
 * Especificadores relativos importados por um módulo: estáticos, reexportações e `import()` com texto literal.
 * @param {string} code código-fonte do módulo
 * @returns {string[]} ex.: ["./peers.js", "../app/context.js"]
 */
export function importSpecifiers(code) {
  const ast = espree.parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const out = new Set();
  walk(ast, (node) => {
    const src = sourceOf(node);
    if (src && src.startsWith(".")) out.add(src);
  });
  return [...out];
}

/**
 * Resolve um especificador relativo para o caminho relativo a `client/js`, ou null se sai da pasta.
 * @param {string} fromRel módulo que importa, relativo a `client/js`
 * @param {string} spec especificador, ex.: "../app/context.js"
 * @returns {string|null}
 */
export function resolveSpecifier(fromRel, spec) {
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  return joined.startsWith("../") ? null : joined;
}

/**
 * Imports proibidos de um módulo, como chaves "de → para".
 * @param {string} fromRel módulo, relativo a `client/js`
 * @param {string} code código-fonte
 * @returns {string[]}
 */
export function layerViolations(fromRel, code) {
  return importSpecifiers(code)
    .map((spec) => resolveSpecifier(fromRel, spec))
    .filter((toRel) => toRel && !isAllowedImport(fromRel, toRel))
    .map((toRel) => `${fromRel} → ${toRel}`)
    .sort();
}
