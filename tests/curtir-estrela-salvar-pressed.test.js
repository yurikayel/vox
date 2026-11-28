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

/** Valor do atributo de estado do botão: `aria-pressed`, ou `aria-checked` quando é item de menu. */
const stateOf = (tag) => /aria-(?:pressed|checked)="(true|false)"/.exec(tag)?.[1] ?? null;

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
  test(`${nome}: a estrela sai com o estado igual ao da estrela`, () => {
    for (const on of [false, true]) {
      setState({ liked: false, starred: on, saved: false });
      assert.equal(stateOf(tagOf(RENDERS[nome](), "btn-star")), String(on), `estrela ${on}`);
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
  const save = makeEl({ dataset: { id: "p_click" }, kids: { ".icon-bookmark": makeEl() } });
  for (const [selector, btn] of [[".btn-like", like], [".btn-star", star], [".btn-save", save]]) {
    await click(selector, btn);
    assert.equal(btn.getAttribute("aria-pressed"), "true", `${selector} ligado`);
    await click(selector, btn);
    assert.equal(btn.getAttribute("aria-pressed"), "false", `${selector} desligado`);
  }
});
