/**
 * @file Curtir, estrela e salvar dizem se estão ligados: `aria-pressed` (ou `aria-checked` no item de menu) sai no render
 * conforme o estado e troca no clique, no feed, no post aberto e no cartão de imagem.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom } from "./helpers/cov-t5-dom.mjs";
import * as social from "../client/js/social.js";
import * as igToolbar from "../client/js/render/ig-toolbar.js";
import * as feedToolbar from "../client/js/render/feed-post-toolbar.js";
import * as topic from "../client/js/render/topic.js";

const initSocial = await import("../client/js/app/init-social-actions.js");

const post = { id: "p_u14", title: "Post", author: "vx_a", ts: 1 };

/** Tag de abertura do botão com a classe `cls` no HTML. */
const tagOf = (html, cls) => new RegExp(`<button[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(html)?.[0] ?? "";

/** Valor de `aria-pressed` do botão (curtir e salvar). */
const stateOf = (tag) => /aria-pressed="(true|false)"/.exec(tag)?.[1] ?? null;

function setState({ liked, starred, saved }) {
  localStorage.clear();
  if (liked) social.toggleLike(post.id, 0);
  if (starred) social.toggleStar(post.id, 0);
  if (saved) social.toggleSave(post.id);
}

const RENDERS = {
  "cartão de imagem": () => igToolbar.renderIgToolbar(post, "Autor"),
  feed: () => feedToolbar.renderPostToolbar(post, "vx_a", "Autor", "@autor"),
  "post aberto": () => {
    const main = { innerHTML: "" };
    topic.renderTopic(main, post.id, post, []);
    return main.innerHTML;
  },
};

for (const [nome, render] of Object.entries(RENDERS)) {
  test(`${nome}: curtir e salvar saem com aria-pressed igual ao estado`, () => {
    for (const on of [false, true]) {
      setState({ liked: on, starred: on, saved: on });
      const html = render();
      assert.equal(stateOf(tagOf(html, "btn-like")), String(on), `curtir ${on}`);
      assert.equal(stateOf(tagOf(html, "btn-save")), String(on), `salvar ${on}`);
    }
  });
}

for (const nome of ["feed", "post aberto"]) {
  test(`${nome}: a estrela do menu é menuitemcheckbox com aria-checked igual ao estado`, () => {
    for (const on of [false, true]) {
      setState({ liked: false, starred: on, saved: false });
      const tag = tagOf(RENDERS[nome](), "btn-star");
      assert.match(tag, /role="menuitemcheckbox"/, "papel de caixa de seleção no menu");
      assert.match(tag, new RegExp(`aria-checked="${on}"`), `aria-checked ${on}`);
      assert.doesNotMatch(tag, /aria-pressed/, "aria-pressed não vale em item de menu");
    }
  });
}

test("clicar em curtir, estrela e salvar troca o atributo de estado", async () => {
  localStorage.clear();
  const doc = installDom();
  initSocial.initSocialInteractions();
  const click = async (selector, btn) => {
    const target = makeEl({ up: { [selector]: btn } });
    const ev = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of doc.docListeners.click) await fn(ev);
  };
  const like = makeEl({ dataset: { id: "p_click", count: "0" }, kids: { ".icon-heart": makeEl(), ".count-likes": makeEl() } });
  const star = makeEl({ dataset: { id: "p_click", count: "0" }, kids: { ".icon-star": makeEl(), ".count-stars": makeEl() } });
  star.setAttribute("role", "menuitemcheckbox");
  const save = makeEl({ dataset: { id: "p_click" }, kids: { ".icon-bookmark": makeEl() } });
  for (const [selector, btn, attr] of [[".btn-like", like, "aria-pressed"], [".btn-star", star, "aria-checked"], [".btn-save", save, "aria-pressed"]]) {
    await click(selector, btn);
    assert.equal(btn.getAttribute(attr), "true", `${selector} ligado`);
    await click(selector, btn);
    assert.equal(btn.getAttribute(attr), "false", `${selector} desligado`);
  }
  assert.equal(star.getAttribute("aria-pressed"), null, "a estrela do menu não ganha aria-pressed");
});
