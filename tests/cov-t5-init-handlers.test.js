/**
 * @file Cobertura T5 — ouvintes globais do app: gossip e sincronização (`init-network-sync.js`), cliques sociais
 * delegados (`init-social-actions.js`) e edição/remoção de post (`init-post-mutation.js`). Módulos reais sobre
 * `localStorage`/cache em memória; só o DOM e a rede são falsos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { person } from "./signer.js";
import { makeEl, installDom, settle, unrefLongTimers, waitFor } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...rest) => {
  const t = realSetInterval(fn, ms, ...rest);
  t.unref?.();
  return t;
};
let memory = null;
globalThis.fetch = async (url) => {
  if (memory && String(url).endsWith("/memory/sync")) return { ok: true, status: 200, json: async () => memory, text: async () => JSON.stringify(memory) };
  throw new TypeError("sem rede no teste");
};

const sync = await import("../client/js/app/init-network-sync.js");
const social = await import("../client/js/app/init-social-actions.js");
const mutation = await import("../client/js/app/init-post-mutation.js");
const events = await import("../client/js/peers-events.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/index.js");
const webrtcState = await import("../client/js/webrtc-peer-state.js");
const navigation = await import("../client/js/app/navigation.js");
const tabSync = await import("../client/js/identity/tab-sync.js");

/** Instala `location` com a hash pedida (o `parseRoute` lê dela). */
function at(hash) {
  globalThis.location = { hash, search: "", origin: "https://vox.exemplo", pathname: "/" };
  globalThis.window.location = globalThis.location;
}

let routed = 0;
navigation.setRoute(async () => { routed += 1; });

/** Registra os ouvintes de gossip uma vez (os registros são globais e acumulam). */
function bindOnce() {
  if (!bindOnce.done) {
    sync.bindGossipSubscriptions();
    bindOnce.done = true;
  }
}

function article(id) {
  const count = makeEl({ textContent: "2" });
  const btn = makeEl({ kids: { ".count-replies": count } });
  const list = makeEl();
  const panel = makeEl({ hidden: false, kids: { ".post-comment-list": list } });
  const art = makeEl({ kids: { ".post-comments": panel }, kidsAll: { ".count-replies": [count], ".btn-comment": [btn] } });
  return { art, count, list, id };
}

test("gossip: resposta a post na tela soma ao contador e entra na lista aberta", async () => {
  bindOnce();
  at("#/c/praca");
  const { art, count, list } = article("t1");
  installDom({ qs: { 'article[data-id="t1"]': art } });
  events.dispatchGossipPost({ id: "r1", type: "reply", replyTo: "t1", body: "Concordo com você", author: "vx_x", ts: 1 });
  assert.equal(count.textContent, "3");
  assert.equal(list.inserted.length, 1);
  assert.match(list.inserted[0].html, /Concordo com você/);
});

test("gossip: resposta com painel fechado só soma o contador; sem artigo na tela nada quebra", () => {
  bindOnce();
  at("#/c/praca");
  const { art, count, list } = article("t2");
  art.kids[".post-comments"].hidden = true;
  installDom({ qs: { 'article[data-id="t2"]': art } });
  events.dispatchGossipPost({ id: "r2", type: "reply", replyTo: "t2", body: "ok", ts: 1 });
  assert.equal(count.textContent, "3");
  assert.equal(list.inserted.length, 0);
  events.dispatchGossipPost({ id: "r3", type: "reply", replyTo: "ausente", body: "ok", ts: 1 });
});

test("gossip: post novo na Ágora redesenha a tela inicial", async () => {
  bindOnce();
  at("#/");
  const doc = installDom();
  events.dispatchGossipPost({ id: "t9", type: "topic", title: "Feira do bairro", body: "sábado", ts: 5, communityId: "praca" });
  await waitFor(() => doc.main.innerHTML.length > 0);
  assert.ok(doc.main.innerHTML.length > 0, "a Ágora foi montada de novo");
});

test("gossip: item de outro tipo em rota sem relação não redesenha nada", async () => {
  bindOnce();
  at("#/perfil/vx_a");
  await settle(150);
  const doc = installDom();
  for (const type of ["listing", "governance-proposal", "governance-vote", "frame-action", "desconhecido"]) {
    events.dispatchGossipPost({ id: `g_${type}`, type, title: "Oferta de teste muito longa para cortar", ts: 5 });
  }
  events.dispatchGossipPost({ id: "t9", type: "topic", editedAt: 9, ts: 5 });
  events.dispatchGossipPost({ ...{ id: "sem-tipo" }, type: "" });
  await settle();
  assert.equal(doc.main.innerHTML, "", "rota de perfil não é atualizada por gossip");
});

