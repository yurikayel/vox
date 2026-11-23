/**
 * @file Regras de camada do cliente (ADR-035), sem E/S: classificar um módulo de `client/js`, ler os imports de um
 * código-fonte pela árvore sintática (espree) e dizer se um import atravessa camadas no sentido proibido ou entra
 * num contexto (`vault/`…) sem passar pela porta de entrada.
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
 * Contextos com porta de entrada (ADR-035 §3.2): fora da pasta, só se importa pelas portas listadas.
 * Segunda porta só com motivo escrito no cabeçalho dela:
 * - `vault/envelope.js` é a cifra pura, para quem está abaixo do cofre (identidade) não criar ciclo com `vault/index.js`;
 * - `identity/keys.js` é a chave do aparelho e a de DM, para `crypto-dm.js` e `wallet.js` não carregarem a conta inteira.
 */
export const CONTEXT_DOORS = {
  "vault/": ["vault/index.js", "vault/envelope.js"],
  "identity/": ["identity/index.js", "identity/keys.js"],
};

/**
 * O import entra num contexto por fora da porta? (dentro da própria pasta, vale tudo)
 * @param {string} fromRel módulo que importa
 * @param {string} toRel módulo importado
 * @returns {boolean}
 */
export function bypassesDoor(fromRel, toRel) {
  return Object.entries(CONTEXT_DOORS).some(
    ([dir, doors]) => toRel.startsWith(dir) && !fromRel.startsWith(dir) && !doors.includes(toRel),
  );
}

/**
 * `render/*` monta HTML puro (ADR-035): não pode puxar estado reativo de `shared/signals.js`.
 * @param {string} fromRel módulo que importa
 * @param {string} toRel módulo importado
 * @returns {boolean}
 */
export function isSignalsImportInRender(fromRel, toRel) {
  return layerOf(fromRel) === "render" && toRel === "shared/signals.js";
}

/**
 * Este import é permitido pelas camadas? (`app` → qualquer; `render` → render/base; `base` → base;
 * `labs` → labs/base.) `render` → `shared/signals.js` é sempre proibido (HTML puro).
 * @param {string} fromRel módulo que importa
 * @param {string} toRel módulo importado
 * @returns {boolean}
 */
export function isAllowedImport(fromRel, toRel) {
  if (isSignalsImportInRender(fromRel, toRel)) return false;
  return ALLOWED[layerOf(fromRel)].has(layerOf(toRel));
}

/**
 * Devolve o texto de um nó literal string, ou `null`.
 * @param {object|undefined} node Nó da árvore sintática.
 * @returns {string|null}
 */
function literalSource(node) {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : null;
}

/**
 * Obtém o módulo importado por um nó (import, export-from ou import dinâmico).
 * @param {object} node Nó da árvore sintática.
 * @param {boolean} withDynamic Se import dinâmico conta.
 * @returns {string|null}
 */
function sourceOf(node, withDynamic) {
  if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") return literalSource(node.source);
  if (node.type === "ExportNamedDeclaration") return node.source ? literalSource(node.source) : null;
  if (node.type === "ImportExpression" && withDynamic) return literalSource(node.source);
  return null;
}

/**
 * Percorre a árvore sintática chamando `visit` em cada nó.
 * @param {object} node Nó inicial.
 * @param {Function} visit Função chamada com cada nó.
 */
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
 * @param {{dynamic?: boolean}} [opts] `dynamic: false` ignora `import()` (só carga estática); padrão: inclui
 * @returns {string[]} ex.: ["./peers.js", "../app/context.js"]
 */
export function importSpecifiers(code, { dynamic = true } = {}) {
  const ast = espree.parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const out = new Set();
  walk(ast, (node) => {
    const src = sourceOf(node, dynamic);
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
 * Imports proibidos de um módulo (camada errada ou contexto sem a porta), como chaves "de → para".
 * @param {string} fromRel módulo, relativo a `client/js`
 * @param {string} code código-fonte
 * @returns {string[]}
 */
export function layerViolations(fromRel, code) {
  return importSpecifiers(code)
    .map((spec) => resolveSpecifier(fromRel, spec))
    .filter((toRel) => toRel && (!isAllowedImport(fromRel, toRel) || bypassesDoor(fromRel, toRel)))
    .map((toRel) => `${fromRel} → ${toRel}`)
    .sort();
}
