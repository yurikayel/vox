/**
 * @file Guarda de acessibilidade: toda <img> gerada por feed/photo-chrome tem alt,
 * e imagem de conteúdo nunca fica com alt vazio (só decorativas usam alt="").
 */
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const feed = await import("../client/js/render/feed.js");
const photoChrome = await import("../client/js/render/photo-chrome.js");

const IMG = "data:image/png;base64,AAAA";
const base = { id: "t1", type: "topic", author: "vx_a", authorDisplay: "Ana", ts: 1, title: "", body: "" };

function imgTags(html) {
  return html.match(/<img\b[^>]*>/g) || [];
}

function altOf(tag) {
  const m = tag.match(/\salt="([^"]*)"/);
  return m ? m[1] : null;
}

const htmls = {
  "post com imagem sem título nem alt": () => feed.renderPostItem({ ...base, image: IMG }),
  "post com imagem e título": () => feed.renderPostItem({ ...base, title: "Praia", image: IMG }),
  "post com imageAlt": () => feed.renderPostItem({ ...base, image: IMG, imageAlt: "Cachorro na praia" }),
  "post com avatar": () => feed.renderPostItem({ ...base, title: "x", authorAvatar: "https://x/a.jpg" }),
  "stories": () => feed.renderStoriesStrip([{ name: "Zé", avatar: "https://x/z.jpg" }]),
  "compositor inline": () => feed.renderInlineComposer({}),
  "foto oculta": () => photoChrome.renderPhotoHiddenMessageHtml({ ...base, title: "a", body: "b" }),
};

for (const [nome, gerar] of Object.entries(htmls)) {
  test(`img-alt-guard - toda <img> tem alt: ${nome}`, () => {
    for (const tag of imgTags(gerar())) {
      assert.notEqual(altOf(tag), null, `<img> sem alt: ${tag}`);
    }
  });
}

test("img-alt-guard - imagem de conteúdo sem legenda recebe alt descritivo", () => {
  const tags = imgTags(feed.renderPostItem({ ...base, image: IMG })).filter((t) => t.includes("post-media"));
  assert.equal(tags.length, 1);
  assert.notEqual(altOf(tags[0]), "", "imagem de conteúdo com alt vazio");
});

test("img-alt-guard - legenda do post vira alt quando existe", () => {
  const [tag] = imgTags(feed.renderPostItem({ ...base, title: "Praia", image: IMG })).filter((t) => t.includes("post-media"));
  assert.equal(altOf(tag), "Praia");
});
