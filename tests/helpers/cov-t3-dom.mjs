/**
 * @file DOM falso mínimo para os testes de cobertura do lote T3 (telas de perfil).
 *
 * Registra elementos por id e por seletor, guarda os ouvintes de evento e captura os toasts que o
 * código de produção exibe, para que os testes confiram o que a pessoa veria.
 * @module tests/helpers/cov-t3-dom
 */

/**
 * Cria um elemento falso com o que as telas de perfil usam (classes, dataset, ouvintes, estilo).
 * @param {object} [props={}] Propriedades iniciais (id, value, dataset, files, className…).
 * @returns {object} Elemento falso.
 */
export function makeEl(props = {}) {
  const classes = new Set(String(props.className || "").split(/\s+/).filter(Boolean));
  const el = {
    id: "", value: "", disabled: false, hidden: false, textContent: "", innerHTML: "", dataset: {},
    style: {}, listeners: {}, attrs: {}, children: [], focused: 0, removed: false, ...props,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : Boolean(force);
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
    },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...nodes) { this.children = nodes; },
    focus() { this.focused += 1; },
    click() { this.clicked = (this.clicked || 0) + 1; },
    remove() { this.removed = true; },
    /** Filho falso estável por seletor (criado na primeira consulta). */
    querySelector(sel) { return ((this.queried ||= {})[sel] ||= makeEl()); },
    closest(sel) { return (this.closestMap || {})[sel] || null; },
    /** Dispara os ouvintes de `type` e devolve as promessas dos manipuladores assíncronos. */
    fire(type, evt = {}) {
      const e = { preventDefault() { e.prevented = true; }, stopPropagation() {}, target: this, currentTarget: this, ...evt };
      return Promise.all((this.listeners[type] || []).map((fn) => fn(e)));
    },
  };
  Object.defineProperty(el, "className", { get: () => [...classes].join(" "), set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); }, configurable: true });
  return el;
}

/** `setTimeout` original: `withToasts` o troca por uma versão sem referência, que não pode segurar as esperas dos testes. */
const realSetTimeout = globalThis.setTimeout;

/** Espera os manipuladores assíncronos pendentes (cadeia de promessas curtas) terminarem. */
export async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

/**
 * Espera uma condição ficar verdadeira (até `ms`), sem depender de contar turnos do loop de eventos.
 * @param {() => boolean} cond Condição.
 * @param {number} [ms=5000] Limite de espera.
 * @returns {Promise<void>}
 */
export async function waitFor(cond, ms = 5000) {
  const fim = Date.now() + ms;
  while (!cond() && Date.now() < fim) await new Promise((r) => realSetTimeout(r, 5));
}

/**
 * Instala um `document` falso global.
 * @param {{ ids?: Record<string, object>, all?: Record<string, object[]> }} [reg={}] Elementos por id e por seletor.
 * @returns {{ document: object, toasts: Array<{text: string, type: string}> }} Documento e toasts capturados.
 */
export function installDom({ ids = {}, all = {} } = {}) {
  const toasts = [];
  const body = makeEl();
  body.appendChild = (child) => {
    body.children.push(child);
    if (child.id) ids[child.id] = child;
    if (String(child.className).startsWith("vox-toast")) toasts.push({ text: child.textContent, type: child.className.split(" ")[1] });
    return child;
  };
  const listeners = {};
  const document = {
    body,
    listeners,
    getElementById: (id) => ids[id] || null,
    querySelector: (sel) => (all[sel] || [])[0] || null,
    querySelectorAll: (sel) => all[sel] || [],
    createElement: (tag) => makeEl({ tag }),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  globalThis.document = document;
  return { document, toasts };
}

/**
 * Roda `fn` com `NODE_ENV` fora de "test" (para `showToast` exibir) e sem manter o processo vivo pelos timers do toast.
 * @param {() => Promise<void>} fn Corpo do teste.
 * @returns {Promise<void>}
 */
export async function withToasts(fn) {
  const prevEnv = process.env.NODE_ENV;
  const prevTimeout = globalThis.setTimeout;
  process.env.NODE_ENV = "production";
  globalThis.setTimeout = (f, ms, ...a) => {
    const t = prevTimeout(f, ms, ...a);
    t.unref?.();
    return t;
  };
  try {
    await fn();
  } finally {
    process.env.NODE_ENV = prevEnv;
    globalThis.setTimeout = prevTimeout;
  }
}
