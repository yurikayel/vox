/**
 * @file DOM de mentira para os testes de cobertura do lote T6: árvore de elementos, `innerHTML` com parser
 * mínimo, seletores simples (tag, #id, .classe, [attr], :checked, descendente e vírgula) e eventos com
 * captura/borbulha. Só o que os módulos do cliente usam; não é um DOM completo.
 * @module tests/helpers/cov-t6-dom
 */

const VOID = new Set(["input", "img", "br", "hr", "meta", "link"]);
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);
const escapeText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const camel = (k) => k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());

/** Texto solto na árvore. */
class FakeText {
  constructor(text) {
    this.text = text;
    this.parent = null;
  }
}

/** Compara um elemento com um seletor composto (`tag#id.classe[attr="v"]:checked`). */
function matchCompound(el, selector) {
  let sel = selector;
  for (const n of selector.matchAll(/:not\((\[[^\]]*\])\)/g)) {
    if (matchCompound(el, n[1])) return false;
    sel = sel.replace(n[0], "");
  }
  const head = sel.match(/^[a-z0-9-]+/i)?.[0];
  if (head && el.tagName !== head.toUpperCase()) return false;
  const rest = head ? sel.slice(head.length) : sel;
  for (const m of rest.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]|:(checked)/gi)) {
    if (m[1] && el.id !== m[1]) return false;
    if (m[2] && !el.classList.contains(m[2])) return false;
    if (m[3] && !matchAttr(el, m)) return false;
    if (m[6] && !el.checked) return false;
  }
  return true;
}

function matchAttr(el, m) {
  if (!el.hasAttribute(m[3])) return false;
  const want = m[4] ?? m[5];
  return want === undefined || el.getAttribute(m[3]) === want;
}

/** Divide `a b, c` em grupos de compostos descendentes. */
function parseSelector(text) {
  return text.split(/,(?![^\[]*\])/).map((g) => g.trim().split(/\s+(?![^\[]*\])/).filter(Boolean));
}

function matchesChain(el, chain) {
  if (!matchCompound(el, chain[chain.length - 1])) return false;
  let node = el.parent;
  for (let i = chain.length - 2; i >= 0; i--) {
    while (node && !(node instanceof FakeElement && matchCompound(node, chain[i]))) node = node.parent;
    if (!node) return false;
    node = node.parent;
  }
  return true;
}

