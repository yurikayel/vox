/**
 * @file Cascata de CSS para os testes de contraste e de estado: dado um elemento com os seus ancestrais (`buildChain`),
 * diz qual declaração vence para uma propriedade, como o navegador decide: `!important`, depois especificidade, depois
 * a ordem das folhas (`style.css`, `agora.css`, `sv-*.css`, a ordem do `index.html`). Entende seletor composto,
 * combinadores descendente e filho, `:is`, `:where`, `:not`, `:disabled`, estados (`:hover`, `:focus-visible`…) e
 * atributos. Lê `@media (prefers-color-scheme: …)` (inclusive o bloco do atributo `data-color-mode` dentro do `@media`
 * do outro tema) e o escolhe pelo ambiente `{scheme}` passado à busca; ignora o que não tem como ser medido num
 * elemento isolado: outros `@media`/`@supports`, irmãos (`+`, `~`), `:has`, `:nth-*` e pseudo-elementos; as regras que o
 * motor não lê contam em `unsupported`. É o que o `renderedDecl` de `css-tema.js` não faz (ele compara só o último
 * pedaço do seletor e ignora ancestral, classe de variante e `@media`).
 */
import { blocks, readSheet, SV_SHEETS } from "./css-tema.js";

const DEFAULT_FILES = ["style.css", "agora.css", ...SV_SHEETS];
const STATES = new Set(["hover", "active", "focus", "focus-visible", "focus-within", "visited", "checked"]);
const PIECE = /^(?:(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([^\]]*)\]|(::?)([\w-]+))/;
const ATTR = /^\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*$/;
const SCHEME_MEDIA = /^@media\s*\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)$/i;
const listCache = new Map();
const loaded = new Map();

/** Índice do `)` que fecha o `(` em `from`. */
function closeParen(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
    if (depth === 0) return i;
  }
  return text.length - 1;
}

/**
 * Divide `text` em `sep` fora de parênteses e colchetes.
 * @param {string} text Texto.
 * @param {string} sep Separador de um caractere.
 * @returns {string[]} Pedaços sem vazios.
 */
export function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    depth += "([".includes(ch) ? 1 : ")]".includes(ch) ? -1 : 0;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

function parseAttr(src) {
  const m = src.match(ATTR);
  if (!m) throw new Error(`atributo não suportado: [${src}]`);
  return { name: m[1], op: m[2] ?? null, value: m[3] ?? m[4] ?? m[5] ?? "" };
}

function parseCompound(src) {
  const c = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
  let rest = src;
  while (rest) {
    const m = rest.match(PIECE);
    if (!m) throw new Error(`seletor não suportado: ${src}`);
    rest = rest.slice(m[0].length);
    if (m[1]) c.tag = m[1];
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4] !== undefined) c.attrs.push(parseAttr(m[4]));
    else {
      const end = rest[0] === "(" ? closeParen(rest, 0) : -1;
      c.pseudos.push({ name: m[6].toLowerCase(), element: m[5] === "::", arg: end < 0 ? null : rest.slice(1, end) });
      rest = rest.slice(end + 1);
    }
  }
  return c;
}

/**
 * Lê um seletor complexo (`a > b c.d`) em compostos e combinadores.
 * @param {string} sel Seletor sem vírgula de nível alto.
 * @returns {{compounds: object[], combs: string[]}} `combs[i]` liga `compounds[i]` a `compounds[i + 1]`.
 */
export function parseSelector(sel) {
  const compounds = [];
  const combs = [];
  let cur = "";
  let depth = 0;
  let comb = null;
  const flush = () => {
    if (cur) compounds.push(parseCompound(cur));
    cur = "";
  };
  for (const ch of sel.trim()) {
    const top = depth === 0;
    depth += "([".includes(ch) ? 1 : ")]".includes(ch) ? -1 : 0;
    if (top && /\s/.test(ch)) {
      if (cur) comb = " ";
      flush();
    } else if (top && ">+~".includes(ch)) {
      flush();
      comb = ch;
    } else {
      if (!cur && comb !== null && compounds.length) combs.push(comb);
      if (!cur) comb = null;
      cur += ch;
    }
  }
  flush();
  return { compounds, combs };
}

function listOf(arg) {
  if (!listCache.has(arg)) listCache.set(arg, splitTop(arg, ",").map(parseSelector));
  return listCache.get(arg);
}

function matchAttr(a, el) {
  const v = el.attrs[a.name];
  if (v === undefined) return false;
  const ops = {
    "=": () => v === a.value,
    "~=": () => v.split(/\s+/).includes(a.value),
    "^=": () => v.startsWith(a.value),
    "$=": () => v.endsWith(a.value),
    "*=": () => v.includes(a.value),
    "|=": () => v === a.value || v.startsWith(`${a.value}-`),
  };
  return a.op === null || ops[a.op]();
}