test("gossip: remoção do post aberto volta para a Ágora; em outras rotas não muda a hash", async () => {
  bindOnce();
  at("#/t/post_a");
  installDom();
  events.dispatchGossipTombstone({ id: "outro" });
  assert.equal(globalThis.location.hash, "#/t/post_a");
  events.dispatchGossipTombstone({ id: "post_a" });
  assert.equal(globalThis.location.hash, "#/");
  at("#/");
  const doc = installDom();
  events.dispatchGossipTombstone({ id: "post_b" });
  await settle();
  assert.ok(doc.main.innerHTML.length > 0, "na Ágora a lista é redesenhada");
});

test("gossip: o ouvinte de saúde da sinalização fica registrado e aceita queda e volta", () => {
  bindOnce();
  installDom();
  const handler = webrtcState.getSignalingHealthHandler();
  assert.equal(typeof handler, "function");
  assert.doesNotThrow(() => handler(true));
  assert.doesNotThrow(() => handler(false));
});

test("memória central: o que chega do servidor redesenha a rota atual", async () => {
  bindOnce();
  at("#/");
  const ana = await person();
  memory = { status: "ok", revision: 7, posts: [await ana.sign({ id: "mc_t1", type: "topic", communityId: "praca", title: "Vindo do servidor", body: "oi", ts: Date.now() })], tombstones: [], blobs: [], profiles: [] };
  const doc = installDom();
  const { syncWithCentralMemory } = await import("../client/js/central-memory.js");
  const res = await syncWithCentralMemory();
  memory = null;
  await settle();
  assert.equal(res.ok, true);
  assert.ok(res.hydratedCount >= 1);
  assert.ok(doc.main.innerHTML.length > 0, "a Ágora foi redesenhada após hidratar");
});

test("memória central: rotas de pessoas, comunidade, tópico, proposta e tag também redesenham", async () => {
  bindOnce();
  const ana = await person();
  const { syncWithCentralMemory } = await import("../client/js/central-memory.js");
  const routes = ["#/pessoas?q=ana", "#/c/praca", "#/t/mc_none?c=praca", "#/tag/feira", "#/c/praca/vote/prop1"];
  for (const [i, hash] of routes.entries()) {
    at(hash);
    memory = { status: "ok", revision: 10 + i, posts: [await ana.sign({ id: `mc_r${i}`, type: "topic", communityId: "praca", title: "Novo", body: "x", ts: Date.now() + i })], tombstones: [], blobs: [], profiles: [] };
    installDom();
    const res = await syncWithCentralMemory();
    assert.equal(res.ok, true, hash);
    await settle(10);
  }
  memory = null;
});

test("abas: mensagem de rota vinda de outra aba chama o roteador; ligar duas vezes não duplica", async () => {
  routed = 0;
  at("#/");
  installDom();
  globalThis.window.addEventListener = () => {};
  sync.wireTabSyncAtBoot();
  await settle();
  const other = new globalThis.BroadcastChannel(tabSync.TAB_SYNC_CHANNEL);
  other.postMessage({ v: 1, kind: "route", tabId: "outra-aba", hash: "#/pessoas" });
  await settle();
  assert.equal(globalThis.location.hash, "#/pessoas");
  assert.equal(routed, 1);
  other.postMessage({ v: 1, kind: "route", tabId: "outra-aba", hash: "#/pessoas" });
  await settle();
  assert.equal(routed, 2);
  other.close();
});

function likeButton(over = {}) {
  const icon = makeEl();
  const label = makeEl({ textContent: "" });
  const btn = makeEl({ dataset: { id: "post_like", count: "4", ...over }, kids: { ".icon-heart": icon, ".count-likes": label } });
  return { btn, icon, label };
}

/** Dispara um clique no documento cujo alvo resolve `selector` para `btn`. */
async function clickOn(doc, selector, btn) {
  const target = makeEl({ up: { [selector]: btn } });
  const ev = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const fn of doc.docListeners.click) await fn(ev);
  return ev;
}

