/**
 * @file Foco visível do link do avatar no cartão de comunidade da Ágora (`a.community-vox-card-avatar-wrap`, montado em
 * `render/community-home.js`). O link só tem a imagem dentro e nenhum texto: sem contorno, quem navega por teclado não
 * vê onde está. A regra de avatares de `agora.css` (squircle) dava `outline: 0 !important` ao link e o recortava com
 * máscara, que também cortaria qualquer contorno fora da caixa. Mede a cascata de verdade (`helpers/css-cascata.js`:
 * especificidade, `!important`, ordem das folhas, estado `:focus-visible`) e os tokens de cada tema
 * (`helpers/css-tema.js`) nos quatro caminhos de tema: contorno com pelo menos 3:1 sobre o fundo do cartão e o link
 * sem máscara. O caminho do elemento sai do HTML que `renderHome` monta, não de uma cópia.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as render from "../client/js/render.js";
import { buildChain, cascade } from "./helpers/css-cascata.js";
import { assertRatio, hexOf, resolveTheme } from "./helpers/css-tema.js";

const ROUTES = [
  ["dark", "attr"],
  ["dark", "media"],
  ["light", "attr"],
  ["light", "media"],
];
const COLOR = /var\(--[a-z0-9-]+(?:\s*,[^)]*)?\)|#[0-9a-f]{6}\b/i;

/** Classes do cartão e do link do avatar, lidas do HTML real da lista de comunidades. */
function renderedClasses() {
  const main = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  render.renderHome(main, [{ id: "cinema", title: "Cinema Nacional", description: "Resenhas.", memberCount: 3 }]);
  const card = main.innerHTML.match(/<article class="([^"]+)"/)?.[1];
  const link = main.innerHTML.match(/<a class="([^"]*avatar-wrap[^"]*)" href/)?.[1];
  assert.ok(card && link, "renderHome monta o cartão e o link do avatar");
  const dotted = (list) => list.trim().split(/\s+/).map((c) => `.${c}`).join("");
  return { CARD: `html > body > div.app-layout.agora-ui > main#app-main > article${dotted(card)}`, LINK: `a${dotted(link)}` };
}

const { CARD, LINK } = renderedClasses();
const AVATAR = `${CARD} > ${LINK}`;
const winner = (path, props, states = []) => cascade(buildChain(path, states), props)?.value ?? null;

describe("link do avatar do cartão de comunidade (só imagem, sem texto)", () => {
  for (const [theme, route] of ROUTES) {
    it(`tema ${theme} (${route}): contorno de foco com pelo menos 3:1 sobre o fundo do cartão`, () => {
      const tokens = resolveTheme(theme, route);
      const outline = winner(AVATAR, ["outline", "outline-color"], ["focus-visible"]);
      assert.ok(outline && !/^\s*(0|none)\b/.test(outline), `o link precisa de contorno no :focus-visible (achou: ${outline})`);
      const fg = outline.match(COLOR)?.[0];
      const bg = winner(CARD, ["background", "background-color"])?.match(COLOR)?.[0];
      assertRatio(`${theme}/${route}: contorno (${outline})`, hexOf(tokens, fg), hexOf(tokens, bg), 3);
    });
  }
  it("o link não leva máscara nem espessura de contorno zero: a máscara cortaria o contorno de foco", () => {
    assert.equal(winner(AVATAR, ["mask", "-webkit-mask", "mask-image"]), null, "sem máscara no link (ela fica no avatar de dentro)");
    assert.doesNotMatch(winner(AVATAR, ["outline-width"], ["focus-visible"]) ?? "", /^\s*0/);
  });
  it("o avatar de dentro segue com a máscara de squircle (o visual não muda)", () => {
    const inner = `${AVATAR} > div.community-avatar-box.community-avatar-md.agora-community-avatar`;
    assert.ok(winner(inner, ["mask", "-webkit-mask", "mask-image"]), "o avatar interno tem a máscara");
  });
});
