/**
 * @file Testes da UI do aviso local preventivo no compositor e do borrão local em 1 toque (F11).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const toasts = captureToasts(doc);

const pub = await import("../client/js/app/inline-composer-publish.js");
const st = await import("../client/js/app/inline-composer-state.js");
const cacheNode = await import("../client/js/cache-node.js");
const actions = await import("../client/js/app/post-more-actions.js");
const menu = await import("../client/js/app/post-more-menu.js");
const moderation = await import("../client/js/moderation.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

/** Monta o formulário do compositor inline com ou sem slot de aviso consultivo. */
function mountInlineComposer({ withSlot = true, slotByAttr = false } = {}) {
  doc.body.replaceChildren();
  const slotHtml = withSlot
    ? slotByAttr
      ? `<div data-advisory-slot hidden></div>`
      : `<div id="inline-composer-advisory" hidden></div>`
    : "";
  const root = mount(
    doc,
    `<section id="feed-inline-composer">
      <form id="form-inline-topic">
        <textarea id="inline-topic-body"></textarea>
        <input id="inline-topic-comm" value="geral" />
        ${slotHtml}
        <button id="btn-inline-submit" type="submit">Postar</button>
      </form>
    </section>`
  );
  const form = root.querySelector("#form-inline-topic");
  form.reset = () => {
    root.querySelector("#inline-topic-body").value = "";
  };
  st.clearMedia();
  return {
    form,
    body: root.querySelector("#inline-topic-body"),
    slot: root.querySelector("#inline-composer-advisory") || root.querySelector("[data-advisory-slot]"),
  };
}

test("checkComposerAdvisory — texto limpo libera publicação e limpa slot sem avisos", () => {
  const { slot } = mountInlineComposer();
  slot.innerHTML = "<p>antigo</p>";
  slot.hidden = false;
  slot.setAttribute("data-advisory-dismissed", "1");

  const res = pub.checkComposerAdvisory({ title: "Aviso da praça", body: "Encontro sábado às 10h." }, slot);
  assert.equal(res.proceed, true);
  assert.equal(res.advisoryOnly, true);
  assert.equal(res.blocksPublish, false);
  assert.equal(res.result.hasWarnings, false);
  assert.equal(slot.innerHTML, "");
  assert.equal(slot.hidden, true);
  assert.equal(slot.getAttribute("data-advisory-dismissed"), null);
});

test("checkComposerAdvisory — sem slot nunca bloqueia fluxo programático mesmo com alerta", () => {
  const res = pub.checkComposerAdvisory("Meu CPF é 123.456.789-01 e veja https://bit.ly/ata");
  assert.equal(res.proceed, true);
  assert.equal(res.advisoryOnly, true);
  assert.equal(res.blocksPublish, false);
  assert.equal(res.result.hasWarnings, true);
  assert.equal(res.result.warnings.length, 2);
});

test("checkComposerAdvisory — renderiza banner consultivo, permite revisar e ignorar em 1 clique", () => {
  const { body, slot } = mountInlineComposer();
  let reviewed = 0;
  let ignored = 0;

  const first = pub.checkComposerAdvisory(
    { title: "Contato", body: "Contato: teste@exemplo.org" },
    slot,
    { onReview: () => { reviewed += 1; }, onIgnore: () => { ignored += 1; } }
  );
  assert.equal(first.proceed, false);
  assert.equal(first.blocksPublish, false);
  assert.equal(slot.hidden, false);
  assert.ok(slot.innerHTML.includes('role="status"'));
  assert.ok(slot.innerHTML.includes("Ignorar e publicar assim mesmo"));

  click(slot.querySelector('[data-advisory-action="review"]'));
  assert.equal(reviewed, 1);
  assert.equal(slot.hidden, true);
  assert.equal(doc.activeElement, body);

  pub.checkComposerAdvisory(
    { title: "Link", body: "Confira https://bit.ly/reuniao-hoje" },
    slot,
    { onIgnore: () => { ignored += 1; } }
  );
  click(slot.querySelector('[data-advisory-action="publish-anyway"]'));
  assert.equal(ignored, 1);
  assert.equal(slot.getAttribute("data-advisory-dismissed"), "1");

  const afterIgnore = pub.checkComposerAdvisory({ title: "Link", body: "Confira https://bit.ly/reuniao-hoje" }, slot);
  assert.equal(afterIgnore.proceed, true);
  assert.equal(afterIgnore.dismissed, true);
  assert.equal(slot.getAttribute("data-advisory-dismissed"), null);
});

