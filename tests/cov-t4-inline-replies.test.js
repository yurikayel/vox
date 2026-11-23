/**
 * @file Cobertura de `app/compose-inline-replies.js` (lote T4): painéis de comentário, respostas inline e aninhadas.
 *
 * Painéis e artigos são `FakeEl` com consultas programadas; cache, identidade e render são reais.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";

globalThis.fetch = async () => { throw new Error("offline"); };

const ir = await import("../client/js/app/compose-inline-replies.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");
const mock = await import("../client/js/mock.js");

/**
 * Cria artigo com botão de comentar, contadores e painel de comentários.
 * @param {string} [topic] Id do tópico no painel.
 * @returns {{ article: FakeEl, btn: FakeEl, panel: FakeEl, counts: FakeEl[], slot: FakeEl, input: FakeEl }} Peças.
 */
function makeArticle(topic = "top_x") {
  const article = new FakeEl("", { tag: "ARTICLE" });
  const btn = new FakeEl("", { classes: ["btn-comment"] }).stubClosest("article", article);
  const counts = [new FakeEl(), new FakeEl()];
  const slot = new FakeEl();
  const input = new FakeEl("", { tag: "TEXTAREA" });
  const panel = new FakeEl("", { dataset: { topic, comm: "geral" } }).stubClosest("article", article);
  panel.hidden = true;
  panel.stub(".post-comments-feed", slot).stub(".post-comment-input", input);
  article.stub(".post-comments", panel).stub(".count-replies", counts).stub(".btn-comment", [btn]);
  btn.stub(".count-replies", counts[0]);
  return { article, btn, panel, counts, slot, input };
}

test("inline-replies — setCommentOpen sincroniza hidden, classe, aria-expanded e botão ativo", () => {
  const { btn, panel } = makeArticle();
  ir.setCommentOpen(btn, panel, true);
  assert.deepEqual([panel.hidden, panel.classList.contains("is-open"), btn.getAttribute("aria-expanded"), btn.classList.contains("active")], [false, true, "true", true]);
  ir.setCommentOpen(btn, panel, false);
  assert.deepEqual([panel.hidden, panel.classList.contains("is-open"), btn.getAttribute("aria-expanded"), btn.classList.contains("active")], [true, false, "false", false]);
});

test("inline-replies — closeOtherCommentPanels fecha só os outros painéis abertos", () => {
  const dom = installFakeDocument();
  const a = makeArticle("a");
  const b = makeArticle("b");
  ir.setCommentOpen(a.btn, a.panel, true);
  ir.setCommentOpen(b.btn, b.panel, true);
  const orphan = new FakeEl("", { classes: ["is-open"] });
  dom.doc.stub(".post-comments.is-open", [a.panel, b.panel, orphan]);
  ir.closeOtherCommentPanels(a.panel);
  assert.equal(a.panel.hidden, false, "o mantido continua aberto");
  assert.equal(b.panel.hidden, true);
  assert.equal(b.btn.getAttribute("aria-expanded"), "false");
  dom.restore();
});

test("inline-replies — loadInlineReplies une locais (marcando as próprias) e demo sem duplicar ids", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Duda");
  const me = await localAccount.getRouteId();
  const demoIds = mock.mockReplies("top_demo").items.map((r) => r.id);
  await cacheNode.saveLocalPost({ id: "r_mine", type: "reply", replyTo: "top_demo", author: me, body: "minha" });
  await cacheNode.saveLocalPost({ id: "r_other", type: "reply", replyTo: "top_demo", author: "vx_outro", authorDisplay: "Eli", body: "dele" });
  const out = await ir.loadInlineReplies("top_demo");
  const mine = out.find((r) => r.id === "r_mine");
  assert.equal(mine.isOwnLocalPost, true);
  assert.equal(mine.authorDisplay, "Duda");
  assert.equal(mine.isLocalP2p, true);
  const other = out.find((r) => r.id === "r_other");
  assert.equal(other.isOwnLocalPost, false);
  assert.equal(other.authorDisplay, "Eli");
  assert.equal(out.length, 2 + demoIds.length);
  assert.equal(new Set(out.map((r) => r.id)).size, out.length);
  localAccount.wipeLocalAccount();
});

