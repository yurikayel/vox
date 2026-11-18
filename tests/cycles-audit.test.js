/**
 * ADR-035 — catraca de ciclos de import: grafo por AST, componentes fortemente conexos e comparação com o baseline.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, compareCycles, findCycles } from "../scripts/cycles-lib.mjs";

const mod = (...imports) => imports.map((i) => `import "${i}";`).join("\n");

test("ciclos - A→B→C→A é um componente; cadeia sem volta não é", () => {
  const ciclo = buildGraph({ "a.js": mod("./b.js"), "b.js": mod("./c.js"), "c.js": mod("./a.js"), "d.js": mod("./a.js") });
  assert.deepEqual(findCycles(ciclo), [["a.js", "b.js", "c.js"]]);
  assert.deepEqual(findCycles(buildGraph({ "a.js": mod("./b.js"), "b.js": "" })), []);
});

test("ciclos - import() literal não conta; reexportação e import de pasta acima contam", () => {
  const g = buildGraph({ "x/a.js": `export * from "../b.js";`, "b.js": `export const f = () => import("./x/a.js");` });
  assert.deepEqual(findCycles(g), []);
  const h = buildGraph({ "x/a.js": `export * from "../b.js";`, "b.js": mod("./x/a.js") });
  assert.deepEqual(findCycles(h), [["b.js", "x/a.js"]]);
});

test("catraca - ciclo existente passa; ciclo novo falha", () => {
  const base = [["a.js", "b.js"]];
  assert.deepEqual(compareCycles([["a.js", "b.js"]], base), { fresh: [], paid: [] });
  const novo = compareCycles([["a.js", "b.js"], ["c.js", "d.js"]], base);
  assert.deepEqual(novo.fresh, [["c.js", "d.js"]]);
});

test("catraca - componente que ganhou módulo falha; componente menor passa e aparece como pago", () => {
  const base = [["a.js", "b.js", "c.js"]];
  assert.deepEqual(compareCycles([["a.js", "b.js", "c.js", "d.js"]], base).fresh, [["a.js", "b.js", "c.js", "d.js"]]);
  const menor = compareCycles([["a.js", "b.js"]], base);
  assert.deepEqual(menor.fresh, []);
  assert.deepEqual(menor.paid, base);
  assert.deepEqual(compareCycles([], base).paid, base);
});
