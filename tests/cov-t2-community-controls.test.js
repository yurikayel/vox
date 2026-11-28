/**
 * @file Cobertura T2: controles do cabeçalho e da lista da comunidade (`community-controls`):
 * contato, convite, exportação, foto, quarentena, ocultar, busca, ordenação e paginação.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, withToasts, settle, installImageFakes } from "./helpers/cov-t2-dom.mjs";

globalThis.fetch = () => Promise.reject(new Error("offline"));
installFakeDom();

const controls = await import("../client/js/app/community-controls.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/index.js");
const navigation = await import("../client/js/app/navigation.js");
const seed = await import("../client/js/community-seed-checklist.js");
const peers = await import("../client/js/peers.js");
const contacts = await import("../client/js/contacts.js");
const { TOPICS_PAGE_SIZE } = await import("../client/js/render/community.js");

const routed = [];
navigation.setRoute(async () => { routed.push(globalThis.location.hash); });

async function account() {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  return localAccount.getRouteId();
}

/** Monta um documento falso e devolve o `ctx` base de `bindCommunityHeaderEvents`. */
function scene(over = {}) {
  const doc = installFakeDom();
  const main = doc.add("main", { id: "main" });
  const ctx = {
    main, communityId: "bairro-ctl", meta: { id: "bairro-ctl", title: "Bairro", owner: "vx_dono" }, user: "vx_eu",
    peerSettings: { enabled: false, commOnly: false }, filteredTopics: [], ...over,
  };
  return { doc, main, ctx };
}

test("botão de contato: adiciona, avisa e trava; sem rota não faz nada", async () => {
  const { doc, ctx } = scene();
  const ok = doc.add("button", { cls: "btn-community-add-contact", dataset: { route: "vx_amiga_ctl", label: "Amiga" } });
  const vazio = doc.add("button", { cls: "btn-community-add-contact", dataset: {} });
  controls.bindCommunityHeaderEvents(ctx);
  const toasts = await withToasts(doc, async () => { ok.fire("click"); vazio.fire("click"); });
  assert.deepEqual(toasts, ["Contato adicionado."]);
  assert.equal(ok.disabled, true);
  assert.equal(ok.textContent, "✓");
  assert.equal(vazio.disabled, false);
  assert.equal(contacts.hasContact("vx_amiga_ctl"), true);
});

test("compartilhar a comunidade: abre o compartilhamento e conta o convite do ritual de semente", async () => {
  const { doc, ctx } = scene({ user: "vx_dono" });
  const btn = doc.add("button", { id: "btn-share-comm" });
  controls.bindCommunityHeaderEvents(ctx);
  const shared = [];
  Object.defineProperty(globalThis.navigator, "share", { value: async (p) => { shared.push(p); }, configurable: true });
  const before = seed.loadSeedState("bairro-ctl").invitesSent;
  await withToasts(doc, async () => { btn.fire("click"); });
  delete globalThis.navigator.share;
  assert.match(shared[0].title, /Bairro/);
  assert.match(shared[0].url, /bairro-ctl/);
  assert.equal(seed.loadSeedState("bairro-ctl").invitesSent, before + 1);
});

test("exportar gênesis: baixa JSON com a comunidade e os tópicos filtrados", async () => {
  const topics = [{ id: "t1", title: "Pauta", body: "texto", author: "vx_a", ts: 1 }, { id: "t2", title: "Outra", owner: "vx_b", ts: 2 }];
  const { doc, ctx } = scene({ filteredTopics: topics });
  const btn = doc.add("button", { id: "btn-export-comm-genesis" });
  const anchors = [];
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => { const el = create(tag); anchors.push(el); return el; };
  const blobs = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = (b) => { blobs.push(b); return "blob:cov-t2"; };
  controls.bindCommunityHeaderEvents(ctx);
  const toasts = await withToasts(doc, async () => { btn.fire("click"); });
  URL.createObjectURL = original;
  const anchor = anchors.find((a) => a.tagName === "A");
  assert.equal(anchor.download, "comunidade-bairro-ctl-genesis.json");
  assert.equal(anchor.clicked, true);
  const payload = JSON.parse(await blobs[0].text());
  assert.equal(payload.type, "vox-community-genesis");
  assert.equal(payload.topicsCount, 2);
  assert.deepEqual(payload.topics.map((t) => t.author), ["vx_a", "vx_b"]);
  assert.deepEqual(toasts, ["Gênesis da comunidade exportado com sucesso!"]);
});

