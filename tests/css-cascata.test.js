/**
 * @file Motor da cascata (`helpers/css-cascata.js`) com CSS escrito no próprio teste: `!important` contra
 * especificidade, especificidade contra ordem, combinador descendente com ancestral no meio do caminho, e
 * `@media (prefers-color-scheme)` com o bloco do atributo `data-color-mode` aninhado no `@media` do outro tema. O último
 * grupo mede as folhas reais: o escuro por atributo com o sistema claro precisa trazer os avisos do tema escuro.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChain, cascadeIn, parseRules, themeTokens, tokensIn } from "./helpers/css-cascata.js";
import { hexOf } from "./helpers/css-tema.js";

const rulesOf = (css) => parseRules(css, "teste.css").rules;
const winner = (css, path, props, env) => cascadeIn(rulesOf(css), buildChain(path), props, env)?.value ?? null;

describe("!important, especificidade e ordem", () => {
  const COR = ["color"];
  it("!important vence seletor mais específico e mais tardio", () => {
    const css = ".x { color: red !important } #y.x.z { color: blue } .x.z { color: green }";
    assert.equal(winner(css, "html > span#y.x.z", COR), "red");
  });
  it("sem !important vence a maior especificidade, mesmo vindo antes", () => {
    assert.equal(winner(".x.z { color: green } .x { color: red }", "html > span.x.z", COR), "green");
  });
  it("sem !important e com a mesma especificidade vence a regra que vem por último", () => {
    assert.equal(winner(".w { color: green } .x { color: red }", "html > span.w.x", COR), "red");
  });
  it("dois !important disputam por especificidade, não por ordem", () => {
    assert.equal(winner(".x.z { color: green !important } .x { color: red !important }", "html > span.x.z", COR), "green");
  });
});

describe("combinador descendente e filho", () => {
  const COR = ["color"];
  it("descendente alcança o ancestral com elementos no meio; filho não", () => {
    const path = "html > div.a > section > p > span.c";
    assert.equal(winner(".a .c { color: red }", path, COR), "red");
    assert.equal(winner(".a > .c { color: red }", path, COR), null);
  });
  it("descendente com salto: o ancestral pode estar em qualquer nível acima, e só acima", () => {
    assert.equal(winner(".a .b .c { color: red }", "html > div.a > div > div.b > div > span.c", COR), "red");
    assert.equal(winner(".b .a .c { color: red }", "html > div.a > div > div.b > div > span.c", COR), null);
  });
});

describe("pseudo-elemento", () => {
  const CSS = ".a > b { color: blue } .a > b::before { color: red } .a > b:hover::before { color: green }";
  it("::before só casa quando o caminho o pede, e então só regras com ::before", () => {
    assert.equal(winner(CSS, "html > div.a > b::before", ["color"]), "red");
    assert.equal(winner(CSS, "html > div.a > b", ["color"]), "blue");
  });
  it("regra sem pseudo-elemento não vale para o pseudo-elemento, mesmo mais específica; e a com ::before não vale para o elemento", () => {
    assert.equal(winner("#i b { color: purple } .a > b::before { color: red }", "html > div#i.a > b::before", ["color"]), "red");
    assert.equal(winner("#i b { color: purple } .a > b::before { color: red }", "html > div#i.a > b", ["color"]), "purple");
    assert.equal(winner(".a > b::before { color: red }", "html > div.a > b", ["color"]), null);
  });
  it("o estado soma ao pseudo-elemento: b:hover::before ganha com hover e não sem ele", () => {
    const rules = rulesOf(CSS);
    const com = cascadeIn(rules, buildChain("html > div.a > b::before", ["hover"]), ["color"]);
    assert.equal(com.value, "green");
  });
});

describe("@media (prefers-color-scheme) e o bloco do atributo aninhado", () => {
  const VAR = ["--w"];
  const CSS = `:root { --w: claro }
    @media (prefers-color-scheme: dark) { :root:not([data-color-mode="light"]) { --w: escuro-auto } }
    @media (prefers-color-scheme: light) { :root[data-color-mode="dark"] { --w: escuro-atributo } }`;
  const root = (mode) => (mode ? `html[data-color-mode="${mode}"]` : "html");
  const at = (mode, scheme) => winner(CSS, root(mode), VAR, scheme && { scheme });
  it("o bloco do atributo escuro dentro do @media claro vale com o sistema claro", () => {
    assert.equal(at("dark", "light"), "escuro-atributo");
  });
  it("com o sistema escuro vale o bloco do modo automático (o atributo escuro não é \"light\"); sem ambiente, nenhum @media", () => {
    assert.equal(at("dark", "dark"), "escuro-auto");
    assert.equal(at("dark", undefined), "claro");
  });
  it("o bloco do modo automático vale só sem atributo claro e com o sistema escuro", () => {
    assert.equal(at(undefined, "dark"), "escuro-auto");
    assert.equal(at("light", "dark"), "claro");
    assert.equal(at(undefined, "light"), "claro");
  });
  it("@media de outro tipo e @supports continuam fora", () => {
    assert.equal(winner("@media (min-width: 1px) { :root { --w: largo } }", "html", VAR, { scheme: "light" }), null);
  });
});

describe("escolha da variável da raiz (tokensIn)", () => {
  it("a regra mais específica vence mesmo vindo antes; a mesma especificidade, a que vem depois", () => {
    const rules = rulesOf(":root[data-color-mode=\"dark\"] { --w: atributo } :root { --w: base } :root { --v: a } :root { --v: b }");
    const t = tokensIn(rules, { mode: "dark" });
    assert.equal(t.get("--w"), "atributo");
    assert.equal(t.get("--v"), "b");
  });
  it("só entram propriedades --x", () => {
    assert.deepEqual([...tokensIn(rulesOf(":root { --w: 1; color: red }"))], [["--w", "1"]]);
  });
});

describe("variáveis das folhas reais (themeTokens)", () => {
  const AVISOS = ["--warning", "--amber", "--warning-soft", "--amber-soft", "--success-soft", "--danger-soft"];
  it("escuro pelo atributo com o sistema claro traz os avisos do escuro, como o escuro automático", () => {
    const atributo = themeTokens({ scheme: "light", mode: "dark" });
    const automatico = themeTokens({ scheme: "dark" });
    for (const nome of AVISOS) assert.equal(atributo.get(nome), automatico.get(nome), nome);
    assert.equal(atributo.get("--warning"), "var(--brand-yellow)");
    assert.equal(atributo.get("--warning-soft"), "rgba(245, 196, 0, 0.14)");
  });
  it("o claro por atributo, mesmo com o sistema escuro, fica com os avisos do claro", () => {
    const claro = themeTokens({ scheme: "dark", mode: "light" });
    assert.equal(hexOf(claro, "--warning"), "#7a5c00");
    assert.equal(hexOf(claro, "--amber"), "#7a5c00");
    assert.equal(claro.get("--warning-soft"), "rgba(245, 196, 0, 0.18)");
  });
});
