/**
 * @file DOM falso mínimo para os testes de cobertura das telas (lote T1): elementos por id, grupos por
 * seletor, escuta e disparo de eventos. Sem dependências e sem tocar produção.
 */

/**
 * Cria um elemento falso que guarda ouvintes e dispara eventos.
 *
 * @param {string} [id=""] Id do elemento.
 * @returns {object} Elemento falso.
 */
export function makeEl(id = "") {
  const listeners = new Map();
  const attrs = new Map();
  const el = {
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    dataset: {},
    style: {},
    files: undefined,
    selectionStart: 0,
    focused: 0,
    removed: false,
    children: [],
    classes: new Set(),
    listeners,
    attrs,
    classList: {
      add: (c) => el.classes.add(c),
      remove: (c) => el.classes.delete(c),
      contains: (c) => el.classes.has(c),
      toggle: (c, on) => {
        const next = on === undefined ? !el.classes.has(c) : Boolean(on);
        if (next) el.classes.add(c);
        else el.classes.delete(c);
        return next;
      },
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: (k) => attrs.delete(k),
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    appendChild: (c) => (el.children.push(c), c),
    insertAdjacentHTML: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => true,
    focus: () => { el.focused += 1; },
    setSelectionRange: (a, b) => { el.selection = [a, b]; },
    scrollIntoView: () => { el.scrolled = true; },
    click: () => el.fire("click"),
    remove: () => { el.removed = true; },
    /** Dispara `type` e devolve o evento passado aos ouvintes. */
    fire(type, extra = {}) {
      const ev = { type, target: el, currentTarget: el, defaultPrevented: false, stopped: false, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev.stopped = true; }, ...extra };
      for (const fn of listeners.get(type) || []) fn(ev);
      return ev;
    },
  };
  return el;
}

/**
 * Instala `document` falso global. `byId` resolve `getElementById`; `groups` resolve `querySelectorAll`.
 *
 * @returns {{byId: Map<string, object>, groups: Map<string, object[]>, add: (id: string) => object, group: (sel: string, els: object[]) => void, reset: () => void, document: object, main: object}} Controle.
 */
export function installFakeDom() {
  const byId = new Map();
  const groups = new Map();
  const docListeners = new Map();
  const add = (id) => {
    const e = makeEl(id);
    byId.set(id, e);
    return e;
  };
  const doc = {
    body: { contains: () => true, ...makeEl("body") },
    createElement: () => makeEl(),
    getElementById: (id) => byId.get(id) || null,
    querySelector: (sel) => (groups.get(sel) || [])[0] || null,
    querySelectorAll: (sel) => groups.get(sel) || [],
    addEventListener: (type, fn) => docListeners.set(type, [...(docListeners.get(type) || []), fn]),
    docFire: (type, ev = {}) => (docListeners.get(type) || []).forEach((fn) => fn({ type, preventDefault() {}, stopPropagation() {}, target: { closest: () => null }, ...ev })),
  };
  globalThis.document = doc;
  const ctl = {
    byId,
    groups,
    add,
    document: doc,
    group: (sel, els) => groups.set(sel, els),
    reset: () => {
      byId.clear();
      groups.clear();
      ctl.main = add("app-main");
      ctl.main.querySelectorAll = doc.querySelectorAll;
      ctl.main.querySelector = doc.querySelector;
      add("app-root");
    },
  };
  ctl.reset();
  return ctl;
}
