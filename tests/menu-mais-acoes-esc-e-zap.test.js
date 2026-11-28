/**
 * @file Menu ⋯ da barra do post (feed e post aberto): Esc fecha e devolve o foco ao summary, e todo item dentro do
 * `role="menu"`, o zap (Pix) inclusive, tem papel de item de menu.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom } from "./helpers/cov-t5-dom.mjs";
import * as feedToolbar from "../client/js/render/feed-post-toolbar.js";
import * as topic from "../client/js/render/topic.js";

const { initSocialInteractions } = await import("../client/js/app/init-social-actions.js");

const post = { id: "p_f38", title: "Post", author: "vx_a", ts: 1, contactPix: "pix@vox.test" };
const semPix = { ...post, contactPix: "" };

const RENDERS = {
  feed: (p) => feedToolbar.renderPostToolbar(p, "vx_a", "Autor", "@autor"),
  "post aberto": (p) => {
    const main = { innerHTML: "" };
    topic.renderTopic(main, p.id, p, []);
    return main.innerHTML;
  },
};

/** Tag de abertura do zap no HTML. */
const zapTag = (html) => /<button[^>]*\bbtn-zap-post\b[^>]*>/.exec(html)?.[0] ?? "";

for (const [nome, render] of Object.entries(RENDERS)) {
  test(`${nome}: o zap dentro do menu tem role="menuitem", com e sem Pix`, () => {
    for (const p of [post, semPix]) {
      const tag = zapTag(render(p));
      assert.ok(tag, "zap renderizado");
      assert.match(tag, /role="menuitem"/, p.contactPix ? "zap com Pix" : "zap sem Pix");
    }
  });

  test(`${nome}: todo botão dentro do role="menu" tem papel de item`, () => {
    const html = render(post);
    const menu = /<div class="toolbar-overflow-menu" role="menu">([\s\S]*?)<\/div>\s*<\/details>/.exec(html)?.[1] ?? "";
    const botoes = menu.match(/<button[^>]*>/g) ?? [];
    assert.ok(botoes.length >= 3, "o menu tem botões");
    for (const tag of botoes) assert.match(tag, /role="menuitem(?:checkbox)?"/, tag.slice(0, 80));
  });
}

test("Esc fecha o menu ⋯ aberto e devolve o foco ao summary; outras teclas não fecham", async () => {
  const doc = installDom();
  initSocialInteractions();
  const summary = makeEl({ tagName: "SUMMARY" });
  const menu = makeEl({ tagName: "DETAILS", kids: { summary } });
  menu.setAttribute("open", "");
  const item = makeEl({ up: { "details.toolbar-overflow[open]": menu } });
  const press = async (key, target) => {
    const ev = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of doc.docListeners.keydown) await fn(ev);
    return ev;
  };
  await press("Enter", item);
  assert.equal(menu.getAttribute("open"), "", "Enter não fecha");
  const ev = await press("Escape", item);
  assert.equal(menu.getAttribute("open"), null, "Esc fecha o menu");
  assert.equal(summary.focused, 1, "o foco volta ao summary");
  assert.ok(ev.defaultPrevented);
  const fora = await press("Escape", makeEl());
  assert.equal(fora.defaultPrevented, false, "Esc fora de um menu aberto não é consumido");
});
