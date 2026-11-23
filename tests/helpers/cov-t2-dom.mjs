/**
 * @file DOM falso mínimo com seletores (id, classe, tag, atributo, descendente) para os testes de cobertura T2.
 * @module tests/helpers/cov-t2-dom
 */

/**
 * Converte um seletor composto (`tag#id.cls[attr="v"]`) em predicado.
 *
 * @param {string} compound Seletor composto sem espaços.
 * @returns {(el: FakeEl) => boolean} Predicado de casamento.
 */
function compoundMatcher(compound) {
  const tag = /^[a-z][a-z0-9-]*/i.exec(compound)?.[0]?.toUpperCase();
  const id = /#([\w-]+)/.exec(compound)?.[1];
  const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrs = [...compound.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)].map((m) => [m[1], m[2]]);
  return (el) =>
    (!tag || el.tagName === tag) &&
    (!id || el.id === id) &&
    classes.every((c) => el.classList.contains(c)) &&
    attrs.every(([k, v]) => {
      const got = el.getAttribute(k);
      return v === undefined ? got !== null : got === v;
    });
}

/**
 * Casa um elemento contra um seletor com vírgulas e combinador descendente.
 *
 * @param {FakeEl} el Elemento candidato.
 * @param {string} selector Seletor CSS simples.
 * @returns {boolean} `true` se casa.
 */
function matches(el, selector) {
  return selector.split(",").some((part) => {
    const chain = part.trim().split(/\s+/).map(compoundMatcher);
    if (!chain.pop()(el)) return false;
    let node = el.parent;
    while (chain.length && node) {
      if (chain[chain.length - 1](node)) chain.pop();
      node = node.parent;
    }
    return chain.length === 0;
  });
}

/** Elemento falso com árvore, classes, dataset, ouvintes e dispatch. */
export class FakeEl {
  /**
   * @param {string} tag Nome da tag.
   * @param {FakeDoc|null} doc Documento dono.
   */
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.id = "";
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this.listeners = {};
    this.value = "";
    this.files = [];
    this.checked = false;
    this.disabled = false;
    this.title = "";
    this.src = "";
    this.alt = "";
    this.textContent = "";
    this.innerHTML = "";
    this.insertedHtml = [];
    const set = new Set();
    this.classList = {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !set.has(c) : Boolean(force);
        if (on) set.add(c); else set.delete(c);
        return on;
      },
    };
    this.classSet = set;
  }

  get className() { return [...this.classSet].join(" "); }

  set className(v) { this.classSet.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classSet.add(c)); }

  setAttribute(k, v) { this.attrs[k] = String(v); }

  getAttribute(k) {
    if (k in this.attrs) return this.attrs[k];
    const fromData = k.startsWith("data-") ? this.dataset[k.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] : undefined;
    return fromData === undefined ? null : String(fromData);
  }

  hasAttribute(k) { return this.getAttribute(k) !== null; }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }

  /** Dispara os ouvintes e devolve a promessa do último (ou `undefined`). */
  fire(type, ev = {}) {
    const event = { target: this, preventDefault() {}, ...ev };
    return (this.listeners[type] || []).map((fn) => fn(event)).pop();
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren() { this.children = []; }

  click() { this.clicked = true; }

  focus() { this.focused = true; }

  getContext() { return { drawImage() {} }; }

  toDataURL() { return "data:image/jpeg;base64,/9j/AAAA"; }

  insertAdjacentHTML(_pos, html) { this.insertedHtml.push(html); }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  closest(sel) {
    for (let n = this; n; n = n.parent) if (matches(n, sel)) return n;
    return null;
  }

  all() { return this.children.flatMap((c) => [c, ...c.all()]); }

  querySelectorAll(sel) { return this.all().filter((el) => matches(el, sel)); }

  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

/** Documento falso com raiz, `getElementById` e seletores. */
export class FakeDoc {
  constructor() {
    this.root = new FakeEl("body", this);
    this.body = this.root;
    this.toastLog = [];
    const append = this.root.appendChild.bind(this.root);
    this.root.appendChild = (child) => {
      if (child.classList.contains("vox-toast")) this.toastLog.push(child.textContent);
      return append(child);
    };
  }

  createElement(tag) { return new FakeEl(tag, this); }

  /**
   * Cria e anexa um elemento ao documento (ou a um pai).
   *
   * @param {string} tag Nome da tag.
   * @param {{ id?: string, cls?: string, dataset?: object, parent?: FakeEl }} [opts] Atributos iniciais.
   * @returns {FakeEl} Elemento criado.
   */
  add(tag, { id = "", cls = "", dataset = {}, parent = this.root, ...rest } = {}) {
    const el = new FakeEl(tag, this);
    el.id = id;
    el.className = cls;
    Object.assign(el.dataset, dataset);
    Object.assign(el, rest);
    return parent.appendChild(el);
  }

  getElementById(id) { return this.root.all().find((el) => el.id === id) || null; }

  querySelectorAll(sel) { return this.root.querySelectorAll(sel); }

  querySelector(sel) { return this.root.querySelector(sel); }

  addEventListener(type, fn) { this.root.addEventListener(type, fn); }
}

/**
 * Instala um documento falso em `globalThis` e o devolve.
 *
 * @returns {FakeDoc} Documento instalado.
 */
export function installFakeDom() {
  const doc = new FakeDoc();
  globalThis.document = doc;
  return doc;
}

/** Espera microtarefas e timers curtos assentarem. */
export async function settle(n = 10) {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
}

/**
 * Executa `fn` com os toasts habilitados (fora do NODE_ENV=test) e devolve as mensagens exibidas.
 *
 * @param {FakeDoc} doc Documento falso instalado.
 * @param {() => Promise<void>|void} fn Corpo que dispara toasts.
 * @returns {Promise<string[]>} Mensagens de toast, em ordem.
 */
export async function withToasts(doc, fn) {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const start = doc.toastLog.length;
  try {
    await fn();
    await settleToasts(doc);
  } finally {
    process.env.NODE_ENV = prev;
  }
  return doc.toastLog.slice(start);
}

/**
 * Espera os toasts de `doc` estabilizarem (80 ms sem novidade, no máximo 3 s).
 *
 * @param {FakeDoc} doc Documento falso com `toastLog`.
 * @returns {Promise<void>}
 */
async function settleToasts(doc) {
  const limit = Date.now() + 3000;
  let seen = -1;
  let quietSince = Date.now();
  while (Date.now() < limit && Date.now() - quietSince < 80) {
    await new Promise((r) => setTimeout(r, 10));
    if (doc.toastLog.length !== seen) {
      seen = doc.toastLog.length;
      quietSince = Date.now();
    }
  }
}

/**
 * Instala `FileReader` e `Image` falsos para a compressão de imagem por canvas rodar sem navegador.
 *
 * @returns {void}
 */
export function installImageFakes() {
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/png;base64,AAAA";
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.Image = class {
    set src(_v) {
      this.width = 800;
      this.height = 400;
      queueMicrotask(() => this.onload?.());
    }
  };
}
