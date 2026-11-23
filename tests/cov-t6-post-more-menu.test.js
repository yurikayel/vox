/**
 * @file Cobertura T6: menu ⋯ da publicação (`app/post-more-menu.js`) sobre um DOM de mentira: abrir, fechar,
 * foco, cada ação do menu e os efeitos observáveis (hash, toast, clipboard, quarentena, modais).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const toasts = captureToasts(doc);
globalThis.location.origin = "https://vox.example";
globalThis.location.pathname = "/app/";
globalThis.location.href = "https://vox.example/app/";
const copied = [];
const shared = [];
Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { copied.push(t); } } });
Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async (d) => { shared.push(d); } });

const menu = await import("../client/js/app/post-more-menu.js");
const social = await import("../client/js/social.js");
const moderation = await import("../client/js/moderation.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
const sheet = () => doc.getElementById("post-more-sheet");
const lastToast = () => toasts.at(-1)?.text;
const POST = (id, extra = "") => `<article class="post"><p class="post-body"> Texto do post ${id} </p>
  <button class="btn-post-more-menu" data-post-id="${id}" data-author-route="vx_autor" data-title="Título ${id}" ${extra}></button></article>`;

async function pick(action) {
  click(sheet().querySelector(`[data-action="${action}"]`));
  await settle();
}

function openFrom(id, extra = "") {
  const btn = mount(doc, POST(id, extra)).querySelector(".btn-post-more-menu");
  click(btn);
  return btn;
}

test("abrir sem postId não cria a folha; com postId cria fechada por padrão e abre com foco no 1º item", () => {
  menu.openPostMoreMenu({});
  assert.equal(sheet(), null);
  menu.attachPostMoreMenuHandlers();
  menu.attachPostMoreMenuHandlers();
  const btn = openFrom("m1");
  const el = sheet();
  assert.ok(el.classList.contains("is-open"));
  assert.equal(el.hidden, false);
  assert.equal(el.getAttribute("aria-hidden"), "false");
  assert.ok(doc.body.classList.contains("post-more-sheet-open"));
  assert.equal(doc.activeElement.dataset.action, "report", "foco no primeiro item");
  assert.equal(el.getAttribute("role"), "dialog");
  assert.notEqual(btn, null);
});

test("itens extras: Apoiar só com Pix, Marcar só em post próprio com imagem, rótulo de salvar", () => {
  click(sheet().querySelector('[data-action="cancel"]'));
  openFrom("m2");
  assert.equal(sheet().querySelector('[data-action="zap"]').hidden, true);
  assert.equal(sheet().querySelector('[data-action="tag"]').hidden, true);
  assert.equal(sheet().querySelector('[data-action="save"]').textContent, "Salvar");
  click(sheet().querySelector('[data-action="cancel"]'));
  openFrom("m2b", 'data-pix="chave@pix" data-is-own="1" data-has-image="1"');
  assert.equal(sheet().querySelector('[data-action="zap"]').hidden, false);
  assert.equal(sheet().querySelector('[data-action="tag"]').hidden, false);
});

test("fechar: Cancelar, fundo e Escape; devolve o foco ao botão que abriu", () => {
  click(sheet().querySelector('[data-action="cancel"]'));
  assert.equal(sheet().hidden, true);
  assert.equal(sheet().getAttribute("aria-hidden"), "true");
  assert.equal(doc.body.classList.contains("post-more-sheet-open"), false);
  const btn = openFrom("m3");
  click(sheet());
  assert.equal(sheet().classList.contains("is-open"), false);
  assert.equal(doc.activeElement, btn, "o foco volta a quem abriu");
  openFrom("m3");
  doc.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(sheet().classList.contains("is-open"), false);
  doc.dispatchEvent({ type: "keydown", key: "Escape" });
  menu.closePostMoreMenu();
  assert.equal(sheet().hidden, true, "fechar de novo é inofensivo");
});

test("cliques com a folha fechada ou em área sem item não fazem nada", () => {
  const stray = click(doc.body);
  assert.equal(stray.defaultPrevented, false);
  openFrom("m4");
  const panel = click(sheet().querySelector(".post-more-sheet-panel"));
  assert.equal(panel.defaultPrevented, false);
  assert.ok(sheet().classList.contains("is-open"));
  menu.closePostMoreMenu();
});

test("ouvir: o texto lido sai do botão, do botão de copiar ou do corpo do cartão", async () => {
  const spoken = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel() {} };
  const withDataset = mount(doc, `<article class="post"><button class="btn-post-more-menu" data-post-id="m5" data-body="Corpo no botão"></button></article>`);
  click(withDataset.querySelector(".btn-post-more-menu"));
  await pick("listen");
  const withCopy = mount(doc, `<article class="post"><button class="btn-copy-md" data-body="Corpo do copiar"></button><button class="btn-post-more-menu" data-post-id="m5b"></button></article>`);
  click(withCopy.querySelector(".btn-post-more-menu"));
  await pick("listen");
  openFrom("m5c");
  await pick("listen");
  assert.deepEqual(spoken, ["Corpo no botão", "Corpo do copiar", "Título m5c. Texto do post m5c"]);
  assert.equal(lastToast(), "Lendo publicação em voz alta…");
  openFrom("m5c");
  assert.equal(sheet().querySelector('[data-action="listen"]').textContent, "Parar leitura");
  await pick("listen");
  assert.equal(lastToast(), "Leitura interrompida.");
  click(mount(doc, `<button class="btn-post-more-menu" data-post-id="m5d"></button>`));
  await pick("listen");
  assert.equal(lastToast(), "Publicação sem texto para leitura.");
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  openFrom("m5e");
  await pick("listen");
  assert.equal(lastToast(), "Leitura em voz alta não suportada neste aparelho.");
});

test("Salvar alterna o post nos salvos e avisa; o rótulo seguinte vira Remover", async () => {
  openFrom("m6");
  await pick("save");
  assert.equal(social.isSaved("m6"), true);
  assert.equal(lastToast(), "Post salvo neste aparelho.");
  assert.equal(sheet().hidden, true, "escolher uma ação fecha a folha");
  openFrom("m6");
  assert.equal(sheet().querySelector('[data-action="save"]').textContent, "Remover dos salvos");
  await pick("save");
  assert.equal(social.isSaved("m6"), false);
  assert.equal(lastToast(), "Post removido dos salvos.");
});

test("navegação: Ir para a publicação e Sobre esta conta mudam o hash, com escape", async () => {
  openFrom("m/7");
  await pick("goto-post");
  assert.equal(globalThis.location.hash, "#/t/m%2F7");
  openFrom("m7b");
  await pick("about-account");
  assert.equal(globalThis.location.hash, "#/u/vx_autor");
  const noAuthor = mount(doc, `<button class="btn-post-more-menu" data-post-id="m7c"></button>`);
  globalThis.location.hash = "#/antes";
  click(noAuthor);
  await pick("about-account");
  assert.equal(globalThis.location.hash, "#/antes", "sem rota de autor não navega");
});

test("copiar link usa o endereço da página; falha da área de transferência avisa erro", async () => {
  openFrom("m8");
  await pick("copy-link");
  assert.deepEqual(copied, ["https://vox.example/app/#/t/m8"]);
  assert.equal(lastToast(), "Link copiado!");
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("negado"); } } });
  openFrom("m8b");
  await pick("copy-link");
  assert.deepEqual([lastToast(), toasts.at(-1).type], ["Não foi possível copiar o link.", "error"]);
});

test("compartilhar entrega o link do tópico ao Web Share; QR abre a folha com o endereço", async () => {
  openFrom("m9");
  await pick("share");
  assert.equal(shared.length, 1);
  assert.match(shared[0].url, /#\/t\/m9$/);
  assert.match(shared[0].title, /Título m9/);
  openFrom("m9b");
  await pick("qr");
  const qr = doc.getElementById("qr-url-sheet");
  assert.ok(qr.classList.contains("is-open"));
  assert.match(qr.querySelector(".qr-url-href").textContent, /#\/t\/m9b$/);
});

test("post em quarentena: compartilhar e QR avisam em vez de espalhar", async () => {
  moderation.quarantinePost("m10");
  const sharedBefore = shared.length;
  openFrom("m10");
  await pick("share");
  assert.equal(lastToast(), moderation.QUARANTINE_HINT);
  openFrom("m10");
  await pick("qr");
  assert.equal(lastToast(), moderation.QUARANTINE_HINT);
  assert.equal(shared.length, sharedBefore, "nada foi compartilhado");
});

test("Marcar pessoas entra no modo de marcar; Apoiar abre o modal Pix; textos de aviso", async () => {
  openFrom("m11", 'data-is-own="1" data-has-image="1" data-pix="pix@vox.org"');
  await pick("tag");
  assert.ok(doc.body.classList.contains("photo-tagging"));
  openFrom("m11b", 'data-pix="pix@vox.org"');
  await pick("zap");
  assert.ok(doc.getElementById("zap-modal-container").querySelector("#zap-modal-overlay"), "o modal Pix entrou no DOM");
  assert.match(doc.getElementById("zap-modal-container").textContent, /Título m11b/);
  openFrom("m11c");
  await pick("not-interested");
  assert.equal(lastToast(), "Mostraremos menos publicações como esta.");
  openFrom("m11d");
  await pick("embed");
  assert.equal(lastToast(), "Incorporar — em breve.");
});

test("Denunciar abre o formulário de denúncia do post", async () => {
  openFrom("m12");
  await pick("report");
  const form = doc.getElementById("form-report");
  assert.ok(form, "o formulário de denúncia está no DOM");
  assert.match(doc.getElementById("report-title").textContent, /Denunciar publicação/);
});

test("Republicar cria a republicação, avisa e volta ao início", async () => {
  globalThis.location.hash = "#/t/m13";
  openFrom("m13");
  click(sheet().querySelector('[data-action="repost"]'));
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(lastToast(), "Republicado (sem impulsionar).");
  assert.equal(globalThis.location.hash, "#/");
  openFrom("m13");
  assert.equal(sheet().querySelector('[data-action="repost"]').textContent, "Desfazer republicação");
});

test("Pedir mediação sem moderação conhecida avisa e não navega", async () => {
  globalThis.location.hash = "#/inicio";
  openFrom("m14");
  await pick("mediation");
  assert.equal(lastToast(), "Esta publicação não tem moderação conhecida no seu aparelho.");
  assert.equal(globalThis.location.hash, "#/inicio");
});