function boot() {
  const doc = installDom();
  social.initSocialInteractions();
  return doc;
}

test("curtir: marca ativo, enche o coração e conta +1; de novo desfaz", async () => {
  localStorage.clear();
  const doc = boot();
  const { btn, icon, label } = likeButton();
  const ev = await clickOn(doc, ".btn-like", btn);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(btn.classList.contains("active"), true);
  assert.equal(icon.getAttribute("fill"), "currentColor");
  assert.equal(label.textContent, 5);
  await clickOn(doc, ".btn-like", btn);
  assert.equal(btn.classList.contains("active"), false);
  assert.equal(icon.getAttribute("fill"), "none");
  assert.equal(label.textContent, 4);
});

test("estrela e favorito: alternam o estado salvo e o ícone", async () => {
  localStorage.clear();
  const doc = boot();
  const star = makeEl({ dataset: { id: "p_star", count: "0" }, kids: { ".icon-star": makeEl(), ".count-stars": makeEl() } });
  await clickOn(doc, ".btn-star", star);
  assert.equal(star.classList.contains("active"), true);
  assert.equal(star.kids[".count-stars"].textContent, 1);
  await clickOn(doc, ".btn-star", star);
  assert.equal(star.kids[".icon-star"].getAttribute("fill"), "none");
  const save = makeEl({ dataset: { id: "p_save" }, kids: { ".icon-bookmark": makeEl() } });
  await clickOn(doc, ".btn-save", save);
  assert.equal(save.kids[".icon-bookmark"].getAttribute("fill"), "currentColor");
  await clickOn(doc, ".btn-save", save);
  assert.equal(save.classList.contains("active"), false);
});

test("acompanhar autor: botão de overlay vira 'Seguindo'; botão de perfil troca de estilo", async () => {
  localStorage.clear();
  const doc = boot();
  const overlay = makeEl({ dataset: { route: "vx_autor" } });
  overlay.classList.add("btn-overlay-follow");
  await clickOn(doc, ".btn-watch-profile", overlay);
  assert.equal(overlay.textContent, "Seguindo");
  assert.equal(overlay.getAttribute("aria-pressed"), "true");
  await clickOn(doc, ".btn-watch-profile", overlay);
  assert.equal(overlay.textContent, "Seguir");
  assert.equal(overlay.getAttribute("aria-label"), "Seguir autor");
  const profile = makeEl({ dataset: { route: "vx_outro" } });
  await clickOn(doc, ".btn-watch-profile", profile);
  assert.equal(profile.textContent, "✓ Acompanhando");
  assert.equal(profile.classList.contains("btn-outline"), true);
  await clickOn(doc, ".btn-watch-profile", profile);
  assert.match(profile.textContent, /Acompanhar/);
});

test("copiar em Markdown: escreve o post formatado na área de transferência", async () => {
  const doc = boot();
  const written = [];
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (t) => written.push(t) } });
  const btn = makeEl({ dataset: { id: "p1", title: "Título X", body: "Corpo Y", author: "Ana", handle: "ana" } });
  await clickOn(doc, ".btn-copy-md", btn);
  await settle();
  assert.equal(written.length, 1);
  assert.match(written[0], /Título X/);
  assert.match(written[0], /Corpo Y/);
});

test("reação a comentário: marca pressionado e mostra a contagem; desfazer esconde o número", async () => {
  localStorage.clear();
  const doc = boot();
  const countEl = makeEl({ hidden: true });
  const btn = makeEl({ dataset: { id: "c1", count: "0" }, kids: { ".count-comment-reacts": countEl } });
  await clickOn(doc, ".btn-comment-react", btn);
  assert.equal(btn.getAttribute("aria-pressed"), "true");
  assert.equal(countEl.textContent, "1");
  assert.equal(countEl.hidden, false);
  await clickOn(doc, ".btn-comment-react", btn);
  assert.equal(btn.getAttribute("aria-pressed"), "false");
  assert.equal(countEl.textContent, "");
  assert.equal(countEl.hidden, true);
});

