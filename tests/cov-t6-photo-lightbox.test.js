/**
 * @file Cobertura T6: lightbox de mídia do post, sheet de escolha de pessoa e modo marcar em foto
 * (`app/post-media-lightbox.js`, `app/photo-tag-picker.js`, `app/photo-tag-ui.js`) sobre um DOM de mentira.
 */
import "./setup.js";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const toasts = captureToasts(doc);
const lightbox = await import("../client/js/app/post-media-lightbox.js");
const picker = await import("../client/js/app/photo-tag-picker.js");
const tagUi = await import("../client/js/app/photo-tag-ui.js");
const photoTags = await import("../client/js/photo-tags.js");
const contacts = await import("../client/js/contacts.js");

const LIGHTBOX = `<div id="post-media-lightbox" hidden><button class="post-lightbox-close"></button><img class="post-lightbox-img"></div>`;
const GALLERY = `<div class="feed">
  <img class="post-media-hero-img" src="a.jpg" alt="Foto A">
  <div class="post-media-lightbox-trigger" data-media-src="b.jpg" data-media-alt="Foto B"></div>
  <img class="post-media-hero-img" src="c.jpg" alt="Foto C">
  <img class="post-media-hero-img" alt="sem src">
  <div class="post-ig-toolbar"><img class="post-media-hero-img" src="t.jpg"></div>
</div>`;

const key = (k) => doc.dispatchEvent({ type: "keydown", key: k });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("lightbox: abrir mostra a imagem, foca o fechar e ignora chamada sem src", () => {
  const lb = mount(doc, LIGHTBOX);
  mount(doc, GALLERY);
  lightbox.openPostMediaLightbox("", "x");
  assert.equal(lb.hidden, true, "sem src nada abre");
  lightbox.openPostMediaLightbox("a.jpg", "Foto A");
  assert.equal(lb.hidden, false);
  assert.equal(lb.querySelector(".post-lightbox-img").src, "a.jpg");
  assert.equal(lb.querySelector(".post-lightbox-img").alt, "Foto A");
  assert.ok(doc.body.classList.contains("post-lightbox-open"));
  assert.equal(doc.activeElement, lb.querySelector(".post-lightbox-close"));
});

test("lightbox: setas percorrem só gatilhos com src, em ciclo; Tab devolve o foco ao fechar", () => {
  const lb = doc.getElementById("post-media-lightbox");
  const img = lb.querySelector(".post-lightbox-img");
  key("ArrowRight");
  assert.equal(img.src, "b.jpg");
  assert.equal(img.alt, "Foto B");
  key("ArrowRight");
  assert.equal(img.src, "c.jpg");
  key("ArrowRight");
  assert.equal(img.src, "t.jpg", "o gatilho dentro da barra também conta como mídia");
  key("ArrowRight");
  assert.equal(img.src, "a.jpg", "volta ao primeiro");
  key("ArrowLeft");
  assert.equal(img.src, "t.jpg", "e anda para trás em ciclo");
  doc.activeElement = doc.body;
  key("Tab");
  assert.equal(doc.activeElement, lb.querySelector(".post-lightbox-close"));
});

test("lightbox: Escape fecha, limpa src, tira a classe e solta o teclado", () => {
  const lb = doc.getElementById("post-media-lightbox");
  const img = lb.querySelector(".post-lightbox-img");
  key("Escape");
  assert.equal(lb.hidden, true);
  assert.equal(img.hasAttribute("src"), false);
  assert.equal(doc.body.classList.contains("post-lightbox-open"), false);
  key("ArrowRight");
  assert.equal(img.hasAttribute("src"), false, "sem lightbox aberto a seta não faz nada");
});

test("lightbox: clique na mídia abre; barra, marcação e long-press não abrem", () => {
  lightbox.initPostMediaLightbox();
  const lb = doc.getElementById("post-media-lightbox");
  const [first] = doc.querySelectorAll(".post-media-hero-img");
  const inBar = doc.querySelector(".post-ig-toolbar .post-media-hero-img");
  click(inBar);
  assert.equal(lb.hidden, true, "clique na barra não abre");
  doc.body.classList.add("photo-tagging");
  click(first);
  assert.equal(lb.hidden, true, "em modo marcar o clique é da marcação");
  doc.body.classList.remove("photo-tagging");
  window.__justLongPressed = true;
  click(first);
  assert.equal(lb.hidden, true, "logo após long-press não abre");
  window.__justLongPressed = false;
  const ev = click(first);
  assert.equal(lb.hidden, false);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(lb.querySelector(".post-lightbox-img").alt, "Foto A");
});