test("inline-replies — togglePostComments abre, carrega uma vez, atualiza contadores e fecha", async () => {
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "r_a", type: "reply", replyTo: "top_t", author: "vx_a", body: "um" });
  const dom = installFakeDocument();
  const { btn, panel, counts, slot, input } = makeArticle("top_t");
  const expected = 1 + mock.mockReplies("top_t").items.length;
  await ir.togglePostComments(btn);
  assert.equal(panel.hidden, false);
  assert.equal(panel.dataset.loaded, "1");
  assert.equal(slot.outerHTML.includes("um"), true, "feed substituído pelo HTML das respostas");
  assert.deepEqual(counts.map((c) => c.textContent), [String(expected), String(expected)]);
  assert.equal(input.focusCalls, 1);
  await ir.togglePostComments(btn);
  assert.equal(panel.hidden, true, "segundo clique fecha");
  await ir.togglePostComments(btn);
  assert.equal(panel.hidden, false);
  assert.equal(input.focusCalls, 2, "já carregado: só foca");
  dom.restore();
});

test("inline-replies — togglePostComments ignora botão sem painel", async () => {
  const article = new FakeEl("", { tag: "ARTICLE" });
  const btn = new FakeEl().stubClosest("article", article);
  assert.equal(await ir.togglePostComments(btn), undefined);
  assert.equal(await ir.togglePostComments(new FakeEl()), undefined);
});

test("inline-replies — appendInlineReply cria a lista quando falta e insere o item renderizado", () => {
  const { panel, slot } = makeArticle();
  const list = new FakeEl();
  const empty = new FakeEl();
  panel.stub(".post-comments-empty", empty);
  let created = false;
  panel.querySelector = (sel) => {
    if (sel === ".post-comment-list") return created ? list : null;
    return FakeEl.prototype.querySelector.call(panel, sel);
  };
  Object.defineProperty(slot, "innerHTML", { set(v) { created = v.includes("post-comment-list"); }, get: () => "" });
  ir.appendInlineReply(panel, { id: "r1", body: "oi", author: "vx_a" });
  assert.equal(created, true);
  assert.equal(empty.removed, true, "aviso de vazio removido");
  assert.equal(list.inserted.length, 1);
  assert.ok(list.inserted[0].includes("oi"));
});

test("inline-replies — resposta aninhada entra sob o pai; sem pai no DOM vira resposta de topo", () => {
  const { panel } = makeArticle();
  const nested = new FakeEl();
  const body = new FakeEl();
  const parent = new FakeEl().stub(":scope > .post-comment-body > .post-comment-nested-list", nested).stub(".post-comment-body", body);
  panel.stub('[data-comment-id="p1"]', parent);
  ir.appendInlineReply(panel, { id: "r2", parentId: "p1", body: "filha", author: "vx_a" });
  assert.equal(nested.inserted.length, 1);
  assert.ok(nested.inserted[0].includes("filha"));
  const top = new FakeEl();
  panel.stub(".post-comment-list", top);
  ir.appendNestedInlineReply(panel, "sumiu", { id: "r3", parentId: "sumiu", body: "órfã", author: "vx_a" });
  assert.equal(top.inserted.length, 1, "pai ausente: cai na lista de topo");
  const fresh = new FakeEl();
  const noList = new FakeEl().stub(".post-comment-body", fresh);
  panel.stub('[data-comment-id="p2"]', noList);
  ir.appendNestedInlineReply(panel, "p2", { id: "r4", body: "x", author: "vx_a" });
  assert.deepEqual(fresh.inserted, ['<ul class="post-comment-nested-list"></ul>']);
});

test("inline-replies — toggleCommentReplyComposer mostra, foca com cursor no fim e esconde", () => {
  const ta = new FakeEl("", { tag: "TEXTAREA", value: "rascunho" });
  const form = new FakeEl().stub("textarea", ta);
  const item = new FakeEl().stub(".post-comment-nested-reply", form);
  ir.toggleCommentReplyComposer(item, true);
  assert.equal(form.hidden, false);
  assert.equal(ta.focusCalls, 1);
  assert.deepEqual(ta.selection, [8, 8]);
  ir.toggleCommentReplyComposer(item, false);
  assert.equal(form.hidden, true);
  assert.equal(ir.toggleCommentReplyComposer(null, true), undefined);
  assert.equal(ir.toggleCommentReplyComposer(new FakeEl(), true), undefined);
});

