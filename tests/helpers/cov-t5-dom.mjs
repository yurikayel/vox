/**
 * @file Mini-DOM programável dos testes de cobertura do lote T5: elementos que guardam ouvintes, `dataset`,
 * `hidden`, `disabled` etc., e um `document` que devolve só o que o teste registrou. Sem parser de HTML.
 */

/**
 * Cria um elemento falso. `kids` e `kidsAll` respondem a `querySelector(All)` por seletor exato; `up` responde
 * a `closest` por seletor exato.
 *
 * @param {object} [props] Campos copiados para o elemento (`id`, `value`, `checked`, `dataset`, `kids`...).
 * @returns {object} Elemento falso.
 */
export function makeEl(props = {}) {
  const attrs = new Map();
  const classes = new Set();
  const el = {
    tagName: "DIV",
    id: "",
    value: "",
    checked: false,
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    style: {},
    dataset: {},
    kids: {},
    kidsAll: {},
    up: {},
    listeners: {},
    inserted: [],
    focused: 0,
    clicks: 0,
    removed: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : Boolean(force);
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    attrs,
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    focus() {
      this.focused += 1;
    },
    click() {
      this.clicks += 1;
    },
    remove() {
      this.removed = true;
    },
    appendChild(child) {
      (this.children ||= []).push(child);
      return child;
    },
    closest(sel) {
      return this.up[sel] || null;
    },
    querySelector(sel) {
      return this.kids[sel] || null;
    },
    querySelectorAll(sel) {
      return this.kidsAll[sel] || [];
    },
    insertAdjacentHTML(pos, html) {
      this.inserted.push({ pos, html });
    },
    /** Dispara os ouvintes de `type`; devolve o evento (com `defaultPrevented`). */
    async fire(type, extra = {}) {
      const ev = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const fn of [...(this.listeners[type] || [])]) await fn(ev);
      return ev;
    },
  };
  Object.assign(el, props);
  return el;
}

/** Espera `ms` com `setImmediate` em laço, para as promessas soltas dos handlers terminarem. */
export async function settle(rounds = 30) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

/**
 * Instala `globalThis.document` falso. `ids` mapeia id → elemento; `all` mapeia seletor → lista;
 * `qs` mapeia seletor → elemento. `app-root` e `app-main` existem sempre.
 *
 * @param {{ids?: object, all?: object, qs?: object}} [reg] Registro de elementos.
 * @returns {object} Documento falso, com `main`, `root`, `body`, `created` (elementos criados) e `docListeners`.
 */
export function installDom({ ids = {}, all = {}, qs = {} } = {}) {
  const main = ids["app-main"] || makeEl({ tagName: "MAIN", id: "app-main" });
  const root = ids["app-root"] || makeEl({ id: "app-root" });
  const body = makeEl({ tagName: "BODY" });
  const byId = { "app-main": main, "app-root": root, ...ids };
  const docListeners = {};
  const created = [];
  const doc = {
    main,
    root,
    body,
    docListeners,
    created,
    documentElement: makeEl({ tagName: "HTML" }),
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => qs[sel] || null,
    querySelectorAll: (sel) => all[sel] || [],
    createElement: (tag) => {
      const el = makeEl({ tagName: String(tag).toUpperCase() });
      created.push(el);
      return el;
    },
    addEventListener: (type, fn) => (docListeners[type] ||= []).push(fn),
    removeEventListener: () => {},
  };
  globalThis.document = doc;
  return doc;
}

/**
 * Faz os temporizadores longos (>= 60 s, como o `revokeObjectURL` de `downloadBlob`) não segurarem o processo
 * de teste aberto. Só muda o `unref`; o callback continua agendado.
 */
export function unrefLongTimers() {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...rest) => {
    const t = real(fn, ms, ...rest);
    if (ms >= 60_000) t.unref?.();
    return t;
  };
}

/**
 * Espera uma condição ficar verdadeira (até `ms`), em vez de contar turnos do laço de eventos, que varia entre
 * máquinas quando há cripto de verdade no meio.
 *
 * @param {() => boolean} cond Condição a observar.
 * @param {number} [ms] Tempo máximo.
 * @returns {Promise<boolean>} O último valor da condição.
 */
export async function waitFor(cond, ms = 15_000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  return Boolean(cond());
}
