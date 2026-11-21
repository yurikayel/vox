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
  scope.dispose();
});

test("signal — freeze copia rasa (sem alias) e cobre Object.create(null)", () => {
  const arr = [1];
  const s = signal(arr);
  arr.push(2);
  assert.deepEqual([...s.peek()], [1]);
  assert.throws(() => {
    s.peek().push(3);
  }, TypeError);
  s.update((cur) => [...cur, 2]);
  assert.deepEqual([...s.peek()], [1, 2]);
  const bag = Object.create(null);
  bag.n = 1;
  const s2 = signal(bag);
  assert.throws(() => {
    s2.peek().n = 2;
  }, TypeError);
});

test("effect — dispose, cleanup e remoção da fila de batch", () => {
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
  s.set(1);
  assert.equal(runs, 2);
  assert.equal(cleanups, 1);
  batch(() => {
    s.set(2);
    stop();
    stop();
  });
  assert.equal(runs, 2);
  assert.equal(cleanups, 2);
  scope.dispose();
});

test("batch — agrupa escritas; exceção restaura profundidade", () => {
  const scope = createScope();
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  scope.effect(() => {
    a.get();
    b.get();
    runs += 1;
  });
  assert.throws(() => {
    batch(() => {
      a.set(1);
      batch(() => {
        b.set(2);
      });
      throw new Error("boom");
    });
  }, /boom/);
  assert.equal(runs, 2);
  scope.dispose();
});

test("scope.effect — aninhado lança; pós-dispose é no-op", () => {
  const scope = createScope();
  assert.throws(() => {
    scope.effect(() => {
      scope.effect(() => {});
    });
  }, /aninhado/);
  scope.dispose();
  let runs = 0;
  scope.effect(() => {
    runs += 1;
  });
  assert.equal(runs, 0);
});

test("scope.effect — exceção na 1ª execução não deixa inscrição zumbi", () => {
  const scope = createScope();
  const s = signal(0);
  let runs = 0;
  assert.throws(() => {
    scope.effect(() => {
      s.get();
      runs += 1;
      throw new Error("boom");
    });
  }, /boom/);
  scope.dispose();
  s.set(1);
  assert.equal(runs, 1);
});

test("flush — efeito que lança não descarta irmãos pendentes", () => {
  const scope = createScope();
  const a = signal(0);
  const b = signal(0);
  let bRuns = 0;
  scope.effect(() => {
    a.get();
    if (a.peek() > 0) throw new Error("a-fail");
  });
  scope.effect(() => {
    b.get();
    bRuns += 1;
  });
  assert.equal(bRuns, 1);
  assert.throws(() => {
    batch(() => {
      a.set(1);
      b.set(1);
    });
  }, /a-fail/);
  b.set(2);
  assert.ok(bRuns >= 2);
  scope.dispose();
});

test("scope — memo, onCleanup, onError e AbortSignal", () => {
  const errs = [];
  const scope = createScope({ onError: (e) => errs.push(String(e.message || e)) });
  const n = signal(2);
  const doubled = scope.memo(() => n.get() * 2);
  let cleaned = 0;
  scope.onCleanup(() => {
    cleaned += 1;
  });
  scope.effect(() => {
    if (n.get() < 0) throw new Error("negativo");
  });
  assert.equal(doubled.get(), 4);
  assert.equal(scope.signal.aborted, false);
  n.set(-1);
  assert.deepEqual(errs, ["negativo"]);
  scope.dispose();
  assert.equal(cleaned, 1);
  assert.equal(scope.signal.aborted, true);
});

test("scope.resource — cancela fetch anterior e ignora pós-dispose", async () => {
  const scope = createScope();
  const aborted = [];
  const res = scope.resource((sig, label) => new Promise((resolve) => {
    sig.addEventListener("abort", () => aborted.push(label), { once: true });
    setTimeout(() => resolve(`val:${label}`), label === "lento" ? 40 : 5);
  }), "init");
  const p1 = res.reload("lento");
  const p2 = res.reload("rapido");
  await Promise.all([p1, p2]);
  assert.equal(res.data.peek(), "val:rapido");
  assert.deepEqual(aborted, ["lento"]);
  scope.dispose();
  await res.reload("pos-dispose");
  assert.equal(res.data.peek(), "val:rapido");
});

test("flush — ciclo reativo estoura MAX_FLUSH", () => {
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

test("API pública — effect solto não é exportado", async () => {
  const mod = await import("../client/js/shared/signals.js");
  assert.equal(typeof mod.createScope, "function");
  assert.equal(mod.effect, undefined);
});