test("lightbox: botão fechar e clique no fundo fecham; clique no conteúdo não", () => {
  const lb = doc.getElementById("post-media-lightbox");
  click(lb.querySelector(".post-lightbox-img"));
  assert.equal(lb.hidden, false, "clicar na imagem não fecha");
  click(lb.querySelector(".post-lightbox-close"));
  assert.equal(lb.hidden, true);
  lightbox.openPostMediaLightbox("c.jpg");
  click(lb);
  assert.equal(lb.hidden, true, "o fundo fecha");
  click(doc.body);
  assert.equal(lb.hidden, true, "clique fora de gatilho segue sem efeito");
});

test("lightbox: gatilho sem src é ignorado no clique", () => {
  const lb = doc.getElementById("post-media-lightbox");
  const empty = doc.querySelectorAll(".post-media-hero-img")[3];
  click(empty);
  assert.equal(lb.hidden, true);
});

test("seletor de pessoa: contatos viram botões e escolher um entrega a marca e fecha", () => {
  contacts.addContact("vx_amiga", "Amiga <b>");
  picker.attachPhotoTagPicker();
  picker.attachPhotoTagPicker();
  const picks = [];
  picker.openPhotoTagPicker("p1", 12, 34, (ctx) => picks.push(ctx));
  const sheet = doc.getElementById("photo-tag-picker");
  assert.ok(sheet.classList.contains("is-open") && !sheet.hidden);
  const item = sheet.querySelector(".photo-tag-pick-item");
  assert.equal(item.dataset.target, "vx_amiga");
  assert.equal(item.textContent, "Amiga <b>", "o rótulo é escapado e volta como texto");
  click(item);
  assert.equal(picks.length, 1);
  assert.deepEqual(
    [picks[0].postId, picks[0].x, picks[0].y, picks[0].targetId, picks[0].label],
    ["p1", 12, 34, "vx_amiga", "Amiga <b>"],
  );
  assert.equal(sheet.hidden, true);
  click(item);
  assert.equal(picks.length, 1, "com o sheet fechado o clique é ignorado");
});

test("seletor de pessoa: cancelar e clicar no fundo fecham sem entregar", () => {
  const picks = [];
  picker.openPhotoTagPicker("p1", 1, 2, (ctx) => picks.push(ctx));
  const sheet = doc.getElementById("photo-tag-picker");
  click(sheet.querySelector("[data-tag-pick-cancel]"));
  assert.equal(sheet.hidden, true);
  picker.openPhotoTagPicker("p1", 1, 2, (ctx) => picks.push(ctx));
  click(sheet);
  assert.equal(sheet.hidden, true);
  assert.deepEqual(picks, []);
});

test("seletor de pessoa: colar vx_, link de conexão, texto sem resultado e vazio", async () => {
  const picks = [];
  const form = () => doc.getElementById("photo-tag-paste-form");
  const submit = async (text) => {
    picker.openPhotoTagPicker("p2", 5, 6, (ctx) => picks.push(ctx));
    doc.getElementById("photo-tag-paste").value = text;
    form().dispatchEvent({ type: "submit", target: form() });
    await settle();
  };
  await submit("vx_colada123");
  await submit("https://x.org/#/connect/vx_viaLink");
  await submit("naoexiste_zzz");
  assert.deepEqual(picks.map((p) => [p.targetId, p.label]), [
    ["vx_colada123", "vx_colada123"],
    ["vx_viaLink", "vx_viaLink"],
    ["naoexiste_zzz", "naoexiste_zzz"],
  ]);
  await submit("   ");
  assert.equal(picks.length, 3, "colar vazio não marca ninguém");
  assert.equal(doc.getElementById("photo-tag-picker").classList.contains("is-open"), true);
});

const POST = `<article class="post" data-id="p9"><div class="post-ig-header"></div>
  <div class="post-media-hero"><img src="h.jpg"><div class="photo-tag-pins"></div></div>
  <button class="btn-photo-tag-vis" data-id="p9"></button><button class="btn-photo-tag" data-id="p9"></button></article>`;

test("marcar em foto: modo liga e desliga a classe do corpo e do quadro, com dica", () => {
  const post = mount(doc, POST);
  const hero = post.querySelector(".post-media-hero");
  const before = toasts.length;
  tagUi.beginTagMode("p9");
  assert.ok(doc.body.classList.contains("photo-tagging"));
  assert.ok(hero.classList.contains("photo-tag-mode"));
  assert.equal(toasts[before].text, photoTags.TAGS_HINT);
  tagUi.beginTagMode("");
  assert.equal(doc.body.classList.contains("photo-tagging"), false);
  assert.equal(hero.classList.contains("photo-tag-mode"), false);
});

test("marcar em foto: togglePins alterna a camada e devolve false quando não existe", () => {
  const pins = doc.querySelector(".photo-tag-pins");
  assert.equal(tagUi.togglePins("p9"), true);
  assert.equal(pins.hidden, true);
  tagUi.togglePins("p9");
  assert.equal(pins.hidden, false);
  assert.equal(tagUi.togglePins("nao-existe"), false);
});

