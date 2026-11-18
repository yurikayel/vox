/**
 * @file Ciclos de import do cliente (ADR-035, catraca de ciclos), sem E/S: monta o grafo de imports ESM a partir de
 * `{ módulo → código }`, acha os componentes fortemente conexos (Tarjan, iterativo) com mais de um módulo e compara
 * com o baseline versionado. Conta só imports estáticos e reexportações: `import()` é o jeito aceito de quebrar ciclo (carga adiada, sem ciclo de avaliação).
 * Usado por `scripts/cycles-audit.mjs` e pelos testes.
 */

import { importSpecifiers, resolveSpecifier } from "./layers-lib.mjs";

/**
 * Grafo de imports entre os módulos dados (autoimport e alvos fora do conjunto são ignorados).
 * @param {Record<string,string>} sources caminho relativo a `client/js` → código-fonte
 * @returns {Map<string,string[]>} módulo → módulos que ele importa, ordenados
 */
export function buildGraph(sources) {
  const graph = new Map();
  for (const [rel, code] of Object.entries(sources)) {
    const targets = importSpecifiers(code, { dynamic: false }).map((s) => resolveSpecifier(rel, s));
    graph.set(rel, targets);
  }
  for (const [rel, targets] of graph) {
    graph.set(rel, [...new Set(targets.filter((t) => t && t !== rel && graph.has(t)))].sort());
  }
  return graph;
}

function strongConnect(root, graph, state) {
  const work = [[root, 0]];
  while (work.length) {
    const [v, i] = work[work.length - 1];
    if (i === 0) {
      state.index.set(v, state.next);
      state.low.set(v, state.next++);
      state.stack.push(v);
      state.on.add(v);
    }
    const edges = graph.get(v);
    if (i < edges.length) {
      work[work.length - 1][1] = i + 1;
      const w = edges[i];
      if (!state.index.has(w)) work.push([w, 0]);
      else if (state.on.has(w)) state.low.set(v, Math.min(state.low.get(v), state.index.get(w)));
    } else {
      work.pop();
      closeNode(v, work, state);
    }
  }
}

function closeNode(v, work, state) {
  if (work.length) {
    const parent = work[work.length - 1][0];
    state.low.set(parent, Math.min(state.low.get(parent), state.low.get(v)));
  }
  if (state.low.get(v) !== state.index.get(v)) return;
  const comp = [];
  let w;
  do {
    w = state.stack.pop();
    state.on.delete(w);
    comp.push(w);
  } while (w !== v);
  if (comp.length > 1) state.found.push(comp.sort());
}

/**
 * Componentes fortemente conexos com 2+ módulos: cada um é um ciclo "real" (todo membro alcança todo outro).
 * @param {Map<string,string[]>} graph saída de `buildGraph`
 * @returns {string[][]} componentes (membros ordenados), ordenados pelo primeiro membro
 */
export function findCycles(graph) {
  const state = { index: new Map(), low: new Map(), stack: [], on: new Set(), next: 0, found: [] };
  for (const v of [...graph.keys()].sort()) if (!state.index.has(v)) strongConnect(v, graph, state);
  return state.found.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Compara os ciclos atuais com o baseline. Cada componente atual precisa caber (como subconjunto) em algum
 * componente do baseline: ciclo novo ou componente que ganhou módulo reprova; componente menor ou dissolvido passa
 * (e fica como "pago" até o baseline ser podado).
 * @param {string[][]} current componentes atuais
 * @param {string[][]} baseline componentes aceitos
 * @returns {{fresh: string[][], paid: string[][]}} `fresh` reprova; `paid` são componentes do baseline que encolheram ou sumiram
 */
export function compareCycles(current, baseline) {
  const fits = (comp) => baseline.some((b) => comp.every((m) => b.includes(m)));
  const fresh = current.filter((c) => !fits(c));
  const same = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);
  const paid = baseline.filter((b) => !current.some((c) => same(c, b)));
  return { fresh, paid };
}