test("controles de vizinhança e semente: apoiador, convite e dispensar", async () => {
  const { doc, ctx } = scene();
  const neighbor = doc.add("button", { id: "btn-neighbor-comm-only" });
  const invite = doc.add("button", { id: "btn-seed-invite" });
  const dismiss = doc.add("button", { id: "btn-seed-dismiss" });
  controls.bindCommunityHeaderEvents(ctx);
  Object.defineProperty(globalThis.navigator, "share", { value: async () => {}, configurable: true });
  routed.length = 0;
  const toasts = await withToasts(doc, async () => {
    neighbor.fire("click"); invite.fire("click"); dismiss.fire("click");
  });
  delete globalThis.navigator.share;
  assert.deepEqual(peers.getPeerSettings().commOnly, true);
  assert.equal(seed.loadSeedState("bairro-ctl").commOnlyNudgeSeen, true);
  assert.equal(seed.loadSeedState("bairro-ctl").dismissed, true);
  assert.equal(globalThis.location.hash, "#/settings/network#net-comm-only-wrap");
  assert.equal(routed.length, 2, "convite e dispensar re-roteiam");
  assert.ok(toasts.some((t) => /^Convite \d\/2 registrado\.$/.test(t)));
  assert.ok(toasts.some((t) => t.startsWith("Checklist dispensado")));
  globalThis.location.hash = "#/";
});

test("foto da comunidade: sem arquivo, de estranho e inválida não gravam nada", async () => {
  const me = await account();
  const { doc, ctx } = scene({ meta: { id: "bairro-ctl", title: "Bairro", owner: "vx_dono" } });
  const input = doc.add("input", { id: "input-comm-photo-file" });
  controls.bindCommunityHeaderEvents(ctx);
  input.files = [];
  input.fire("change", { target: input });
  const estranho = await withToasts(doc, async () => {
    input.files = [{ type: "image/png", size: 10 }];
    input.fire("change", { target: input });
  });
  assert.deepEqual(estranho, ["Só o dono ou um moderador desta comunidade pode trocar a foto."]);
  ctx.meta.owner = me;
  const invalida = await withToasts(doc, async () => {
    input.files = [{ type: "image/svg+xml", size: 10 }];
    input.fire("change", { target: input });
  });
  assert.deepEqual(invalida, ["SVG não é permitido na foto da comunidade."]);
  assert.deepEqual(await cacheNode.getLocalPosts({ type: "community_update", communityId: "bairro-ctl" }), []);
});

test("foto da comunidade: dono troca a foto, grava o update e repinta a imagem existente", async () => {
  const me = await account();
  installImageFakes();
  const { doc, ctx } = scene({ meta: { id: "bairro-ctl", title: "Bairro", owner: me } });
  const input = doc.add("input", { id: "input-comm-photo-file" });
  const img = doc.add("img", { cls: "community-avatar-img" });
  const fb = doc.add("div", { cls: "community-avatar-fallback" });
  controls.bindCommunityHeaderEvents(ctx);
  input.files = [{ type: "image/png", size: 10 }];
  const toasts = await withToasts(doc, async () => { input.fire("change", { target: input }); });
  assert.deepEqual(toasts, ["Foto da comunidade atualizada!"]);
  assert.match(img.src, /^data:image\/jpeg/);
  assert.equal(img.style.display, "block");
  assert.equal(fb.style.display, "none");
  const [saved] = await cacheNode.getLocalPosts({ type: "community_update", communityId: "bairro-ctl" });
  assert.equal(saved.image, img.src);
});

