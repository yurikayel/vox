/**
 * @file Testes da renderização persistida do borrão local no feed e revelação em 1 toque (F11).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();

const { renderPostItem } = await import("../client/js/render/feed-post-item.js");
const { handleRevealBlurredPostClick, installDomDelegates } = await import("../client/js/app/dom-delegates.js");
const moderation = await import("../client/js/moderation.js");

installDomDelegates(doc);

/** Cria post de texto mínimo para testes de renderização no feed. */
function makeTextPost(id, overrides = {}) {
  return {
    id,
    title: "Aviso comunitário",
    body: "Encontro na praça às 18h.",
    author: "addr_alice_01",
    authorDisplay: "Alice",
    communityId: "geral",
    ts: 1700000000000,
    ...overrides,
  };
}

/** Cria post com foto mínimo para testes de renderização no feed. */
function makePhotoPost(id, overrides = {}) {
  return {
    ...makeTextPost(id),
    image: "data:image/png;base64,iVBORw0KGgo=",
    ...overrides,
  };
}

test("renderPostItem — post não borrado mantém marcação intacta sem classes ou banner de borrão", () => {
  localStorage.clear();
  const textHtml = renderPostItem(makeTextPost("p_clean_text"));
  const photoHtml = renderPostItem(makePhotoPost("p_clean_photo"));

  for (const html of [textHtml, photoHtml]) {
    assert.equal(html.includes("is-locally-blurred"), false);
    assert.equal(html.includes("data-locally-blurred"), false);
    assert.equal(html.includes("data-local-blur-banner"), false);
    assert.equal(html.includes('data-action="reveal-blurred-post"'), false);
  }
});

test("renderPostItem — post de texto e foto borrados recebem classe, atributo e botão Mostrar conteúdo", () => {
  localStorage.clear();
  moderation.blurPostLocally("p_blur_text");
  moderation.blurPostLocally("p_blur_photo");

  for (const html of [renderPostItem(makeTextPost("p_blur_text")), renderPostItem(makePhotoPost("p_blur_photo"))]) {
    assert.ok(html.includes("is-locally-blurred"));
    assert.ok(html.includes('data-locally-blurred="1"'));
    assert.ok(html.includes("data-local-blur-banner"));
    assert.ok(html.includes('data-action="reveal-blurred-post"'));
    assert.ok(html.includes("Mostrar conteúdo"));
    assert.ok(html.includes('aria-label="Mostrar conteúdo ocultado localmente"'));
  }
});

test("renderPostItem — escapa post.id malicioso no botão de revelação (XSS)", () => {
  localStorage.clear();
  const evilId = 'p"><img src=x onerror=alert(1)>';
  moderation.blurPostLocally(evilId);

  const html = renderPostItem(makeTextPost(evilId));
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(html.includes('data-post-id="p&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"'));
});

test("dom-delegates — clique em Mostrar conteúdo revela card, limpa localStorage e faz 0 fetch", () => {
  localStorage.clear();
  const post = makeTextPost("p_reveal_click");
  const cleanBefore = renderPostItem(post);
  moderation.blurPostLocally(post.id);

  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("Rede proibida ao revelar borrão local");
  };

  try {
    doc.body.replaceChildren();
    const card = mount(doc, renderPostItem(post));
    const btn = card.querySelector('[data-action="reveal-blurred-post"]');
    assert.ok(btn);
    assert.equal(card.classList.contains("is-locally-blurred"), true);
    assert.equal(card.getAttribute("data-locally-blurred"), "1");

    click(btn);
    assert.equal(moderation.isPostBlurredLocally(post.id), false);
    assert.equal(JSON.parse(localStorage.getItem(moderation.BLURRED_STORAGE_KEY) || "[]").includes(post.id), false);
    assert.equal(card.classList.contains("is-locally-blurred"), false);
    assert.equal(card.getAttribute("data-locally-blurred"), null);
    assert.equal(card.querySelector("[data-local-blur-banner]"), null);
    assert.equal(renderPostItem(post), cleanBefore, "após revelar, HTML volta a ser idêntico ao original");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("handleRevealBlurredPostClick — cobre clique fora, fallback para data-id do card e banner sem card", () => {
  localStorage.clear();
  doc.body.replaceChildren();
  const plain = mount(doc, `<button type="button">Outro</button>`);
  assert.equal(handleRevealBlurredPostClick(plain), false);

  moderation.blurPostLocally("p_fallback_card");
  const card = mount(
    doc,
    `<article class="post is-locally-blurred" data-id="p_fallback_card" data-locally-blurred="1">
      <div data-local-blur-banner><button type="button" data-action="reveal-blurred-post">Mostrar conteúdo</button></div>
    </article>`
  );
  assert.equal(handleRevealBlurredPostClick(card.querySelector("button")), true);
  assert.equal(moderation.isPostBlurredLocally("p_fallback_card"), false);
  assert.equal(card.querySelector("[data-local-blur-banner]"), null);

  moderation.blurPostLocally("p_orphan_banner");
  const wrap = mount(
    doc,
    `<div><div data-local-blur-banner><button type="button" data-action="reveal-blurred-post" data-post-id="p_orphan_banner">Mostrar conteúdo</button></div></div>`
  );
  assert.equal(handleRevealBlurredPostClick(wrap.querySelector("button")), true);
  assert.equal(moderation.isPostBlurredLocally("p_orphan_banner"), false);
  assert.equal(wrap.querySelector("[data-local-blur-banner]"), null);
});
