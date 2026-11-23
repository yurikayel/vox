/**
 * @file Cobertura de `app/inline-composer-publish.js` (lote T4): payload, toasts, persistência e submit do compositor inline.
 *
 * Usa identidade, cache (IndexedDB de mentira) e blobs reais; os toasts são lidos pelo
 * `captureToasts` do helper e o resultado da publicação pelo cache local.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument, captureToasts } from "./helpers/cov-t4-dom.mjs";

const pub = await import("../client/js/app/inline-composer-publish.js");
const st = await import("../client/js/app/inline-composer-state.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");
const permanence = await import("../client/js/permanence-notice.js");
const photoTags = await import("../client/js/photo-tags.js");

const IMG = "data:image/webp;base64,QUJDREVGRw==";

/**
 * Monta o documento falso do compositor com campos de texto, comunidade e botões de envio.
 * @returns {{ dom: object, el: Record<string, FakeEl> }} Documento e elementos por id.
 */
function mountComposer() {
  const dom = installFakeDocument();
  const el = {};
  for (const id of ["inline-topic-body", "inline-topic-comm", "btn-inline-submit", "btn-inline-echo", "feed-inline-composer", "form-inline-topic"]) {
    el[id] = new FakeEl(id);
    dom.add(el[id]);
  }
  st.clearMedia();
  return { dom, el };
}

test("inline-publish — mídia ativa entra no payload conforme o tipo, sem tags quando não há", () => {
  const dom = installFakeDocument();
  st.clearMedia();
  const empty = {};
  pub.attachComposerMediaToPayload(empty);
  assert.deepEqual(empty, {}, "sem mídia, payload intacto");
  st.setComposerMedia({ type: "image", dataUrl: IMG, byteLength: 7 });
  const img = { title: "Praça" };
  pub.attachComposerMediaToPayload(img);
  assert.deepEqual(img, { title: "Praça", image: IMG, imageAlt: "Praça", aspectRatio: "original" });
  st.setComposerImageDataUrl("data:image/webp;base64,Wg==");
  st.setComposerAspectRatio("1:1");
  st.setComposerPhotoTags([{ id: "p1" }]);
  const tagged = {};
  pub.attachComposerMediaToPayload(tagged);
  assert.deepEqual(tagged, { image: "data:image/webp;base64,Wg==", imageAlt: "Foto", aspectRatio: "1:1", photoTags: [{ id: "p1" }] });
  st.setComposerMedia({ type: "audio", dataUrl: "data:audio/x", byteLength: 1 });
  const audio = {};
  pub.attachComposerMediaToPayload(audio);
  assert.deepEqual(audio, { audio: "data:audio/x" });
  st.setComposerMedia({ type: "video", dataUrl: "data:video/x", byteLength: 1 });
  const video = {};
  pub.attachComposerMediaToPayload(video);
  assert.deepEqual(video, { video: "data:video/x" });
  st.clearMedia();
  dom.restore();
});

test("inline-publish — buildInlineTopicPayload usa nome e avatar do perfil e valores vazios por padrão", async () => {
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Alice");
  localAccount.setProfileEnrichment({ displayName: "Alice", avatarUrl: "https://example.com/a.png" });
  const p = pub.buildInlineTopicPayload({ title: "T", body: "B", commSlug: "geral" });
  assert.match(p.id, /^top_/);
  assert.equal(p.type, "topic");
  assert.equal(p.communityId, "geral");
  assert.equal(p.authorDisplay, "Alice");
  assert.equal(p.authorAvatar, "https://example.com/a.png");
  const blank = pub.buildInlineTopicPayload({ commSlug: "x" });
  assert.equal(blank.title, "");
  assert.equal(blank.body, "");
  localAccount.wipeLocalAccount();
});

