import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as postOwnership from "../client/js/post-ownership.js";
import * as render from "../client/js/render.js";

test("formatPostDisplay - linha única não duplica título e corpo", () => {
  const disp = postOwnership.formatPostDisplay({ title: "A Meta", body: "A Meta" });
  assert.equal(disp.mode, "caption");
  assert.equal(disp.text, "A Meta");
});

test("formatPostDisplay - multilinha mantém título e resto do corpo", () => {
  const disp = postOwnership.formatPostDisplay({
    title: "Olá rede",
    body: "Olá rede\nSegunda linha com #tag",
  });
  assert.equal(disp.mode, "title-body");
  assert.equal(disp.title, "Olá rede");
  assert.equal(disp.body, "Segunda linha com #tag");
});

test("formatPostDisplay - corpo vazio usa caption do título", () => {
  const disp = postOwnership.formatPostDisplay({ title: "Só título", body: "" });
  assert.equal(disp.mode, "caption");
  assert.equal(disp.text, "Só título");
});

test("deriveTopicTitleFromBody - primeira linha vira título", () => {
  const { title, body } = postOwnership.deriveTopicTitleFromBody("A Meta\nDetalhe");
  assert.equal(title, "A Meta");
  assert.equal(body, "A Meta\nDetalhe");
});

test("renderPostTextHtml - feed não repete texto quando title === body", () => {
  const html = render.renderPostTextHtml({
    id: "top_dup",
    title: "A Meta",
    body: "A Meta",
  });
  assert.ok(html.includes("post-caption-only"));
  assert.ok(!html.includes("post-title"));
  assert.equal((html.match(/A Meta/g) || []).length, 1);
});

test("renderPostTextHtml - multilinha mostra título e corpo distintos", () => {
  const html = render.renderPostTextHtml({
    id: "top_multi",
    title: "Título",
    body: "Título\nCorpo extra",
  });
  assert.ok(html.includes("post-title"));
  assert.ok(html.includes("Corpo extra"));
  assert.ok(!html.includes("post-caption-only"));
});

test("postEditInitialText - campo único para post de linha única", () => {
  assert.equal(render.postEditInitialText({ title: "A Meta", body: "A Meta" }), "A Meta");
});