test("inline-replies — bumpReplyCount soma 1 e ajusta o rótulo; sem artigo não faz nada", () => {
  const { article, btn, counts } = makeArticle();
  counts[0].textContent = "2";
  counts[1].textContent = "";
  ir.bumpReplyCount(article);
  assert.deepEqual(counts.map((c) => c.textContent), ["3", "1"]);
  assert.equal(btn.getAttribute("aria-label"), "Comentar, 3 comentários");
  assert.equal(ir.bumpReplyCount(null), undefined);
});

/**
 * Monta formulário de resposta (topo ou aninhada) dentro de painel e artigo.
 * @param {string} inputSel Seletor do campo de texto.
 * @param {string} btnSel Seletor do botão de envio.
 * @param {string} [value] Texto digitado.
 * @returns {object} Peças do formulário.
 */
function makeForm(inputSel, btnSel, value = "  oi  ") {
  const base = makeArticle("top_f");
  const input = new FakeEl("", { tag: "TEXTAREA", value });
  const sendBtn = new FakeEl("", { tag: "BUTTON" });
  const list = new FakeEl();
  base.panel.stub(".post-comment-list", list);
  const item = new FakeEl();
  const form = new FakeEl("", { dataset: { topic: "top_f", comm: "geral", parent: "pai" } });
  form.stub(inputSel, input).stub(btnSel, sendBtn)
    .stubClosest(".post-comments", base.panel).stubClosest("article", base.article).stubClosest(".post-comment-item", item);
  return { ...base, form, input, sendBtn, list, item };
}

test("inline-replies — onInlineReplySubmit grava, mostra no painel, soma contador e restaura o botão", async () => {
  await cacheNode.clearLocalPosts();
  const f = makeForm(".post-comment-input", ".btn-inline-reply");
  await ir.onInlineReplySubmit(f.form);
  const saved = await cacheNode.getLocalPosts({ type: "reply", replyTo: "top_f" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body, "oi");
  assert.equal(f.list.inserted.length, 1);
  assert.equal(f.counts[1].textContent, "1");
  assert.equal(f.form.resetCalls, 1);
  assert.equal(f.panel.dataset.loaded, "1");
  assert.deepEqual([f.sendBtn.disabled, f.sendBtn.textContent], [false, "Responder"]);
  const blank = makeForm(".post-comment-input", ".btn-inline-reply", "   ");
  await ir.onInlineReplySubmit(blank.form);
  assert.equal((await cacheNode.getLocalPosts({ type: "reply", replyTo: "top_f" })).length, 1, "texto vazio não grava");
});

test("inline-replies — onNestedCommentReplySubmit grava com pai, fecha o compositor e restaura o botão", async () => {
  await cacheNode.clearLocalPosts();
  const f = makeForm(".post-comment-nested-input", ".btn-comment-nested-send");
  const nestedForm = new FakeEl().stub("textarea", f.input);
  f.item.stub(".post-comment-nested-reply", nestedForm);
  await ir.onNestedCommentReplySubmit(f.form);
  const saved = await cacheNode.getLocalPosts({ type: "reply", replyTo: "top_f" });
  assert.equal(saved[0].parentId, "pai");
  assert.equal(nestedForm.hidden, true, "compositor aninhado recolhido");
  assert.equal(f.form.resetCalls, 1);
  assert.deepEqual([f.sendBtn.disabled, f.sendBtn.textContent], [false, "Enviar"]);
  const blank = makeForm(".post-comment-nested-input", ".btn-comment-nested-send", "");
  assert.equal(await ir.onNestedCommentReplySubmit(blank.form), undefined);
});

test("inline-replies — falha ao assinar não insere nada e devolve o botão", async () => {
  await cacheNode.clearLocalPosts();
  const f = makeForm(".post-comment-input", ".btn-inline-reply");
  const subtle = globalThis.crypto.subtle;
  const realSign = subtle.sign;
  subtle.sign = async () => { throw new Error("sem chave"); };
  try {
    await ir.onInlineReplySubmit(f.form);
    const n = makeForm(".post-comment-nested-input", ".btn-comment-nested-send");
    await ir.onNestedCommentReplySubmit(n.form);
    assert.equal(n.list.inserted.length, 0);
    assert.deepEqual([n.sendBtn.disabled, n.sendBtn.textContent], [false, "Enviar"]);
  } finally {
    subtle.sign = realSign;
  }
  assert.equal(f.list.inserted.length, 0);
  assert.equal(f.form.resetCalls, 0);
  assert.deepEqual([f.sendBtn.disabled, f.sendBtn.textContent], [false, "Responder"]);
});