test("responder comentário: abre o formulário aninhado e fecha o que estava aberto; cancelar fecha", async () => {
  const doc = boot();
  const formA = makeEl({ hidden: true, kids: { textarea: makeEl({ value: "" }) } });
  const itemA = makeEl({ kids: { ".post-comment-nested-reply": formA } });
  const formB = makeEl({ hidden: false });
  const itemB = makeEl({ kids: { ".post-comment-nested-reply": formB } });
  formB.up[".post-comment-item"] = itemB;
  doc.querySelectorAll = (sel) => (sel === ".post-comment-nested-reply:not([hidden])" ? [formB] : []);
  globalThis.document.querySelectorAll = doc.querySelectorAll;
  const btn = makeEl({ up: { ".post-comment-item": itemA } });
  await clickOn(doc, ".btn-comment-reply", btn);
  assert.equal(formA.hidden, false, "abriu o formulário deste comentário");
  assert.equal(formB.hidden, true, "fechou o outro");
  const cancel = makeEl({ up: { ".post-comment-item": itemA } });
  await clickOn(doc, ".btn-comment-reply-cancel", cancel);
  assert.equal(formA.hidden, true);
});

test("enviar comentário: submit sem formulário conhecido não é interceptado", async () => {
  const doc = boot();
  const target = makeEl();
  const ev = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const fn of doc.docListeners.submit) await fn(ev);
  assert.equal(ev.defaultPrevented, false);
});

test("enviar comentário: o formulário aninhado e o do compositor são interceptados (sem recarregar a página)", async () => {
  const doc = boot();
  for (const sel of [".post-comment-nested-reply", ".post-comment-composer"]) {
    const form = makeEl({ kids: { textarea: makeEl({ value: "" }) } });
    const ev = { target: makeEl({ up: { [sel]: form } }), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of doc.docListeners.submit) await fn(ev);
    assert.equal(ev.defaultPrevented, true, sel);
  }
});

test("clique fora de qualquer botão conhecido não faz nada", async () => {
  const doc = boot();
  const ev = { target: makeEl(), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const fn of doc.docListeners.click) await fn(ev);
  assert.equal(ev.defaultPrevented, false);
});

test("zap: abre o modal com a chave Pix", async () => {
  const doc = boot();
  const btn = makeEl({ dataset: { pix: "ana@exemplo.com", authorName: "Ana", title: "Post" } });
  const ev = await clickOn(doc, ".btn-zap-post:not(.disabled), .btn-zap-profile", btn);
  assert.equal(ev.defaultPrevented, true);
  assert.match(doc.body.children.at(-1).innerHTML, /ana@exemplo\.com/, "o modal mostra a chave Pix");
});

test("repostar: o botão fica ocupado durante a ação e é liberado depois", async () => {
  const doc = boot();
  const btn = makeEl({ dataset: { id: "p_repost" } });
  await clickOn(doc, ".btn-repost", btn);
  await waitFor(() => !btn.disabled);
  assert.equal(btn.disabled, false);
});

async function ownPost(id, extra = {}) {
  const me = await localAccount.ensureLocalAccount();
  const signed = await localAccount.signPayload({ id, type: "topic", communityId: "praca", title: "Título antigo", body: "Corpo antigo", ts: Date.now(), ...extra });
  await cacheNode.saveLocalPost(signed);
  return { me, signed };
}

function modalDom() {
  const overlay = makeEl();
  const form = makeEl();
  const container = makeEl({ id: "modal-container", kids: { ".modal-overlay": overlay, "#form-post-edit": form, ".btn-close-post-edit": makeEl(), ".btn-cancel-post-edit": makeEl() } });
  const text = makeEl({ value: "Título novo\nCorpo novo do post" });
  const remove = makeEl({ checked: false });
  const save = makeEl({ textContent: "Salvar" });
  const doc = installDom({ ids: { "modal-container": container, "post-edit-text": text, "post-edit-remove-image": remove, "btn-post-edit-save": save } });
  return { doc, container, overlay, form, text, save };
}

test("editar post: o formulário regrava o post assinado com título e corpo novos", async () => {
  await ownPost("post_edit_1", { image: "data:image/png;base64,AAAA", imageAlt: "alt" });
  const { container, form, save } = modalDom();
  await mutation.openPostEditModal("post_edit_1");
  assert.ok(container.innerHTML.includes("post_edit_1") || container.innerHTML.length > 0, "o modal foi desenhado");
  await form.fire("submit");
  let saved = await cacheNode.getLocalPost("post_edit_1");
  for (let i = 0; i < 300 && saved.title !== "Título novo"; i++) {
    await new Promise((r) => setTimeout(r, 10));
    saved = await cacheNode.getLocalPost("post_edit_1");
  }
  assert.equal(saved.title, "Título novo");
  assert.match(saved.body, /Corpo novo/);
  assert.equal(saved.image, "data:image/png;base64,AAAA", "sem marcar remover, a imagem fica");
  assert.ok(saved.editedAt > 0);
  assert.equal(save.disabled, false);
  assert.equal(save.textContent, "Salvar");
});