test("inline-publish — showPublishToast descreve cada resultado da Permaweb", () => {
  const dom = installFakeDocument();
  const toasts = captureToasts(dom);
  try {
    pub.showPublishToast({ success: true, via: "turbo" });
    pub.showPublishToast({ success: true, via: "ar" });
    pub.showPublishToast({ success: false, skipped: permanence.CHOICE_MESH });
    pub.showPublishToast({ success: false, skipped: "arweave-disabled" });
    pub.showPublishToast(null);
    assert.deepEqual(toasts.list().map((t) => t.text), [
      "Post publicado no P2P e gravado na Permaweb (Turbo ⚡)!",
      "Post publicado no P2P e gravado na Permaweb (Arweave)!",
      "Post publicado só na malha P2P (não permanente).",
      "Post publicado na rede de seguidores!",
      "Post publicado na rede P2P!",
    ]);
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("inline-publish — updateSubmitButtonsState desabilita e troca o rótulo dos dois botões", () => {
  const { dom, el } = mountComposer();
  pub.updateSubmitButtonsState(true);
  assert.deepEqual([el["btn-inline-submit"].disabled, el["btn-inline-submit"].textContent], [true, "Publicando…"]);
  assert.equal(el["btn-inline-echo"].textContent, "Publicando…");
  pub.updateSubmitButtonsState(false);
  assert.deepEqual([el["btn-inline-submit"].disabled, el["btn-inline-submit"].textContent], [false, "Postar"]);
  assert.equal(el["btn-inline-echo"].textContent, "🚀 Postar & Ecoar");
  dom.restore();
});

test("inline-publish — broadcastAndPersistInlineTopic assina, guarda o post com a mídia local e as tags", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  st.setComposerMedia({ type: "image", dataUrl: IMG, byteLength: 9 });
  st.setComposerPhotoTags([{ targetId: "u1", x: 10, y: 20, label: "Ana" }]);
  const payload = pub.buildInlineTopicPayload({ title: "Foto", body: "Corpo", commSlug: "geral" });
  const dom = installFakeDocument();
  const { signed, permaResult } = await pub.broadcastAndPersistInlineTopic(payload, "Foto", "Corpo", "geral");
  assert.deepEqual(permaResult, { success: false, skipped: "arweave-disabled" }, "upload Arweave desligado por padrão");
  assert.deepEqual(photoTags.getLocalTags(signed.id).map((t) => t.targetId), ["u1"], "tags da foto guardadas no aparelho");
  assert.equal(signed.id, payload.id);
  assert.ok(signed.sig && signed.pubKey, "post assinado");
  assert.equal(signed.image, null, "mídia sai do post assinado");
  assert.ok(signed.mediaHash);
  const saved = await cacheNode.getLocalPost(payload.id);
  assert.equal(saved.mediaHash, signed.mediaHash);
  assert.equal(saved.image, IMG, "cache local recompõe a mídia");
  st.clearMedia();
  dom.restore();
  localAccount.wipeLocalAccount();
});

test("inline-publish — executeInlinePublish ignora envio vazio e publica texto com reset e callback", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, el } = mountComposer();
  const toasts = captureToasts(dom);
  try {
    const form = new FakeEl("form");
    const published = [];
    await pub.executeInlinePublish(form, (s) => published.push(s), { cleanupRecordingState() {} });
    assert.equal(published.length, 0, "sem texto nem mídia não publica");
    el["inline-topic-body"].value = "  Olá vizinhança  ";
    el["inline-topic-comm"].value = " Geral ";
    await pub.executeInlinePublish(form, (s) => published.push(s), { cleanupRecordingState() {} });
    assert.equal(published.length, 1);
    assert.equal(published[0].communityId, "geral");
    assert.ok(published[0].body.includes("Olá vizinhança"));
    assert.equal(form.resetCalls, 1);
    assert.equal(el["feed-inline-composer"].classList.contains("is-collapsed"), true);
    assert.equal(toasts.list().at(-1).text, "Post publicado na rede de seguidores!");
    assert.ok(await cacheNode.getLocalPost(published[0].id), "post persistido");
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("inline-publish — mídia sozinha basta para publicar", async () => {
  await cacheNode.clearLocalPosts();
  const { dom } = mountComposer();
  st.setComposerMedia({ type: "audio", dataUrl: "data:audio/webm;base64,QUJD", byteLength: 3 });
  const out = [];
  await pub.executeInlinePublish(new FakeEl(), (s) => out.push(s), { cleanupRecordingState() {} });
  assert.equal(out.length, 1);
  assert.equal(out[0].audio, "data:audio/webm;base64,QUJD");
  assert.equal(st.inlineComposerMedia.type, "", "mídia limpa após publicar");
  dom.restore();
});

test("inline-publish — enviar mostra erro quando o callback falha e libera os botões; segundo envio simultâneo é ignorado", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, el } = mountComposer();
  const toasts = captureToasts(dom);
  try {
    const form = new FakeEl("form");
    el["btn-inline-echo"].addEventListener("click", () => {});
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let calls = 0;
    pub.bindFormSubmit(form, async () => { calls++; await gate; throw new Error("falha no callback"); }, { cleanupRecordingState() {} });
    el["inline-topic-body"].value = "texto";
    let prevented = 0;
    const ev = { preventDefault: () => prevented++ };
    const first = form.fire("submit", ev);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(el["btn-inline-submit"].disabled, true, "botões travados durante o envio");
    await form.fire("submit", ev);
    release();
    await first;
    assert.equal(prevented, 2);
    assert.equal(calls, 1, "o segundo envio não chega ao callback");
    assert.equal(toasts.list().at(-1).text, "Erro ao publicar: falha no callback");
    assert.equal(toasts.list().at(-1).type, "error");
    assert.equal(el["btn-inline-submit"].disabled, false);
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("inline-publish — Postar & Ecoar abre a folha de ecoar depois de publicar", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, el } = mountComposer();
  const form = new FakeEl("form");
  const out = [];
  pub.bindFormSubmit(form, (s) => out.push(s), { cleanupRecordingState() {} });
  el["inline-topic-body"].value = "ecoar isto";
  await el["btn-inline-echo"].fire("click");
  dom.doc.body.classList = new FakeEl().classList;
  await form.fire("submit", { preventDefault() {} });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "topic");
  assert.equal(dom.doc.body.classList.contains("post-more-sheet-open"), true, "folha de ecoar aberta");
  assert.equal(el["btn-inline-submit"].disabled, false);
  dom.restore();
});
