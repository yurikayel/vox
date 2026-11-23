/**
 * @file DOM mínimo em memória para os testes de cobertura T7: elementos com `id`, classes, `hidden`, atributos,
 * `innerHTML` que cria filhos por `class=""`, `querySelector` por classe/id/atributo e delegação de eventos.
 * Não tenta ser um DOM completo: cobre só o que os módulos testados usam.
 * @module tests/helpers/cov-t7-fake-dom
 */

/** Elemento falso com subconjunto do DOM. */
export class FakeElement {
  /** @param {string} [tag] Nome da tag. */
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.id = "";
    this.hidden = false;
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.classes = new Set();
    this.textContent = "";
    this._html = "";
    this.classList = {
      toggle: (c, on) => {
        const want = on === undefined ? !this.classes.has(c) : Boolean(on);
        if (want) this.classes.add(c);
        else this.classes.delete(c);
        return want;
      },
      add: (...cs) => cs.forEach((c) => this.classes.add(c)),
      remove: (...cs) => cs.forEach((c) => this.classes.delete(c)),
      contains: (c) => this.classes.has(c),
    };
  }

  /** @param {string} v Lista de classes separadas por espaço. */
  set className(v) {
    this.classes = new Set(String(v).split(/\s+/).filter(Boolean));
  }

  /** @returns {string} Classes separadas por espaço. */
  get className() {
    return [...this.classes].join(" ");
  }

  /** @param {string} html Marcação; cada tag com `id`, `class` ou `data-*` vira um descendente consultável. */
  set innerHTML(html) {
    this._html = String(html);
    this.children = [];
    for (const m of this._html.matchAll(/<(\w+)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
      const child = new FakeElement(m[1]);
      for (const a of m[2].matchAll(/\s+([\w:-]+)(?:="([^"]*)")?/g)) {
        const [, name, value = ""] = a;
        if (name === "id") child.id = value;
        else if (name === "class") child.className = value;
        else if (name === "hidden") child.hidden = true;
        else if (name.startsWith("data-")) child.dataset[name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
        else child.attrs[name] = value;
      }
      if (child.id || child.classes.size || Object.keys(child.dataset).length) this.children.push(child);
    }
  }

  /** @returns {string} Marcação atribuída por último. */
  get innerHTML() {
    return this._html;
  }

  /** @param {string} k Nome. @param {string} v Valor. */
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }

  /** @param {string} k Nome. */
  removeAttribute(k) {
    delete this.attrs[k];
  }

  /** @param {string} k Nome. @returns {string|null} Valor ou `null`. */
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }

  /** @param {string} k Nome. @returns {boolean} Se o atributo existe. */
  hasAttribute(k) {
    return k in this.attrs;
  }

  /** @param {FakeElement} child Filho anexado. @returns {FakeElement} O filho. */
  appendChild(child) {
    this.children.push(child);
    return child;
  }

  /** @param {string} sel Seletor `.classe` ou `#id`. @returns {FakeElement|null} Primeiro descendente que casa. */
  querySelector(sel) {
    const last = sel.trim().split(/\s+/).at(-1);
    const match = (c) => (last.startsWith(".") ? c.classes.has(last.slice(1)) : last.startsWith("#") && c.id === last.slice(1));
    for (const c of this.children) {
      if (match(c)) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }

  /** @param {string} html Marcação inserida (só registrada em `inserted`). */
  insertAdjacentHTML(where, html) {
    (this.inserted ||= []).push([where, html]);
  }

  /** @returns {void} Registra o foco. */
  focus() {
    this.focused = true;
  }

  /** @param {string} ev Evento. @param {Function} fn Ouvinte. */
  addEventListener(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  /** @param {string} ev Evento. @param {object} [payload] Objeto do evento. */
  dispatch(ev, payload = {}) {
    for (const fn of this.listeners[ev] || []) fn(payload);
  }
}

/**
 * Instala `document` falso com `body`, `getElementById` e `createElement`.
 * @returns {{ document: object, restore: () => void }} O documento e a função que restaura o original.
 */
export function installFakeDocument() {
  const saved = globalThis.document;
  const body = new FakeElement("body");
  const document = new FakeElement("document");
  document.body = body;
  document.getElementById = (id) => body.querySelector(`#${id}`);
  document.createElement = (tag) => new FakeElement(tag);
  document.querySelector = (sel) => body.querySelector(sel);
  document.querySelectorAll = () => [];
  document.documentElement = new FakeElement("html");
  document.documentElement.style = {};
  globalThis.document = document;
  return {
    document,
    restore: () => {
      if (saved === undefined) delete globalThis.document;
      else globalThis.document = saved;
    },
  };
}