/** Elemento falso com árvore, atributos, classes e eventos. */
export class FakeElement {
  constructor(tag = "div", doc = null) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.parent = null;
    this.children = [];
    this.attrs = new Map();
    this.listeners = [];
    this.style = {};
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.rect = { left: 0, top: 0, width: 0, height: 0 };
    const set = () => new Set((this.attrs.get("class") || "").split(/\s+/).filter(Boolean));
    const save = (s) => this.attrs.set("class", [...s].join(" "));
    this.classList = {
      add: (...c) => { const s = set(); c.forEach((x) => s.add(x)); save(s); },
      remove: (...c) => { const s = set(); c.forEach((x) => s.delete(x)); save(s); },
      contains: (c) => set().has(c),
      toggle: (c, force) => {
        const on = force ?? !set().has(c);
        this.classList[on ? "add" : "remove"](c);
        return on;
      },
    };
  }

  get id() { return this.attrs.get("id") || ""; }
  set id(v) { this.attrs.set("id", v); }
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.attrs.set("class", v); }
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(v) { if (v) this.attrs.set("hidden", ""); else this.attrs.delete("hidden"); }
  get dataset() {
    const out = {};
    for (const [k, v] of this.attrs) if (k.startsWith("data-")) out[camel(k.slice(5))] = v;
    return out;
  }
  get childNodes() { return this.children; }
  get firstElementChild() { return this.children.find((c) => c instanceof FakeElement) || null; }
  get textContent() { return this.children.map((c) => (c instanceof FakeText ? c.text : c.textContent)).join(""); }
  set textContent(v) { this.replaceChildren(); if (v !== "") this.#add(new FakeText(String(v))); }
  get innerHTML() { return this.children.map((c) => (c instanceof FakeText ? escapeText(c.text) : c.outerHTML)).join(""); }
  set innerHTML(html) { this.replaceChildren(); this.#parse(String(html)); }
  get outerHTML() {
    const attrs = [...this.attrs].map(([k, v]) => ` ${k}="${v}"`).join("");
    const tag = this.tagName.toLowerCase();
    return VOID.has(tag) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  #add(node) { node.parent = this; this.children.push(node); return node; }

  #parse(html) {
    const stack = [this];
    const re = /<!--[\s\S]*?-->|<\/([a-z0-9-]+)>|<([a-z0-9-]+)((?:\s+[^\s=>\/]+(?:="[^"]*"|='[^']*'|=[^\s>]+)?)*)\s*\/?>|([^<]+)/gi;
    for (const m of html.matchAll(re)) {
      const top = stack[stack.length - 1];
      if (m[4] !== undefined) { if (m[4].trim() || top.tagName === "PRE") top.#add(new FakeText(decode(m[4]))); continue; }
      if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
      if (!m[2]) continue;
      const el = top.#add(new FakeElement(m[2], this.ownerDocument));
      for (const a of (m[3] || "").matchAll(/([^\s=>]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g)) el.attrs.set(a[1], decode(a[2] ?? a[3] ?? a[4] ?? ""));
      if (el.attrs.has("value")) el.value = el.attrs.get("value");
      if (!VOID.has(m[2].toLowerCase()) && !m[0].endsWith("/>")) stack.push(el);
    }
  }

  append(...nodes) { nodes.forEach((n) => this.appendChild(typeof n === "string" ? new FakeText(n) : n)); }
  appendChild(node) { node.parent?.removeChild?.(node); this.#add(node); node.ownerDocument ??= this.ownerDocument; return node; }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); node.parent = null; return node; }
  replaceChildren(...nodes) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this.append(...nodes); }
  remove() { this.parent?.removeChild(this); }
  insertAdjacentHTML(where, html) {
    const tmp = new FakeElement("div", this.ownerDocument);
    tmp.innerHTML = html;
    const nodes = [...tmp.children];
    nodes.forEach((n) => { n.parent = this; });
    this.children = where === "afterbegin" ? [...nodes, ...this.children] : [...this.children, ...nodes];
  }

  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  getBoundingClientRect() { return this.rect; }
  scrollIntoView() {}
  click() { this.dispatchEvent({ type: "click", target: this }); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  matches(text) { return parseSelector(text).some((chain) => matchesChain(this, chain)); }
  closest(text) {
    for (let n = this; n instanceof FakeElement; n = n.parent) if (n.matches(text)) return n;
    return null;
  }
  contains(other) {
    for (let n = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  querySelectorAll(text) {
    const out = [];
    const walk = (node) => node.children.forEach((c) => {
      if (!(c instanceof FakeElement)) return;
      if (c.matches(text)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  querySelector(text) { return this.querySelectorAll(text)[0] || null; }

  addEventListener(type, fn, opts) { this.listeners.push({ type, fn, capture: opts === true || opts?.capture === true }); }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn)); }

  /** Despacha com captura (de cima para baixo) e borbulha; devolve o evento. */
  dispatchEvent(ev) {
    ev.target ??= this;
    ev.defaultPrevented = false;
    ev.preventDefault ??= () => { ev.defaultPrevented = true; };
    ev.stopPropagation ??= () => { ev.stopped = true; };
    ev.stopImmediatePropagation ??= () => { ev.stopped = true; };
    const path = [];
    for (let n = this; n; n = n.parent) path.push(n);
    const fire = (node, capture) => {
      for (const l of [...node.listeners]) {
        if (ev.stopped || l.type !== ev.type || l.capture !== capture) continue;
        ev.currentTarget = node;
        l.fn(ev);
      }
    };
    [...path].reverse().forEach((n) => fire(n, true));
    path.forEach((n) => fire(n, false));
    return ev;
  }
}

/** Documento falso: `body`, `getElementById`, `createElement` e `activeElement`. */
export class FakeDocument extends FakeElement {
  constructor() {
    super("html");
    this.ownerDocument = this;
    this.body = new FakeElement("body", this);
    this.appendChild(this.body);
    this.activeElement = this.body;
  }

  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) { return this.querySelector(`#${id}`); }
}

/**
 * Instala `document`, `HTMLElement`, `CSS`, `FormData` falsos como globais e devolve o documento.
 *
 * @returns {FakeDocument} Documento recém-criado (zera o anterior).
 */
export function installFakeDom() {
  const doc = new FakeDocument();
  globalThis.document = doc;
  globalThis.HTMLElement = FakeElement;
  globalThis.CSS = { escape: (s) => String(s) };
  doc.documentElement = doc;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.FormData = class {
    constructor(form) { this.fields = form.fields || {}; }
    get(key) { return key in this.fields ? this.fields[key] : null; }
  };
  return doc;
}

/**
 * Monta um elemento a partir de HTML dentro do `body` e devolve o primeiro filho.
 *
 * @param {FakeDocument} doc Documento falso.
 * @param {string} html HTML do elemento.
 * @returns {FakeElement} Elemento montado.
 */
export function mount(doc, html) {
  doc.body.insertAdjacentHTML("beforeend", html);
  return doc.body.children[doc.body.children.length - 1];
}

/**
 * Despacha um clique, com alvo e flags extras.
 *
 * @param {FakeElement} target Alvo do clique.
 * @param {object} [extra] Campos do evento (`shiftKey`, `clientX`…).
 * @returns {object} Evento despachado.
 */
export function click(target, extra = {}) {
  return target.dispatchEvent({ type: "click", target, ...extra });
}

for (const name of ["src", "alt", "href", "rel", "type", "download", "name"]) {
  Object.defineProperty(FakeElement.prototype, name, {
    get() { return this.attrs.get(name) ?? ""; },
    set(v) { this.attrs.set(name, String(v)); },
  });
}

/**
 * Liga os toasts reais (`share.showToast` só desenha fora de `NODE_ENV=test`) e registra cada um.
 *
 * @param {FakeDocument} doc Documento falso já instalado.
 * @returns {{text: string, type: string}[]} Lista que cresce a cada toast mostrado.
 */
export function captureToasts(doc) {
  process.env.NODE_ENV = "development";
  const log = [];
  const append = doc.body.appendChild.bind(doc.body);
  doc.body.appendChild = (node) => {
    if (node.className.startsWith("vox-toast")) log.push({ text: node.textContent, type: node.className.split(" ")[1] });
    return append(node);
  };
  return log;
}
