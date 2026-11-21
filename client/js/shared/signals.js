/**
 * @file Núcleo reativo fail-closed (signals rasos, zero dependências).
 *
 * `effect` não é exportado solto: todo efeito nasce dentro de um {@link createScope}.
 * Objetos planos e arrays são congelados na entrada para impedir mutação silenciosa.
 *
 * @module shared/signals
 */

const MAX_FLUSH = 100;

let activeEffect = null;
let batchDepth = 0;
let flushing = false;
const pendingEffects = new Set();

/**
 * Congela superficialmente arrays e objetos planos para pegar mutação in-place.
 * @template T
 * @param {T} value Valor a proteger.
 * @returns {T} Mesmo valor, congelado quando aplicável.
 */
function freezeShallow(value) {
  if (Array.isArray(value)) return Object.freeze(value);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(value);
  }
  return value;
}

/**
 * Limpa inscrições e roda a última função de limpeza de um efeito.
 * @param {object} runner Estrutura interna do efeito.
 * @returns {void}
 */
function clearRunner(runner) {
  if (typeof runner.cleanup === "function") runner.cleanup();
  runner.cleanup = undefined;
  for (const dep of runner.deps) dep.delete(runner);
  runner.deps.clear();
}

/**
 * Executa a fila de efeitos de forma iterativa, com trava contra ciclos infinitos.
 * @returns {void}
 * @throws {Error} Quando o número de passos excede `MAX_FLUSH`.
 */
function flushPending() {
  if (flushing) return;
  flushing = true;
  let steps = 0;
  try {
    while (pendingEffects.size > 0) {
      if (++steps > MAX_FLUSH) {
        pendingEffects.clear();
        throw new Error("signals: ciclo reativo detectado");
      }
      const queue = [...pendingEffects];
      pendingEffects.clear();
      for (const runner of queue) {
        if (!runner.disposed) runner.run();
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * Inscreve o efeito ativo e devolve o valor atual.
 * @param {Set<object>} subs Inscritos do signal.
 * @param {*} value Valor armazenado.
 * @returns {*} Valor armazenado.
 */
function trackAndRead(subs, value) {
  if (activeEffect && !activeEffect.disposed) {
    subs.add(activeEffect);
    activeEffect.deps.add(subs);
  }
  return value;
}

/**
 * Escreve no estado do signal, enfileira inscritos e agenda flush se seguro.
 * @param {{ value: *, subs: Set<object> }} state Estado interno do signal.
 * @param {*} next Próximo valor.
 * @returns {void}
 */
function writeSignal(state, next) {
  if (Object.is(state.value, next)) return;
  state.value = freezeShallow(next);
  for (const sub of state.subs) {
    if (!sub.disposed) pendingEffects.add(sub);
  }
  if (batchDepth === 0 && !activeEffect) flushPending();
}

/**
 * Cria um efeito interno (não exportado: uso exclusivo via {@link createScope}).
 * @param {() => (void|(() => void))} fn Callback reativo.
 * @returns {() => void} Função `dispose`.
 * @throws {Error} Se chamado dentro de outro efeito em execução.
 */
function createEffect(fn) {
  if (activeEffect) throw new Error("signals: efeito aninhado proibido");
  const runner = {
    deps: new Set(),
    disposed: false,
    cleanup: undefined,
    run() {
      if (runner.disposed) return;
      clearRunner(runner);
      const prev = activeEffect;
      activeEffect = runner;
      try {
        runner.cleanup = fn();
      } finally {
        activeEffect = prev;
      }
    },
    dispose() {
      if (runner.disposed) return;
      runner.disposed = true;
      pendingEffects.delete(runner);
      clearRunner(runner);
    }
  };
  runner.run();
  if (batchDepth === 0) flushPending();
  return runner.dispose;
}

/**
 * Cria um valor reativo raso com proteção contra mutação in-place.
 * @template T
 * @param {T} initialValue Valor inicial.
 * @returns {{ get: () => T, set: (next: T) => void, update: (fn: (cur: T) => T) => void, peek: () => T }} Signal.
 */
export function signal(initialValue) {
  const state = { value: freezeShallow(initialValue), subs: new Set() };
  return {
    get: () => trackAndRead(state.subs, state.value),
    set: (next) => writeSignal(state, next),
    update: (fn) => writeSignal(state, fn(state.value)),
    peek: () => state.value
  };
}

/**
 * Agrupa escritas em signals para disparar efeitos uma única vez ao final.
 * @template T
 * @param {() => T} fn Bloco de atualizações em lote.
 * @returns {T} Retorno de `fn`.
 */
export function batch(fn) {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && !activeEffect) flushPending();
  }
}

/**
 * Cria um escopo descartável — única porta para registrar efeitos reativos.
 * Se já descartado, `effect()` vira no-op (seguro após `await` em telas).
 * @returns {{ effect: (fn: () => (void|(() => void))) => (() => void), dispose: () => void }} Escopo.
 */
export function createScope() {
  const disposers = new Set();
  let disposed = false;
  return {
    effect(fn) {
      if (disposed) return () => {};
      const stop = createEffect(fn);
      disposers.add(stop);
      return stop;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of [...disposers]) stop();
      disposers.clear();
    }
  };
}