test("marcar em foto: long-press em post de outra pessoa só avisa; no próprio entra no modo", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    tagUi.attachPhotoTagUi();
    tagUi.attachPhotoTagUi();
    const hero = doc.querySelector(".post-media-hero");
    const down = (target, extra = {}) => doc.dispatchEvent({ type: "pointerdown", target, clientX: 0, clientY: 0, ...extra });
    down(hero.querySelector("img"));
    mock.timers.tick(500);
    assert.equal(toasts.at(-1).text, "Apenas o autor pode marcar pessoas nesta foto.");
    assert.equal(doc.body.classList.contains("photo-tagging"), false);
    mock.timers.tick(400);
    assert.equal(window.__justLongPressed, false);
    doc.querySelector(".post").classList.add("post-is-own");
    down(hero.querySelector("img"));
    mock.timers.tick(500);
    assert.ok(doc.body.classList.contains("photo-tagging"));
    assert.equal(window.__justLongPressed, true);
    mock.timers.tick(400);
    tagUi.beginTagMode("");
  } finally {
    mock.timers.reset();
  }
});

test("marcar em foto: mover mais de 10px, soltar ou tocar na barra cancela o long-press", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const hero = doc.querySelector(".post-media-hero");
    const down = (target, extra = {}) => doc.dispatchEvent({ type: "pointerdown", target, clientX: 0, clientY: 0, ...extra });
    down(hero, { clientX: 5, clientY: 5 });
    doc.dispatchEvent({ type: "pointermove", clientX: 8, clientY: 9 });
    mock.timers.tick(499);
    doc.dispatchEvent({ type: "pointermove", clientX: 30, clientY: 5 });
    mock.timers.tick(10);
    assert.equal(doc.body.classList.contains("photo-tagging"), false, "movimento grande cancelou");
    down(hero);
    doc.dispatchEvent({ type: "pointerup" });
    mock.timers.tick(600);
    assert.equal(doc.body.classList.contains("photo-tagging"), false, "soltar cancelou");
    down(doc.querySelector(".post-ig-header"));
    down(hero, { button: 2 });
    mock.timers.tick(600);
    assert.equal(doc.body.classList.contains("photo-tagging"), false, "cabeçalho e botão direito não iniciam");
  } finally {
    mock.timers.reset();
  }
});

test("marcar em foto: botões Marcas e Marcar, e menu de contexto após long-press", () => {
  click(doc.querySelector(".btn-photo-tag-vis"));
  assert.equal(doc.querySelector(".photo-tag-pins").hidden, true);
  click(doc.querySelector(".btn-photo-tag-vis"));
  click(doc.querySelector(".btn-photo-tag"));
  assert.ok(doc.querySelector(".post-media-hero").classList.contains("photo-tag-mode"));
  window.__justLongPressed = true;
  const hero = doc.querySelector(".post-media-hero");
  const menu = hero.dispatchEvent({ type: "contextmenu", target: hero });
  assert.equal(menu.defaultPrevented, true);
  window.__justLongPressed = false;
});

test("marcar em foto: clicar na foto em modo marcar abre o seletor e a escolha grava a marca", async () => {
  const hero = doc.querySelector(".post-media-hero");
  hero.querySelector("img").rect = { left: 10, top: 20, width: 200, height: 100 };
  const header = click(doc.querySelector(".post-ig-header"));
  assert.equal(header.defaultPrevented, false, "cabeçalho não é alvo da marcação");
  const ev = click(hero.querySelector("img"), { clientX: 110, clientY: 70 });
  assert.equal(ev.defaultPrevented, true);
  const sheet = doc.getElementById("photo-tag-picker");
  assert.ok(sheet.classList.contains("is-open"));
  click(sheet.querySelector(".photo-tag-pick-item"));
  await settle();
  assert.deepEqual(photoTags.getLocalTags("p9"), [{ x: 50, y: 50, targetId: "vx_amiga", label: "Amiga <b>" }]);
  assert.equal(doc.body.classList.contains("photo-tagging"), false, "sai do modo depois de marcar");
  assert.equal(toasts.at(-1).text, "Marca guardada neste aparelho.");
});

test("marcar em foto: sem rect o ponto cai no centro; clique após long-press é engolido", () => {
  tagUi.beginTagMode("p9");
  const hero = doc.querySelector(".post-media-hero");
  hero.querySelector("img").rect = { left: 0, top: 0, width: 0, height: 0 };
  click(hero.querySelector("img"));
  const sheet = doc.getElementById("photo-tag-picker");
  assert.ok(sheet.classList.contains("is-open"));
  click(sheet.querySelector("[data-tag-pick-cancel]"));
  window.__justLongPressed = true;
  const ev = click(hero);
  assert.equal(ev.defaultPrevented, true);
  window.__justLongPressed = false;
  tagUi.beginTagMode("");
  const outside = click(doc.body);
  assert.equal(outside.defaultPrevented, false);
});
