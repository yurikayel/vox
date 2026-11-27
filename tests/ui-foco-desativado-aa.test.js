/**
 * @file Foco visível e desativado com contraste AA nos dois temas (folha `sv-tokens.css`): o anel de foco sobre faixa
 * de container primário ou de erro (o anel global some ali), o desativado sem `opacity` com texto ≥ 4.5:1 e contorno
 * ≥ 3:1, e as pílulas de rede com o texto do par do tema (branco fixo dava 1,7:1 no escuro). Cada caminho de tema
 * (atributo `data-color-mode` e `@media` sem atributo) é medido separado.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertRatio, blocks, contrast, hexOf, readSheet, renderedDecl, resolveTheme, SV_SHEETS } from "./helpers/css-tema.js";

const ROUTES = [
  ["light", "attr", "tema claro pelo atributo"],
  ["light", "media", "tema claro pelo @media (modo automático)"],
  ["dark", "both", "tema escuro"],
];
const SHEETS = ["style.css", "agora.css", ...SV_SHEETS];
const FOCABLE = ":where(a, button, input, select, textarea, summary, [tabindex])";
const FAIXAS = [
  { classe: ".sv-faixa-primaria", fundo: "--sa-primary-container", par: "--sv-on-primary-container" },
  { classe: ".sv-faixa-erro", fundo: "--sa-error-container", par: "--sv-on-error-container" },
];
const DESATIVADOS = [
  ".dungeon-btn[disabled]",
  ".dungeon-btn[disabled]:hover",
  ".agora-btn[disabled]",
  ".agora-btn[aria-disabled=\"true\"]",
  ".btn:disabled",
  ".btn:disabled:hover",
  ".btn-inline-submit:disabled",
  ".btn-inline-echo:disabled",
  ".btn-pact-continue:disabled",
  ".btn-pact-settings:disabled",
  ".civic-choice-btn:disabled",
  ".civic-poll-remove:disabled",
  "#btn-civic-poll-add:disabled",
];

const tokensSheet = () => blocks(readSheet("sv-tokens.css"));

describe("foco visível sobre faixa de container primário ou de erro", () => {
  for (const [theme, route, nome] of ROUTES) {
    for (const { classe, fundo, par } of FAIXAS) {
      it(`${classe}: anel e texto do par do fundo ≥ 3:1 e ≥ 4.5:1 (${nome})`, () => {
        const t = resolveTheme(theme, route);
        const bg = hexOf(t, fundo);
        assertRatio(`${theme}/${route}: anel ${par} sobre ${fundo}`, hexOf(t, par), bg, 3);
        assertRatio(`${theme}/${route}: texto ${par} sobre ${fundo}`, hexOf(t, par), bg, 4.5);
        const fundoDaClasse = hexOf(t, renderedDecl(classe, "background") ?? "");
        assert.equal(fundoDaClasse, bg, `${classe} usa o fundo ${fundo}`);
      });
    }
  }
  it("a regra do anel dentro de cada faixa só troca a cor, com `:where` e `:focus-visible`, sem suprimir o foco", () => {
    for (const { classe, par } of FAIXAS) {
      const regra = tokensSheet().find((b) => b.selector === `${classe} ${FOCABLE}:focus-visible`);
      assert.ok(regra, `${classe}: há regra de anel para os controles da faixa`);
      assert.match(regra.body, new RegExp(`outline-color:\\s*var\\(${par}\\)`));
      assert.doesNotMatch(regra.body, /outline\s*:\s*(none|0)\b|outline-style\s*:\s*none/);
    }
  });
  it("o anel global (agora.css) sobre essas faixas ficaria abaixo de 3:1 em algum tema (a razão da regra)", () => {
    const abaixo = ROUTES.flatMap(([theme, route]) => {
      const t = resolveTheme(theme, route);
      return FAIXAS.map(({ fundo }) => contrast(hexOf(t, "--sa-primary"), hexOf(t, fundo)));
    });
    assert.ok(abaixo.some((r) => r < 3), "o anel global passa em todas: a regra das faixas não teria motivo");
  });
});

describe("desativado sem opacity, com texto ≥ 4.5:1 e contorno ≥ 3:1", () => {
  for (const [theme, route, nome] of ROUTES) {
    it(`texto sobre o fundo do desativado e contorno sobre fundo e superfícies (${nome})`, () => {
      const t = resolveTheme(theme, route);
      const bg = hexOf(t, "--sv-disabled-bg");
      assertRatio(`${theme}/${route}: texto desativado`, hexOf(t, "--sv-disabled-text"), bg, 4.5);
      for (const fundo of [bg, hexOf(t, "--sa-surface"), hexOf(t, "--sa-surface-container")]) {
        assertRatio(`${theme}/${route}: contorno desativado sobre ${fundo}`, hexOf(t, "--sv-disabled-line"), fundo, 3);
      }
    });
  }
  for (const selector of DESATIVADOS) {
    it(`${selector}: sem opacidade e com texto, fundo e contorno dos tokens do desativado`, () => {
      const vence = (prop) => renderedDecl(selector, prop, SHEETS);
      assert.equal(vence("opacity"), "1", "a opacidade que vence é 1 (nenhuma folha antiga esmaece o botão)");
      assert.equal(vence("background"), "var(--sv-disabled-bg)");
      assert.equal(vence("color"), "var(--sv-disabled-text)");
      assert.equal(vence("border-color"), "var(--sv-disabled-line)");
    });
  }
  it("nenhuma regra de desativado das folhas sv-*.css usa opacity menor que 1", () => {
    for (const file of SV_SHEETS) {
      for (const blk of blocks(readSheet(file))) {
        if (!/:disabled|\[disabled\]|\[aria-disabled/.test(blk.selector)) continue;
        for (const m of blk.body.matchAll(/(?:^|;|\s)opacity\s*:\s*([^;]+)/g)) {
          assert.equal(m[1].trim(), "1", `${file}: ${blk.selector.split(",")[0]} com opacity ${m[1].trim()}`);
        }
      }
    }
  });
});

describe("pílulas de rede: texto do par do tema sobre sucesso e perigo", () => {
  const fonte = fs.readFileSync(new URL("../client/js/render/network-sections.js", import.meta.url), "utf8");
  it("o estilo das pílulas não fixa branco: o texto vem de --on-gradient", () => {
    const pilulas = [...fonte.matchAll(/<span class="pill" style="([^"]*)"/g)].map((m) => m[1]);
    assert.equal(pilulas.length, 2, "as duas pílulas (ajudando e pausada)");
    for (const estilo of pilulas) {
      assert.match(estilo, /color:\s*var\(--on-gradient\)/);
      assert.doesNotMatch(estilo, /color:\s*#(?:fff|ffffff)\b/i);
    }
  });
  for (const [theme, route, nome] of ROUTES) {
    it(`--on-gradient sobre --success e --danger ≥ 4.5:1 (${nome})`, () => {
      const t = resolveTheme(theme, route);
      for (const fundo of ["--success", "--danger"]) assertRatio(`${theme}/${route}: texto sobre ${fundo}`, hexOf(t, "--on-gradient"), hexOf(t, fundo), 4.5);
    });
  }
});
