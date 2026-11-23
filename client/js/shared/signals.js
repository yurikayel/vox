/**
 * @file Núcleo reativo fail-closed (signals rasos, zero dependências).
 *
 * `effect` não é exportado solto: todo efeito nasce dentro de um {@link createScope}.
 * Objetos planos e arrays são congelados na entrada para impedir mutação silenciosa.
 * Escopo traz `AbortSignal`, `onCleanup`, `memo` e `resource` (corridas async / troca de rota).
 *
 * @module shared/signals
 */

const MAX_FLUSH = 100;

let activeEffect = null;
let batchDepth = 0;
let flushing = false;
const pendingEffects = new Set();

/**
 * Congela uma cópia rasa de arrays e objetos planos (`{}` ou `Object.create(null)`).
 * @template T
 * @param {T} value Valor a proteger.
 * @returns {T} Cópia congelada quando aplicável (não aliasa o original).
 */
function freezeShallow(value) {
  if (Array.isArray(value)) return /** @type {T} */ (Object.freeze(value.slice()));
  if (!value || typeof value !== "object") return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  return /** @type {T} */ (Object.freeze({ ...value }));
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
      const runner = pendingEffects.values().next().value;
      pendingEffects.delete(runner);
      if (!runner.disposed) runner.run();
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
 * Executa a função de um efeito com tratamento opcional de erro.
 * @param {() => (void|(() => void))} fn Callback reativo.
 * @param {((err: unknown) => void)|null} onError Handler de erro do escopo.
 * @returns {void|(() => void)} Função de limpeza opcional.
 */
function invokeWithBoundary(fn, onError) {
  try {
    return fn();
  } catch (err) {
    if (typeof onError === "function") {
      onError(err);
      return undefined;
    }
    throw err;
  }
}

/**
 * Monta a estrutura interna de um efeito (run/dispose).
 * @param {() => (void|(() => void))} fn Callback reativo.
 * @param {((err: unknown) => void)|null} onError Handler de erro do escopo.
 * @returns {object} Runner interno.
 */
function makeRunner(fn, onError) {
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
        runner.cleanup = invokeWithBoundary(fn, onError);
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
  return runner;
}

/**
 * Cria e executa um efeito interno preso a um handler opcional de erro.
 * @param {() => (void|(() => void))} fn Callback reativo.
 * @param {((err: unknown) => void)|null} onError Handler de erro do escopo.
 * @param {((stop: () => void) => void)|null} [onReady] Recebe `dispose` antes da 1ª execução.
 * @returns {() => void} Função `dispose`.
 * @throws {Error} Se chamado dentro de outro efeito em execução.
 */
function createEffect(fn, onError, onReady = null) {
  if (activeEffect) throw new Error("signals: efeito aninhado proibido");
  const runner = makeRunner(fn, onError);
  if (typeof onReady === "function") onReady(runner.dispose);
  try {
    runner.run();
    if (batchDepth === 0) flushPending();
  } catch (err) {
    runner.dispose();
    throw err;
  }
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
 * Executa uma busca assíncrona ligada ao ciclo de vida de um recurso.
 * @param {object} ctx Estado e callbacks internos do recurso.
 * @param {Array<unknown>} args Argumentos repassados ao `fetcher`.
 * @returns {Promise<unknown>} Valor resolvido ou valor anterior se abortado.
 */
async function executeResourceFetch(ctx, args) {
  const id = ++ctx.seq;
  const ac = new AbortController();
  /**
   * Propaga o aborto do escopo pai para o controlador local.
   *
   * @returns {void}
   */
  const onScopeAbort = () => ac.abort();
  ctx.abortCurrent();
  ctx.abortCurrent = () => {
    ac.abort();
  };
  ctx.scopeSignal.addEventListener("abort", onScopeAbort, { once: true });
  batch(() => {
    ctx.loading.set(true);
    ctx.error.set(null);
  });
  try {
    const result = await ctx.fetcher(ac.signal, ...args);
    if (!ac.signal.aborted && id === ctx.seq) ctx.data.set(result);
    return ctx.data.peek();
  } catch (err) {
    if (!ac.signal.aborted && id === ctx.seq) {
      ctx.error.set(err);
      if (typeof ctx.onError === "function") ctx.onError(err);
    }
    return ctx.data.peek();
  } finally {
    ctx.scopeSignal.removeEventListener("abort", onScopeAbort);
    if (!ac.signal.aborted && id === ctx.seq) ctx.loading.set(false);
  }
}

/**
 * Cria um recurso assíncrono seguro contra corrida de requisições e descarte de rota.
 * @param {object} state Estado interno do escopo.
 * @param {(sig: AbortSignal, ...args: unknown[]) => Promise<unknown>} fetcher Função assíncrona.
 * @param {unknown} initialValue Valor inicial de `data`.
 * @returns {{ data: object, loading: object, error: object, reload: (...args: unknown[]) => Promise<unknown> }} Recurso.
 */
function buildResource(state, fetcher, initialValue) {
  const ctx = {
    data: signal(initialValue),
    loading: signal(false),
    error: signal(null),
    seq: 0,
    scopeSignal: state.ac.signal,
    fetcher,
    onError: state.onError,
    abortCurrent: () => {}
  };
  registerCleanup(state, () => {
    ctx.seq += 1;
    ctx.abortCurrent();
  });
  return {
    data: { get: ctx.data.get, peek: ctx.data.peek },
    loading: { get: ctx.loading.get, peek: ctx.loading.peek },
    error: { get: ctx.error.get, peek: ctx.error.peek },
    reload: (...args) => (ctx.scopeSignal.aborted
      ? Promise.resolve(ctx.data.peek())
      : executeResourceFetch(ctx, args))
  };
}

/**
 * Registra limpeza no escopo.
 * @param {object} state Estado do escopo.
 * @param {() => void} fn Função de limpeza.
 * @returns {() => void} Remoção do registro.
 */
function registerCleanup(state, fn) {
  if (state.disposed || typeof fn !== "function") return () => {};
  state.disposers.add(fn);
  return () => state.disposers.delete(fn);
}

/**
 * Registra efeito no escopo.
 * @param {object} state Estado do escopo.
 * @param {() => (void|(() => void))} fn Callback reativo.
 * @returns {() => void} Dispose do efeito.
 */
function registerEffect(state, fn) {
  if (state.disposed) return () => {};
  return createEffect(fn, state.onError, (stop) => {
    state.disposers.add(stop);
  });
}

/**
 * Memo preso ao escopo (recalcula só quando dependências mudam).
 * @param {object} state Estado do escopo.
 * @param {() => unknown} fn Derivação.
 * @returns {{ get: () => unknown, peek: () => unknown }} Signal só-leitura.
 */
function registerMemo(state, fn) {
  const out = signal(undefined);
  registerEffect(state, () => {
    out.set(fn());
  });
  return { get: out.get, peek: out.peek };
}

/**
 * Descarta escopo: aborta signal e roda limpezas.
 * @param {object} state Estado do escopo.
 * @returns {void}
 */
function disposeScope(state) {
  if (state.disposed) return;
  state.disposed = true;
  state.ac.abort();
  for (const stop of [...state.disposers]) stop();
  state.disposers.clear();
}

/**
 * Cria um escopo descartável — única porta para efeitos, memos e recursos.
 * @param {object} [options={}] Opções do escopo.
 * @param {(err: unknown) => void} [options.onError] Handler para falhas em efeitos ou recursos.
 * @returns {{ signal: AbortSignal, onCleanup: (fn: () => void) => (() => void), effect: (fn: () => (void|(() => void))) => (() => void), memo: <T>(fn: () => T) => { get: () => T, peek: () => T }, resource: (fetcher: (sig: AbortSignal, ...args: unknown[]) => Promise<unknown>, initialValue?: unknown) => object, dispose: () => void }} Escopo.
 */
export function createScope(options = {}) {
  const state = {
    ac: new AbortController(),
    disposers: new Set(),
    onError: typeof options?.onError === "function" ? options.onError : null,
    disposed: false
  };
  return {
    signal: state.ac.signal,
    onCleanup: (fn) => registerCleanup(state, fn),
    effect: (fn) => registerEffect(state, fn),
    memo: (fn) => registerMemo(state, fn),
    resource: (fetcher, initialValue) => buildResource(state, fetcher, initialValue),
    dispose: () => disposeScope(state)
  };
}
