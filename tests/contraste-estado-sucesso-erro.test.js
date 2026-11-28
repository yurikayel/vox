/**
 * @file Contraste do texto sobre `--success` e `--danger` nos dois temas (WCAG AA, 4,5:1). No tema escuro esses fundos
 * são claros (`#69dba9`, `#ffb4ab`) e o texto fixo `#fff` dava ~1,7:1 no botão de perigo ao passar o mouse e no aviso de
 * erro; o texto agora é `--on-accent`, que já troca por tema. O selo "Ajudando a rede"/"Ajuda pausada" usa `--on-gradient`
 * (corrigido antes, em outro PR) e fica aqui como guarda do par. A cor e o fundo de cada seletor vêm da cascata de verdade
 * (`helpers/css-cascata.js`: especificidade e ordem das folhas, estados e ancestrais) e os tokens de cada tema de
 * `helpers/css-tema.js`, por cada caminho de tema: atributo `data-color-mode` e `@media (prefers-color-scheme)`.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderNetworkHeader } from "../client/js/render/network-sections.js";
import { buildChain, cascade } from "./helpers/css-cascata.js";
import { assertRatio, contrast, hexOf, resolveTheme } from "./helpers/css-tema.js";

const FILLED = [
  { selector: ".vox-toast.error", path: "html > body > div.vox-toast.error", states: [] },
  { selector: ".btn-danger:hover", path: "html > body > button.btn.btn-danger", states: ["hover"] },
];
const ROUTES = [
  ["dark", "attr"],
  ["dark", "media"],
  ["light", "attr"],
  ["light", "media"],
];

/** Cor `#rrggbb` de um valor da cascata; o `hexOf` compartilhado não lê `#fff` (3 dígitos), que é justamente o que vinha no CSS. */
function colorOf(tokens, raw) {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw ?? "");
  return hexOf(tokens, short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : raw);
}

/** Valor que vence na cascata para a família `props` do elemento descrito por `path` e `states`. */
function winner({ path, states }, props) {
  return cascade(buildChain(path, states), props)?.value ?? null;
}

/** Pares `[texto, fundo]` dos selos de estado da rede (estilo em linha) para os dois estados. */
function badgePairs() {
  const pairs = [];
  for (const enabled of [true, false]) {
    const html = renderNetworkHeader({ settings: { enabled }, metrics: {}, rtcStatus: {}, gatewayHealth: {} });
    const m = html.match(/<span class="pill" style="background:\s*([^;"]+);\s*color:\s*([^;"]+);?">/);
    assert.ok(m, `selo de estado da rede (enabled=${enabled}) não encontrado no HTML`);
    pairs.push({ enabled, bg: m[1].trim(), fg: m[2].trim() });
  }
  return pairs;
}

describe("contraste do texto sobre --success e --danger", () => {
  for (const [theme, route] of ROUTES) {
    const where = route === "attr" ? "atributo data-color-mode" : "@media prefers-color-scheme (automático)";
    it(`tema ${theme} (${where}): seletores de erro/perigo preenchidos`, () => {
      const tokens = resolveTheme(theme, route);
      for (const target of FILLED) {
        const fg = winner(target, ["color"]);
        const bg = winner(target, ["background", "background-color"]);
        assert.ok(fg && bg, `${target.selector}: a cascata não achou cor (${fg}) ou fundo (${bg})`);
        assertRatio(`${theme}/${route}: ${target.selector}`, colorOf(tokens, fg), colorOf(tokens, bg));
      }
    });
    it(`tema ${theme} (${where}): selo "Ajudando a rede" / "Ajuda pausada"`, () => {
      const tokens = resolveTheme(theme, route);
      for (const { enabled, bg, fg } of badgePairs()) {
        assertRatio(`${theme}/${route}: selo enabled=${enabled} (${fg} sobre ${bg})`, hexOf(tokens, fg), hexOf(tokens, bg));
      }
    });
  }
  it("o selo usa --success quando ajuda e --danger quando pausa (o teste não mede par trocado)", () => {
    const [on, off] = badgePairs();
    assert.equal(on.bg, "var(--success)");
    assert.equal(off.bg, "var(--danger)");
  });
  it("a fórmula mede o par ruim conhecido: #fff sobre o verde claro do tema escuro dá menos de 3:1", () => {
    assert.ok(contrast("#ffffff", "#69dba9") < 3);
    assert.ok(contrast("#00201e", "#69dba9") >= 4.5);
  });
});