test("executeInlinePublish — exibe aviso consultivo com dado pessoal e publica em 1 clique ao ignorar", async () => {
  await cacheNode.clearLocalPosts();
  const { form, body, slot } = mountInlineComposer({ withSlot: true, slotByAttr: true });
  const published = [];
  body.value = "Fale comigo em pessoa@exemplo.org ou https://bit.ly/grupo";

  await pub.executeInlinePublish(form, (s) => published.push(s), { cleanupRecordingState() {} });
  assert.equal(published.length, 0, "mostra banner antes de publicar na primeira tentativa");
  assert.equal(slot.hidden, false);
  assert.ok(slot.querySelector('[data-advisory-action="publish-anyway"]'));

  click(slot.querySelector('[data-advisory-action="publish-anyway"]'));
  await settle();
  assert.equal(published.length, 1, "1 clique em ignorar libera publicação");
  assert.equal(slot.hidden, true);
  assert.ok(await cacheNode.getLocalPost(published[0].id));
});

test("executeInlinePublish — texto limpo e fluxo sem slot publicam direto sem aviso", async () => {
  await cacheNode.clearLocalPosts();
  const withSlot = mountInlineComposer({ withSlot: true });
  const published = [];
  withSlot.body.value = "Encontro comunitário na praça amanhã às 18h.";

  await pub.executeInlinePublish(withSlot.form, (s) => published.push(s), { cleanupRecordingState() {} });
  assert.equal(published.length, 1);
  assert.equal(withSlot.slot.hidden, true);

  const withoutSlot = mountInlineComposer({ withSlot: false });
  withoutSlot.body.value = "Telefone (11) 98765-4321 sem slot na página.";
  await pub.executeInlinePublish(withoutSlot.form, (s) => published.push(s), { cleanupRecordingState() {} });
  assert.equal(published.length, 2, "sem slot nunca impede publicação programática");
});

test("post-more-actions — toggleBlurPostFromMenu e refreshBlurLabel alternam borrão local sem rede", () => {
  localStorage.clear();
  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("Rede proibida em ação local de borrão");
  };

  try {
    assert.deepEqual(actions.toggleBlurPostFromMenu(""), { ok: false, blurred: false, localOnly: true });
    assert.equal(actions.applyLocalBlurStateToCard("inexistente", true), false);
    assert.doesNotThrow(() => actions.refreshBlurLabel(null, "p_blur_ui"));

    doc.body.replaceChildren();
    const card = mount(
      doc,
      `<article class="post" data-id="p_blur_ui"><p class="post-body">Conteúdo</p></article>`
    );

    const on = actions.toggleBlurPostFromMenu("p_blur_ui");
    assert.deepEqual(on, { ok: true, blurred: true, localOnly: true });
    assert.equal(moderation.isPostBlurredLocally("p_blur_ui"), true);
    assert.equal(card.classList.contains("is-locally-blurred"), true);
    assert.equal(card.getAttribute("data-locally-blurred"), "true");
    assert.equal(toasts.at(-1)?.text, "Post borrado/oculto só neste aparelho.");

    const off = actions.toggleBlurPostFromMenu("p_blur_ui");
    assert.deepEqual(off, { ok: true, blurred: false, localOnly: true });
    assert.equal(moderation.isPostBlurredLocally("p_blur_ui"), false);
    assert.equal(card.classList.contains("is-locally-blurred"), false);
    assert.equal(card.getAttribute("data-locally-blurred"), null);
    assert.equal(toasts.at(-1)?.text, "Borrão local removido deste aparelho.");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("post-more-menu — ação 1 toque Borrar/ocultar aqui e Mostrar novamente no sheet com 0 fetch", async () => {
  localStorage.clear();
  menu.attachPostMoreMenuHandlers();
  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("Rede proibida em borrão local do menu");
  };

  try {
    doc.body.replaceChildren();
    const card = mount(
      doc,
      `<article class="post">
        <p class="post-body">Texto para borrar localmente</p>
        <button class="btn-post-more-menu" data-post-id="p_sheet_blur" data-title="Post"></button>
      </article>`
    );
    const trigger = card.querySelector(".btn-post-more-menu");

    click(trigger);
    const sheet = doc.getElementById("post-more-sheet");
    const blurBtn = sheet.querySelector('[data-action="blur-post"]');
    assert.ok(blurBtn, "item Borrar/ocultar aqui presente no sheet");
    assert.equal(blurBtn.textContent, "Borrar/ocultar aqui");

    click(blurBtn);
    await settle();
    assert.equal(moderation.isPostBlurredLocally("p_sheet_blur"), true);
    assert.equal(card.classList.contains("is-locally-blurred"), true);
    assert.equal(card.getAttribute("data-locally-blurred"), "true");

    click(trigger);
    const unblurBtn = sheet.querySelector('[data-action="unblur-post"]');
    assert.ok(unblurBtn, "ao reabrir, ação muda para unblur-post");
    assert.equal(unblurBtn.textContent, "Mostrar novamente");

    click(unblurBtn);
    await settle();
    assert.equal(moderation.isPostBlurredLocally("p_sheet_blur"), false);
    assert.equal(card.classList.contains("is-locally-blurred"), false);
    assert.equal(card.getAttribute("data-locally-blurred"), null);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