function matchPseudo(p, chain, i) {
  const el = chain[i];
  if (p.element) return false;
  if (STATES.has(p.name)) return el.states.has(p.name);
  const off = el.attrs.disabled !== undefined;
  const any = () => (p.arg === null ? [] : listOf(p.arg)).some((s) => matchComplex(s, chain, i));
  const rules = {
    disabled: () => off,
    enabled: () => !off,
    root: () => el.tag === "html",
    not: () => !any(),
    is: any,
    where: any,
  };
  return rules[p.name] ? rules[p.name]() : false;
}

function matchCompound(c, chain, i) {
  const el = chain[i];
  if (c.tag && c.tag !== "*" && c.tag !== el.tag) return false;
  if (c.id && c.id !== el.attrs.id) return false;
  return c.classes.every((k) => el.classes.includes(k)) && c.attrs.every((a) => matchAttr(a, el)) && c.pseudos.every((p) => matchPseudo(p, chain, i));
}

function matchComplex(sel, chain, i = chain.length - 1, k = sel.compounds.length - 1) {
  if (i < 0 || !matchCompound(sel.compounds[k], chain, i)) return false;
  if (k === 0) return true;
  const comb = sel.combs[k - 1];
  if (comb === ">") return matchComplex(sel, chain, i - 1, k - 1);
  if (comb !== " ") return false;
  for (let j = i - 1; j >= 0; j -= 1) if (matchComplex(sel, chain, j, k - 1)) return true;
  return false;
}

const addSpec = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cmpSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function pseudoSpec(p) {
  if (p.element) return [0, 0, 1];
  if (p.name === "where") return [0, 0, 0];
  if (!["is", "not", "has"].includes(p.name) || p.arg === null) return [0, 1, 0];
  return listOf(p.arg).map(selectorSpec).reduce((m, s) => (cmpSpec(s, m) > 0 ? s : m), [0, 0, 0]);
}

/**
 * Especificidade `[ids, classes/atributos/pseudo-classes, elementos]` de um seletor complexo (`:where` vale 0;
 * `:is`, `:not` e `:has` valem o maior argumento).
 * @param {{compounds: object[]}} sel Seletor de `parseSelector`.
 * @returns {number[]} Os três contadores.
 */
export function selectorSpec(sel) {
  return sel.compounds.reduce((sum, c) => {
    const own = [c.id ? 1 : 0, c.classes.length + c.attrs.length, c.tag && c.tag !== "*" ? 1 : 0];
    return addSpec(sum, c.pseudos.reduce((s, p) => addSpec(s, pseudoSpec(p)), own));
  }, [0, 0, 0]);
}

function parseDecls(body) {
  const out = new Map();
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon <= 0) continue;
    const raw = decl.slice(colon + 1).trim();
    out.set(decl.slice(0, colon).trim(), { value: raw.replace(/\s*!\s*important\s*$/i, ""), important: /!\s*important\s*$/i.test(raw) });
  }
  return out;
}

/** Percorre as regras de `css`, entrando nos `@media (prefers-color-scheme)` (o tema do bloco vai em `scheme`). */
function walkRules(css, scheme, visit) {
  for (const blk of blocks(css)) {
    const media = blk.selector.match(SCHEME_MEDIA)?.[1].toLowerCase();
    if (media) {
      if (scheme === null || scheme === media) walkRules(blk.body, media, visit);
    } else if (!blk.selector.startsWith("@")) visit(blk, scheme);
  }
}

/**
 * Lê as regras de um texto de CSS, cada seletor da lista com a sua especificidade, a ordem de carga e o tema do
 * `@media (prefers-color-scheme)` que o envolve (`scheme`: `"light"`, `"dark"` ou `null` fora de `@media`).
 * @param {string} css CSS sem comentários.
 * @param {string} file Nome da folha, só para a mensagem de `unsupported`.
 * @param {{rules: object[], unsupported: string[]}} into Onde acrescentar; a ordem de carga continua do que já tem.
 * @returns {{rules: object[], unsupported: string[]}} O próprio `into`.
 */
export function parseRules(css, file, into = { rules: [], unsupported: [] }) {
  walkRules(css, null, (blk, scheme) => {
    const decls = parseDecls(blk.body);
    for (const text of splitTop(blk.selector, ",")) {
      try {
        const sel = parseSelector(text);
        into.rules.push({ sel, text, decls, scheme, spec: selectorSpec(sel), order: into.rules.length });
      } catch {
        into.unsupported.push(`${file}: ${text}`);
      }
    }
  });
  return into;
}

/**
 * Regras das folhas na ordem de carga (ver `parseRules`).
 * @param {string[]} [files] Folhas de `client/css` na ordem de carga.
 * @returns {{rules: object[], unsupported: string[]}} Regras lidas e seletores que o motor não entende.
 */
export function loadRules(files = DEFAULT_FILES) {
  const key = files.join("|");
  if (!loaded.has(key)) loaded.set(key, files.reduce((into, file) => parseRules(readSheet(file), file, into), { rules: [], unsupported: [] }));
  return loaded.get(key);
}

/** A regra vale no ambiente: fora de `@media` sempre; dentro, só se o tema do sistema (`env.scheme`) for o dela. */
const appliesIn = (rule, env) => rule.scheme === null || rule.scheme === env.scheme;

