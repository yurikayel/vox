/**
 * Núcleo reativo fail-closed (`client/js/shared/signals.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { signal, batch, createScope } from "../client/js/shared/signals.js";

test("signal — get/set e Object.is evita notificar", () => {
  const scope = createScope();
  const s = signal(1);
  let runs = 0;
  scope.effect(() => {
    s.get();
    runs += 1;
  });
  assert.equal(runs, 1);
  s.set(1);
  assert.equal(runs, 1);
  s.set(2);
  assert.equal(runs, 2);
  assert.equal(s.get(), 2);
  scope.dispose();
});

test("signal — peek não inscreve o efeito ativo", () => {
  const scope = createScope();
  const s = signal("a");
  let runs = 0;
  scope.effect(() => {
    s.peek();
    runs += 1;
  });
  s.set("b");
  assert.equal(runs, 1);
  assert.equal(s.peek(), "b");
  scope.dispose();
});

test("signal — freeze raso + update imutável", () => {
  const s = signal([1]);
  assert.throws(() => {
    s.peek().push(2);
  }, TypeError);
  s.update((cur) => [...cur, 2]);
  assert.deepEqual([...s.peek()], [1, 2]);
  const obj = signal({ n: 1 });
  assert.throws(() => {
    obj.peek().n = 2;
  }, TypeError);
  obj.update((cur) => ({ ...cur, n: 2 }));
  assert.equal(obj.peek().n, 2);
});

test("effect — dispose encerra inscrições e roda cleanup", () => {
  const scope = createScope();
  const s = signal(0);
  let cleanups = 0;
  let runs = 0;
  const stop = scope.effect(() => {
    s.get();
    runs += 1;
    return () => {
      cleanups += 1;
    };
  });
  assert.equal(runs, 1);
  s.set(1);
  assert.equal(runs, 2);
  assert.equal(cleanups, 1);
  stop();
  assert.equal(cleanups, 2);
  s.set(2);
  assert.equal(runs, 2);
  scope.dispose();
});

test("effect — dispose idempotente e remove da fila de batch", () => {
  const scope = createScope();
  const s = signal(0);
  let runs = 0;
  const stop = scope.effect(() => {
    s.get();
    runs += 1;
  });
  batch(() => {
    s.set(1);
    stop();
    stop();
  });
  assert.equal(runs, 1);
  scope.dispose();
});

test("batch — agrupa escritas e flush só no lote externo", () => {
  const scope = createScope();
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  scope.effect(() => {
    a.get();
    b.get();
    runs += 1;
  });
  batch(() => {
    a.set(1);
    batch(() => {
      b.set(2);
    });
    assert.equal(runs, 1);
  });
  assert.equal(runs, 2);
  scope.dispose();
});

test("batch — exceção restaura profundidade e ainda faz flush", () => {
  const scope = createScope();
  const s = signal(0);
  let runs = 0;
  scope.effect(() => {
    s.get();
    runs += 1;
  });
  assert.throws(() => {
    batch(() => {
      s.set(1);
      throw new Error("boom");
    });
  }, /boom/);
  assert.equal(runs, 2);
  s.set(2);
  assert.equal(runs, 3);
  scope.dispose();
});

test("scope.effect — aninhado lança", () => {
  const scope = createScope();
  assert.throws(() => {
    scope.effect(() => {
      scope.effect(() => {});
    });
  }, /aninhado/);
  scope.dispose();
});

test("createScope — dispose descarta; pós-dispose effect é no-op", () => {
  const s = signal(0);
  let runs = 0;
  const scope = createScope();
  scope.effect(() => {
    s.get();
    runs += 1;
  });
  s.set(1);
  assert.equal(runs, 2);
  scope.dispose();
  s.set(2);
  assert.equal(runs, 2);
  const stop = scope.effect(() => {
    s.get();
    runs += 1;
  });
  assert.equal(runs, 2);
  stop();
});

test("createScope — scope.effect após await (tela async)", async () => {
  const s = signal(0);
  let runs = 0;
  const scope = createScope();
  await Promise.resolve();
  scope.effect(() => {
    s.get();
    runs += 1;
  });
  s.set(1);
  assert.equal(runs, 2);
  scope.dispose();
  s.set(2);
  assert.equal(runs, 2);
});

test("createScope — escopos irmãos são independentes", () => {
  const s = signal(0);
  let childRuns = 0;
  let parentRuns = 0;
  const parent = createScope();
  const child = createScope();
  parent.effect(() => {
    s.get();
    parentRuns += 1;
  });
  child.effect(() => {
    s.get();
    childRuns += 1;
  });
  child.dispose();
  s.set(1);
  assert.equal(childRuns, 1);
  assert.equal(parentRuns, 2);
  parent.dispose();
  s.set(2);
  assert.equal(parentRuns, 2);
});

test("flush — ciclo reativo estoura MAX_FLUSH em vez de travar", () => {
  const scope = createScope();
  const s = signal(0);
  assert.throws(() => {
    scope.effect(() => {
      s.get();
      s.set(s.peek() + 1);
    });
  }, /ciclo reativo/);
  scope.dispose();
});

test("reentrância limitada — set dentro de effect enfileira flush", () => {
  const scope = createScope();
  const s = signal(0);
  let runs = 0;
  scope.effect(() => {
    const v = s.get();
    runs += 1;
    if (v < 2) s.set(v + 1);
  });
  assert.equal(s.peek(), 2);
  assert.ok(runs >= 3);
  scope.dispose();
});

test("API pública — effect solto não é exportado", async () => {
  const mod = await import("../client/js/shared/signals.js");
  assert.equal(typeof mod.signal, "function");
  assert.equal(typeof mod.batch, "function");
  assert.equal(typeof mod.createScope, "function");
  assert.equal(mod.effect, undefined);
});
