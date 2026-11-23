/**
 * @file DOM de mentira mínimo para os testes de cobertura do lote T4 (compositores).
 *
 * Não interpreta HTML nem seletores: cada teste declara quais elementos uma consulta devolve
 * (`stub`/`stubAll`/`stubClosest`), então a asserção olha o efeito (classe, atributo, texto,
 * foco, escuta de evento) e não a implementação do seletor.
 *
 * @module tests/helpers/cov-t4-dom
 */
import { mock } from "node:test";

/** Conjunto de classes com a mesma interface de `classList` usada pelo cliente. */
class FakeClassList {
  constructor() {
    this.set = new Set();
  }

  /** @param {...string} names Classes a adicionar. */
  add(...names) {
    names.forEach((n) => this.set.add(n));
  }

  /** @param {...string} names Classes a remover. */
  remove(...names) {
    names.forEach((n) => this.set.delete(n));
  }

  /**
   * @param {string} name Classe alvo.
   * @param {boolean} [force] Força presença/ausência.
   * @returns {boolean} Se a classe ficou presente.
   */
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : Boolean(force);
    if (on) this.set.add(name);
    else this.set.delete(name);
    return on;
  }

  /** @param {string} name Classe alvo. @returns {boolean} Se está presente. */
  contains(name) {
    return this.set.has(name);
  }
}

/** Elemento de mentira com atributos, escuta de eventos e consultas programadas. */
export class FakeEl {
  /**
   * @param {string} [id] Id do elemento.
   * @param {{ tag?: string, dataset?: object, value?: string, classes?: string[] }} [opts] Opções iniciais.
   */
  constructor(id = "", { tag = "DIV", dataset = {}, value = "", classes = [] } = {}) {
    this.id = id;
    this.tagName = tag;
    this.dataset = { ...dataset };
    this.value = value;
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this.attrs = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    classes.forEach((c) => this.classList.add(c));
    this.queries = new Map();
    this.closests = new Map();
    this.removed = false;
    this.inserted = [];
    this.focusCalls = 0;
    this.resetCalls = 0;
    this.selection = null;
  }

  /** @param {string} name Atributo. @param {*} value Valor. */
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  /** @param {string} name Atributo. @returns {string|null} Valor ou null. */
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  /** @param {string} name Atributo a remover. */
  removeAttribute(name) {
    this.attrs.delete(name);
  }

  /** @param {string} name Atributo. @returns {boolean} Se existe. */
  hasAttribute(name) {
    return this.attrs.has(name) || (name === "hidden" && this.hidden);
  }

  /** @param {string} type Evento. @param {Function} fn Escuta. */
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  /**
   * Dispara as escutas registradas.
   * @param {string} type Evento.
   * @param {object} [ev] Evento simulado.
   * @returns {Promise<void>} Resolve quando todas as escutas terminam.
   */
  async fire(type, ev = {}) {
    for (const fn of this.listeners.get(type) || []) await fn(ev);
  }

  /** Simula `element.click()`: conta a chamada e dispara as escutas de `click`. */
  click() {
    this.clickCalls = (this.clickCalls || 0) + 1;
    this.fire("click", { target: this, preventDefault() {} });
  }

  /** Marca o foco no documento falso. */
  focus() {
    this.focusCalls += 1;
    FakeEl.focused = this;
  }

  /** Remove o elemento (marca `removed`). */
  remove() {
    this.removed = true;
  }

  /** Conta o reset de formulário. */
  reset() {
    this.resetCalls += 1;
  }

  /** @param {number} start Início. @param {number} end Fim. */
  setSelectionRange(start, end) {
    this.selection = [start, end];
  }

  /** @param {string} _pos Posição. @param {string} html Fragmento inserido. */
  insertAdjacentHTML(_pos, html) {
    this.inserted.push(html);
  }

  /** @param {string} sel Seletor. @param {FakeEl|FakeEl[]} el Resultado(s). @returns {FakeEl} Este elemento. */
  stub(sel, el) {
    this.queries.set(sel, Array.isArray(el) ? el : [el]);
    return this;
  }

  /** @param {string} sel Seletor. @param {FakeEl|null} el Ancestral devolvido. @returns {FakeEl} Este elemento. */
  stubClosest(sel, el) {
    this.closests.set(sel, el);
    return this;
  }

  /** @param {string} sel Seletor. @returns {FakeEl|null} Primeiro resultado programado. */
  querySelector(sel) {
    return this.queries.get(sel)?.[0] ?? null;
  }

  /** @param {string} sel Seletor. @returns {FakeEl[]} Resultados programados. */
  querySelectorAll(sel) {
    return [...(this.queries.get(sel) || [])];
  }

  /** @param {string} sel Seletor. @returns {FakeEl|null} Ancestral programado. */
  closest(sel) {
    return this.closests.get(sel) ?? null;
  }
}

/**
 * Instala um `document` global de mentira com registro de elementos por id.
 * @returns {{ add: (...els: FakeEl[]) => void, restore: () => void, doc: object }} Controle do documento.
 */
export function installFakeDocument() {
  const previous = globalThis.document;
  const byId = new Map();
  const queries = new Map();
  const doc = {
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: (sel) => queries.get(sel)?.[0] ?? null,
    querySelectorAll: (sel) => [...(queries.get(sel) || [])],
    stub: (sel, els) => queries.set(sel, Array.isArray(els) ? els : [els]),
    createElement: (tag) => new FakeEl("", { tag: tag.toUpperCase() }),
    body: { appended: [], appendChild(el) { this.appended.push(el); byId.set(el.id, el); } },
  };
  globalThis.document = doc;
  FakeEl.focused = null;
  return {
    doc,
    add: (...els) => els.forEach((el) => byId.set(el.id, el)),
    restore: () => {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

/**
 * Liga os toasts reais (`share.showToast` é mudo em `NODE_ENV=test`) sobre o documento falso
 * e congela `setTimeout`, para o teste ler o texto e o tipo de cada aviso exibido.
 * @param {{ doc: object }} dom Retorno de {@link installFakeDocument}.
 * @returns {{ list: () => { text: string, type: string }[], stop: () => void }} Leitura e desligamento.
 */
export function captureToasts(dom) {
  process.env.NODE_ENV = "production";
  mock.timers.enable({ apis: ["setTimeout"] });
  return {
    list: () => dom.doc.body.appended
      .filter((el) => String(el.className || "").startsWith("vox-toast"))
      .map((el) => ({ text: el.textContent, type: el.className.split(" ")[1] })),
    stop: () => {
      process.env.NODE_ENV = "test";
      mock.timers.reset();
    },
  };
}