/**
 * Monta a árvore de um elemento: do mais externo ao elemento, com estados só no último.
 * @param {string} path Caminho com `>` e espaço, por exemplo `html > body > div.app-layout.agora-ui > button#x.btn[disabled]`.
 * @param {string[]} [states] Estados do elemento (`hover`, `focus-visible`…).
 * @returns {object[]} Elementos `{tag, classes, attrs, states}`.
 */
export function buildChain(path, states = []) {
  const { compounds } = parseSelector(path);
  return compounds.map((c, i) => {
    const attrs = Object.fromEntries(c.attrs.map((a) => [a.name, a.value]));
    if (c.id) attrs.id = c.id;
    if (c.classes.length) attrs.class = c.classes.join(" ");
    const last = i === compounds.length - 1;
    const mine = last ? [...states, ...(states.includes("focus-visible") ? ["focus"] : [])] : [];
    return { tag: c.tag ?? "div", classes: c.classes, attrs, states: new Set(mine) };
  });
}

const beats = (a, b) => (a.important !== b.important ? a.important : cmpSpec(a.spec, b.spec) || a.order - b.order) > 0;

/**
 * Como `cascade`, sobre regras já lidas (`parseRules`): serve para testar o motor com CSS escrito no teste.
 * @param {object[]} rules Regras de `parseRules`.
 * @param {object[]} chain Árvore de `buildChain`.
 * @param {string[]} props Propriedades que contam.
 * @param {{scheme?: "light"|"dark"}} [env] Tema do sistema (`prefers-color-scheme`); sem ele, `@media` não vale.
 * @returns {{prop: string, value: string, important: boolean, spec: number[], order: number, selector: string}|null}
 */
export function cascadeIn(rules, chain, props, env = {}) {
  let best = null;
  for (const rule of rules) {
    if (!appliesIn(rule, env) || !matchComplex(rule.sel, chain)) continue;
    for (const prop of props) {
      const d = rule.decls.get(prop);
      const cand = d && { prop, value: d.value, important: d.important, spec: rule.spec, order: rule.order, selector: rule.text };
      if (cand && (!best || beats(cand, best))) best = cand;
    }
  }
  return best;
}

/**
 * A declaração que vence para o elemento entre as propriedades `props` (uma família como `background` e
 * `background-color` disputa junta). `!important` primeiro, depois especificidade, depois a ordem de carga.
 * @param {object[]} chain Árvore de `buildChain`.
 * @param {string[]} props Propriedades que contam.
 * @param {string[]} [files] Folhas na ordem de carga.
 * @param {{scheme?: "light"|"dark"}} [env] Tema do sistema (`prefers-color-scheme`); sem ele, `@media` não vale.
 * @returns {{prop: string, value: string, important: boolean, spec: number[], order: number, selector: string}|null}
 */
export function cascade(chain, props, files = DEFAULT_FILES, env = {}) {
  return cascadeIn(loadRules(files).rules, chain, props, env);
}

/**
 * Variáveis `--x` que valem na raiz (`html`) num ambiente, pela cascata: o atributo `data-color-mode` (`mode`) e o
 * tema do sistema (`scheme`) escolhem os blocos, e vence a regra por `!important`, especificidade e ordem. Lê o bloco
 * do atributo dentro do `@media` do outro tema (`:root[data-color-mode="dark"]` sob `prefers-color-scheme: light`).
 * @param {{scheme?: "light"|"dark", mode?: "light"|"dark"}} [env] `scheme`: tema do sistema; `mode`: atributo da raiz
 * (sem ele, modo automático).
 * @param {string[]} [files] Folhas na ordem de carga.
 * @returns {Map<string, string>} Nome da variável para o valor declarado (use com `hexOf`).
 */
export function themeTokens(env = {}, files = DEFAULT_FILES) {
  return tokensIn(loadRules(files).rules, env);
}

/**
 * Como `themeTokens`, sobre regras já lidas (`parseRules`): serve para testar a escolha da variável com CSS do teste.
 * @param {object[]} rules Regras de `parseRules`.
 * @param {{scheme?: "light"|"dark", mode?: "light"|"dark"}} [env] Ambiente (ver `themeTokens`).
 * @returns {Map<string, string>} Nome da variável para o valor declarado.
 */
export function tokensIn(rules, { scheme, mode } = {}) {
  const chain = buildChain(mode ? `html[data-color-mode="${mode}"]` : "html");
  const best = new Map();
  for (const rule of rules) {
    if (!appliesIn(rule, { scheme }) || !matchComplex(rule.sel, chain)) continue;
    for (const [prop, d] of rule.decls) {
      const cand = { value: d.value, important: d.important, spec: rule.spec, order: rule.order };
      if (prop.startsWith("--") && (!best.has(prop) || beats(cand, best.get(prop)))) best.set(prop, cand);
    }
  }
  return new Map([...best].map(([prop, c]) => [prop, c.value]));
}
