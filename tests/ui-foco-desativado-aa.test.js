/**
 * @file Desativado e foco visível com contraste AA nos dois temas (folha `sv-tokens.css`). O desativado é medido na
 * cascata real (`helpers/css-cascata.js`: ancestral, classes de variante, estados e a ordem das folhas) com o botão
 * inteiro como o app o monta (`btn btn-primary`, `btn btn-outline`, `agora-btn`, `dungeon-btn`…), dentro do app, na
 * Mesa e fora do app (modal): o desativado precisa vencer o ativo em fundo, texto, opacidade, cursor, sombra e
 * movimento, e os tokens dele passam em contraste (texto ≥ 4.5:1, contorno ≥ 3:1). O anel de foco da Mesa é medido
 * pela mesma cascata. As pílulas de rede usam o texto do par do tema (branco fixo dava 1,7:1 no escuro).
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildChain, cascade, loadRules, parseSelector, selectorSpec } from "./helpers/css-cascata.js";
import { assertRatio, blocks, hexOf, readSheet, resolveTheme, SV_SHEETS } from "./helpers/css-tema.js";

const ROUTES = [
  ["light", "attr", "tema claro pelo atributo"],
  ["light", "media", "tema claro pelo @media (modo automático)"],
  ["dark", "both", "tema escuro"],
];
const BG = ["background", "background-color", "background-image"];
const BORDER = ["border", "border-color"];
const APP = "html > body > div.app-layout.agora-ui";
const MESA = `${APP} > section.dungeon-sanctum`;
const CONTEXTS = [
  [APP, "dentro do app"],
  [MESA, "dentro da Mesa"],
  ["html > body > div.modal", "fora do app (modal)"],
];
/** Botões como o JS os monta: classes, forma de desativar e cursor esperado. */
const BOTOES = [
  ["button#btn-send-dm.btn.btn-primary"],
  ["button#btn-inline-submit.btn.btn-primary.btn-sm.btn-inline-submit"],
  ["button#btn-connect-add.btn.btn-primary"],
  ["button.btn.btn-primary.btn-pact-continue"],
  ["button.btn.btn-outline"],
  ["button.btn.btn-outline.btn-sm.btn-inline-echo"],
  ["button.btn.btn-outline.btn-pact-settings"],
  ["button.btn"],
  ["button.agora-btn.agora-btn--primary.btn-primary"],
  ["button.agora-btn.agora-btn--solid.btn-primary"],
  ["button.agora-btn.agora-btn--primary"],
  ["button.agora-btn.agora-btn--solid"],
  ["button.agora-btn.agora-btn--secondary"],
  ["button.agora-btn.agora-btn--primary", '[aria-disabled="true"]'],
  ["button.agora-btn.agora-btn--secondary#btn-civic-poll-add"],
  ["button.civic-poll-remove"],
  ["button.civic-choice-btn", "[disabled]", "progress"],
  ["button.dungeon-btn.dungeon-btn-primary"],
  ["button.dungeon-btn.dungeon-btn-secondary"],
  ["button.dungeon-btn.dungeon-btn-ghost"],
];

/** Valor que vence para o elemento (`path`, com estados) entre as propriedades da família. */
function winner(path, states, props) {
  return cascade(buildChain(path, states), props)?.value ?? null;
}

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

describe("desativado vence o ativo na cascata real, botão inteiro, em todo contexto", () => {
  for (const [classes, off = "[disabled]", cursor = "not-allowed"] of BOTOES) {
    it(`${classes}${off}`, () => {
      for (const [ctx, nome] of CONTEXTS) {
        for (const states of [[], ["hover"]]) {
          const v = (props) => winner(`${ctx} > ${classes}${off}`, states, props);
          const quando = `${classes}${off} ${nome}${states.length ? " com o ponteiro em cima" : ""}`;
          assert.equal(v(BG), "var(--sv-disabled-bg)", `${quando}: fundo`);
          assert.equal(v(["color"]), "var(--sv-disabled-text)", `${quando}: texto`);
          assert.equal(v(BORDER), "var(--sv-disabled-line)", `${quando}: contorno`);
          assert.ok([null, "1"].includes(v(["opacity"])), `${quando}: opacidade ${v(["opacity"])}`);
          assert.equal(v(["cursor"]), cursor, `${quando}: cursor`);
          assert.ok([null, "none"].includes(v(["box-shadow"])), `${quando}: sombra ${v(["box-shadow"])}`);
          assert.ok([null, "none"].includes(v(["transform"])), `${quando}: movimento ${v(["transform"])}`);
        }
        const ativo = (props) => winner(`${ctx} > ${classes}`, [], props);
        const desativado = (props) => winner(`${ctx} > ${classes}${off}`, [], props);
        assert.notEqual(desativado(BG), ativo(BG), `${classes} ${nome}: o fundo desativado difere do ativo`);
        assert.notEqual(desativado(["color"]), ativo(["color"]), `${classes} ${nome}: o texto desativado difere do ativo`);
      }
    });
  }
});

describe("anel de foco dentro da Mesa (.dungeon-sanctum) com contraste ≥ 3:1", () => {
  const CONTROLES = ["a.dungeon-dock-link", "button.dungeon-btn.dungeon-btn-primary", "button.agora-btn", "input", "summary"];
  const SUPERFICIES = ["--sa-surface", "--sa-surface-container", "--sa-surface-highest"];
  for (const [theme, route, nome] of ROUTES) {
    it(`anel de cada controle sobre as superfícies da Mesa (${nome})`, () => {
      const t = resolveTheme(theme, route);
      for (const controle of CONTROLES) {
        const anel = winner(`${MESA} > ${controle}`, ["focus-visible"], ["outline", "outline-color"]);
        assert.ok(anel && !/\bnone\b|^0\b/.test(anel), `${controle}: há anel (${anel})`);
        const cor = anel.match(/var\([^)]*\)|#[0-9a-f]{6}/i)?.[0] ?? anel;
        for (const s of SUPERFICIES) assertRatio(`${theme}/${route}: anel de ${controle} (${cor}) sobre ${s}`, hexOf(t, cor), hexOf(t, s), 3);
      }
    });
  }
});

describe("motor da cascata (a régua dos testes acima)", () => {
  it("especificidade: :is e :not valem o maior argumento, :where vale zero, estado vale uma classe", () => {
    const spec = (s) => selectorSpec(parseSelector(s));
    assert.deepEqual(spec(".dungeon-sanctum :is(a, button, input, summary):focus-visible"), [0, 2, 1]);
    assert.deepEqual(spec(":where(a, button):focus-visible"), [0, 1, 0]);
    assert.deepEqual(spec("#x.a[b]:not(.c)"), [1, 3, 0]);
    assert.deepEqual(spec(".agora-ui .btn.btn-primary:disabled"), [0, 4, 0]);
  });
  it("o ancestral e a classe de variante entram: `.agora-ui .btn.btn-primary` só vence com o ancestral", () => {
    const comAncestral = cascade(buildChain(`${APP} > button.btn.btn-primary`), BG);
    const semAncestral = cascade(buildChain("html > body > button.btn.btn-primary"), BG);
    assert.equal(comAncestral.selector, ".agora-ui .btn.btn-primary");
    assert.notEqual(semAncestral.selector, comAncestral.selector);
  });
  it("lê todas as folhas do app, salvo o único seletor com colchete dentro do valor do atributo", () => {
    assert.deepEqual(loadRules().unsupported, ['agora.css: .agora-composer--post .civic-tag-btn[data-tag="[Bug]"]']);
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