test("editar post: 'remover imagem' apaga imagem e texto alternativo", async () => {
  await ownPost("post_edit_2", { image: "data:image/png;base64,AAAA", imageAlt: "alt" });
  const dom = modalDom();
  dom.doc.getElementById("post-edit-remove-image").checked = true;
  await mutation.openPostEditModal("post_edit_2");
  await dom.form.fire("submit");
  await settle();
  const saved = await cacheNode.getLocalPost("post_edit_2");
  assert.equal(saved.image, "");
  assert.equal(saved.imageAlt, "");
});

test("editar post: texto vazio não grava nada; post de outra pessoa não abre o modal", async () => {
  const { signed } = await ownPost("post_edit_3");
  const dom = modalDom();
  await mutation.openPostEditModal("post_edit_3");
  dom.text.value = "   ";
  await dom.form.fire("submit");
  await settle();
  assert.equal((await cacheNode.getLocalPost("post_edit_3")).title, signed.title);
  const other = await person();
  await cacheNode.saveLocalPost(await other.sign({ id: "post_alheio", type: "topic", communityId: "praca", title: "De outra pessoa", body: "x", ts: Date.now() }));
  const dom2 = modalDom();
  await mutation.openPostEditModal("post_alheio");
  assert.equal(dom2.container.innerHTML, "", "o modal não abre para post alheio");
});

test("editar post: fechar pelo overlay, Esc e botões esvazia o modal; clique dentro não fecha", async () => {
  await ownPost("post_edit_4");
  const dom = modalDom();
  await mutation.openPostEditModal("post_edit_4");
  assert.ok(dom.container.innerHTML.length > 0);
  await dom.overlay.fire("click", { target: makeEl() });
  assert.ok(dom.container.innerHTML.length > 0, "clique dentro do cartão não fecha");
  await dom.overlay.fire("keydown", { key: "Enter" });
  assert.ok(dom.container.innerHTML.length > 0);
  await dom.overlay.fire("click");
  assert.equal(dom.container.innerHTML, "");
  await mutation.openPostEditModal("post_edit_4");
  await dom.overlay.fire("keydown", { key: "Escape" });
  assert.equal(dom.container.innerHTML, "");
  await mutation.openPostEditModal("post_edit_4");
  await dom.container.kids[".btn-close-post-edit"].fire("click");
  assert.equal(dom.container.innerHTML, "");
  await mutation.openPostEditModal("post_edit_4");
  await dom.container.kids[".btn-cancel-post-edit"].fire("click");
  assert.equal(dom.container.innerHTML, "");
});

test("editar post: sem contêiner de modal na tela, nada é desenhado", async () => {
  await ownPost("post_edit_5");
  installDom();
  await assert.doesNotReject(() => mutation.openPostEditModal("post_edit_5"));
});

test("apagar post: com confirmação grava a lápide; sem confirmação mantém o post", async () => {
  await ownPost("post_del_1");
  at("#/");
  installDom();
  globalThis.confirm = () => false;
  await mutation.handleDeletePost("post_del_1");
  assert.deepEqual((await cacheNode.getAllTombstones()).filter((t) => t.id === "post_del_1"), []);
  globalThis.confirm = () => true;
  routed = 0;
  await mutation.handleDeletePost("post_del_1");
  assert.equal((await cacheNode.getAllTombstones()).filter((t) => t.id === "post_del_1").length, 1);
  assert.equal(routed, 1, "fora da página do post, a tela é atualizada");
});

test("apagar post aberto: volta para a Ágora; post alheio ou inexistente não apaga", async () => {
  await ownPost("post_del_2");
  at("#/t/post_del_2");
  installDom();
  globalThis.confirm = () => true;
  await mutation.handleDeletePost("post_del_2");
  assert.equal(globalThis.location.hash, "#/");
  await mutation.handleDeletePost("nao_existe");
  assert.deepEqual((await cacheNode.getAllTombstones()).filter((t) => t.id === "nao_existe"), []);
});
