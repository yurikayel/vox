/**
 * @file Alvos de toque de pelo menos 24 px (WCAG 2.5.8) nos controles que mediam 16 a 21 px de altura em Chromium a 320–390 px:
 * rodapé "feedback", dispensar tópico de boas-vindas, "ver mais" de membros, autor do post, link manual de contas, slider de
 * favoritos, campo de competências e `summary`. Usa a cascata de `helpers/css-cascata.js` (ancestral, especificidade,
 * `!important` e ordem das folhas; `@media` fica de fora, então um bloco que nunca casa não conta). Também confere que o
 * autor do post não vira flex, o que mataria as reticências do cabeçalho do feed.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { buildChain, cascade } from "./helpers/css-cascata.js";

const MIN = 24;
const APP = "html > body > div.app-layout.agora-ui";
const TARGETS = [
  ["app-footer-feedback", `${APP} > a.app-footer-feedback`],
  ["link-alt", `${APP} > a.link-alt`],
  ["btn-dismiss-welcome-topic", `${APP} > button.btn-dismiss-welcome-topic`],
  ["community-orkut-members-more", `${APP} > a.community-orkut-members-more`],
  ["post-author (solto)", `${APP} > a.post-author`],
  ["post-author (cabeçalho do feed)", `${APP} > div.post-header-meta > div.post-author-line > a.post-author`],
  ["dungeon-range", `${APP} > input.dungeon-range`],
  ["campo de competências", `${APP} > div.aviso-skills > input[type="text"]`],
  ["summary", `${APP} > summary`],
];

const winner = (path, prop) => cascade(buildChain(path), [prop]);
const px = (v) => (v?.endsWith("px") ? Number.parseFloat(v) : v?.endsWith("rem") ? Number.parseFloat(v) * 16 : Number.NaN);

for (const [name, path] of TARGETS) {
  test(`${name}: altura mínima de ${MIN} px`, () => {
    const w = winner(path, "min-height");
    assert.ok(px(w?.value) >= MIN, `${name}: min-height ${w?.value ?? "ausente"} (${w?.selector}) < ${MIN}px`);
  });
}

test("o botão de dispensar também tem largura mínima de 24 px", () => {
  const w = winner(TARGETS[2][1], "min-width");
  assert.ok(px(w?.value) >= MIN, `min-width ${w?.value ?? "ausente"}`);
});

test("o autor do post não é flex (flex mataria o text-overflow do cabeçalho do feed)", () => {
  for (const [name, path] of TARGETS.filter(([n]) => n.startsWith("post-author"))) {
    const d = winner(path, "display");
    assert.ok(!/flex/.test(d?.value ?? ""), `${name}: display ${d?.value} (${d?.selector})`);
  }
});

test("as reticências do autor no cabeçalho do feed continuam valendo", () => {
  const path = TARGETS.find(([n]) => n.includes("cabeçalho"))[1];
  assert.equal(winner(path, "text-overflow")?.value, "ellipsis");
  assert.equal(winner(path, "overflow")?.value, "hidden");
  assert.equal(winner(path, "white-space")?.value, "nowrap");
});