test("foto da comunidade: sem <img> pinta dentro da caixa do avatar; erro de compressão vira aviso", async () => {
  const me = await account();
  installImageFakes();
  const { doc, ctx } = scene({ meta: { id: "bairro-ctl", title: "Bairro <b>", owner: me } });
  const input = doc.add("input", { id: "input-comm-photo-file" });
  const box = doc.add("div", { cls: "community-avatar-box" });
  controls.bindCommunityHeaderEvents(ctx);
  input.files = [{ type: "image/png", size: 10 }];
  await withToasts(doc, async () => { input.fire("change", { target: input }); });
  assert.match(box.innerHTML, /<img class="community-avatar-img" src="data:image\/jpeg/);
  assert.match(box.innerHTML, /alt="Bairro &lt;b&gt;"/);
  globalThis.Image = class { set src(_v) { queueMicrotask(() => this.onerror?.()); } };
  const erro = await withToasts(doc, async () => { input.fire("change", { target: input }); });
  assert.deepEqual(erro, ["Erro ao atualizar foto: Imagem inválida"]);
});

test("toggleCommunityQuarantine: estranho é recusado; dono liga, grava e atualiza meta e botão", async () => {
  const me = await account();
  const doc = installFakeDom();
  const state = doc.add("span", { cls: "community-quarantine-state" });
  const btn = doc.add("button", { id: "btn-toggle-comm-quarantine", dataset: { next: "true" } });
  const meta = { id: "q-ctl", owner: "vx_dono", newKeyQuarantine: false };
  const recusado = await withToasts(doc, async () => { assert.equal(await controls.toggleCommunityQuarantine("q-ctl", meta), null); });
  assert.deepEqual(recusado, ["Só o dono ou um moderador desta comunidade pode alterar a quarentena."]);
  meta.owner = me;
  const ligado = await withToasts(doc, async () => {
    const signed = await controls.toggleCommunityQuarantine("q-ctl", meta);
    assert.equal(signed.newKeyQuarantine, true);
  });
  assert.deepEqual(ligado, ["Quarentena de chave nova ativada!"]);
  assert.equal(meta.newKeyQuarantine, true);
  assert.equal(state.textContent, "Ligada");
  assert.equal(btn.textContent, "Desligar");
  assert.equal(btn.dataset.next, "false");
  const desligado = await withToasts(doc, async () => { await controls.toggleCommunityQuarantine("q-ctl", meta, false); });
  assert.deepEqual(desligado, ["Quarentena de chave nova desativada!"]);
  assert.equal(btn.title, "Ligar quarentena de chaves novas");
  assert.equal((await cacheNode.getLocalPosts({ type: "community_update", communityId: "q-ctl" })).length, 2);
});

test("botão de quarentena: lê data-next, reabilita ao final e mostra erro se faltar permissão", async () => {
  const me = await account();
  const { doc, ctx } = scene({ meta: { id: "q2-ctl", owner: me } });
  const btn = doc.add("button", { id: "btn-toggle-comm-quarantine", dataset: { next: "true" } });
  controls.bindCommunityHeaderEvents(ctx);
  await withToasts(doc, async () => { btn.fire("click"); });
  assert.equal(ctx.meta.newKeyQuarantine, true);
  assert.equal(btn.disabled, false);
  ctx.meta.owner = "vx_outro";
  const toasts = await withToasts(doc, async () => { btn.fire("click"); });
  assert.deepEqual(toasts, ["Só o dono ou um moderador desta comunidade pode alterar a quarentena."]);
});

test("ocultar item: cancelar mantém; confirmar assina a ação e remove o cartão", async () => {
  await account();
  const { doc, ctx } = scene({ communityId: "hide-ctl" });
  const card = doc.add("div", { cls: "card" });
  const btn = doc.add("button", { cls: "btn-mod-hide", parent: card, dataset: { id: "top_alvo" } });
  controls.bindCommunityHeaderEvents(ctx);
  globalThis.confirm = () => false;
  btn.fire("click", { target: btn });
  assert.notEqual(card.parent, null);
  let asked = "";
  globalThis.confirm = (m) => { asked = m; return true; };
  const toasts = await withToasts(doc, async () => { btn.fire("click", { target: btn }); });
  delete globalThis.confirm;
  assert.equal(asked, "Ocultar o item top_alvo?");
  assert.deepEqual(toasts, ["Ação de moderação enviada."]);
  assert.equal(card.parent, null);
  const acts = await cacheNode.getLocalPosts({ type: "mod-action", communityId: "hide-ctl" });
  assert.deepEqual(acts.map((a) => [a.action, a.target]), [["hide", "top_alvo"]]);
});

function topicsOf(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Tópico ${i}`, author: "vx_a", ts: 1000 + i, communityId: "lista-ctl" }));
}

test("busca de tópicos: filtra sem acento, mostra vazio e some ao limpar", () => {
  const { doc, main, ctx } = scene({ communityId: "lista-ctl", filteredTopics: topicsOf(3) });
  const list = doc.add("div", { cls: "community-vox-topic-list", parent: main });
  const input = doc.add("input", { id: "input-comm-topic-search", parent: main });
  const rows = ["Pão de queijo", "Feira orgânica", "Reunião"].map((t) => {
    const r = doc.add("article", { cls: "community-topic-row", parent: list });
    r.textContent = t;
    return r;
  });
  controls.bindCommunityHeaderEvents(ctx);
  input.value = "PAO";
  input.fire("input", { target: input });
  assert.deepEqual(rows.map((r) => r.style.display), ["", "none", "none"]);
  input.value = "zzz";
  input.fire("input", { target: input });
  const vazio = list.querySelector(".community-topic-search-empty");
  assert.match(vazio.innerHTML, /Nenhum tópico encontrado para &quot;zzz&quot;/);
  input.value = "feira";
  input.fire("input", { target: input });
  assert.equal(list.querySelector(".community-topic-search-empty"), null);
  assert.deepEqual(rows.map((r) => r.style.display), ["none", "", "none"]);
});

test("ordenação: botão ativo muda aria-pressed; 'fixados' sem pauta mostra aviso vazio", () => {
  const { doc, main, ctx } = scene({ communityId: "lista-ctl", filteredTopics: topicsOf(2) });
  const list = doc.add("div", { cls: "community-vox-topic-list", parent: main });
  const active = doc.add("button", { cls: "btn-sort-topic active", parent: main, dataset: { sort: "active" } });
  const pinned = doc.add("button", { cls: "btn-sort-topic", parent: main, dataset: { sort: "pinned" } });
  const semModo = doc.add("button", { cls: "btn-sort-topic", parent: main });
  controls.bindCommunityHeaderEvents(ctx);
  semModo.fire("click");
  assert.equal(active.classList.contains("active"), true, "botão sem modo é ignorado");
  pinned.fire("click");
  assert.equal(pinned.getAttribute("aria-pressed"), "true");
  assert.equal(active.getAttribute("aria-pressed"), "false");
  assert.equal(active.classList.contains("active"), false);
  assert.match(list.innerHTML, /Nenhuma pauta ou tópico fixado/);
  active.fire("click");
  assert.equal((list.innerHTML.match(/community-topic-row/g) || []).length > 0, true);
});

test("paginação: 'carregar mais' amplia a lista e o contador de restantes some no fim", () => {
  const total = TOPICS_PAGE_SIZE * 2 + 1;
  const { doc, main, ctx } = scene({ communityId: "lista-ctl", filteredTopics: topicsOf(total) });
  const list = doc.add("div", { cls: "community-vox-topic-list", parent: main });
  doc.add("div", { cls: "community-vox-feed", parent: main });
  const more = doc.add("button", { cls: "btn-load-more-topics", parent: main });
  const sortActive = doc.add("button", { cls: "btn-sort-topic", parent: main, dataset: { sort: "active" } });
  controls.bindCommunityHeaderEvents(ctx);
  sortActive.fire("click");
  const rowsIn = () => (list.innerHTML.match(/<article class="community-topic-row/g) || []).length;
  assert.equal(rowsIn(), TOPICS_PAGE_SIZE);
  const pagination = main.querySelector(".community-topic-pagination");
  assert.match(pagination.innerHTML, new RegExp(`${total - TOPICS_PAGE_SIZE} restantes`));
  more.fire("click");
  assert.equal(rowsIn(), TOPICS_PAGE_SIZE * 2);
  assert.match(main.querySelector(".community-topic-pagination").innerHTML, /\(1 restante\)/);
  more.fire("click");
  assert.equal(rowsIn(), total);
  assert.equal(main.querySelector(".community-topic-pagination"), null, "tudo carregado: some o controle");
});

test("bindCommunityHeaderEvents: sem nenhum elemento na tela não quebra", async () => {
  const { ctx } = scene();
  assert.doesNotThrow(() => controls.bindCommunityHeaderEvents(ctx));
  await settle();
});
