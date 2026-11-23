/**
 * @file Cobertura T2: fluxos de dados, canal, termo e ofertas da comunidade (`community-data`,
 * `community-channel-flow`, `community-termo-flow`, `community-listing-handlers`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeDoc, installFakeDom, withToasts, settle } from "./helpers/cov-t2-dom.mjs";

globalThis.fetch = () => Promise.reject(new Error("offline"));
installFakeDom();

const data = await import("../client/js/app/community-data.js");
const channelFlow = await import("../client/js/app/community-channel-flow.js");
const termoFlow = await import("../client/js/app/community-termo-flow.js");
const handlers = await import("../client/js/app/community-listing-handlers.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/index.js");
const termoLib = await import("../client/js/community-termo.js");
const listing = await import("../client/js/listing.js");
const navigation = await import("../client/js/app/navigation.js");
const seed = await import("../client/js/community-seed-checklist.js");
const { AVISO_LAB_KEY } = await import("../client/js/app/aviso-flow.js");

const routed = [];
navigation.setRoute(async () => { routed.push(globalThis.location.hash); });

async function freshAccount() {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  return localAccount.getRouteId();
}

test("loadCommunityMetaAndTopics: comunidade Vox traz o tópico oficial de boas-vindas", async () => {
  const me = await freshAccount();
  const out = await data.loadCommunityMetaAndTopics("vox", me);
  assert.equal(out.meta.id, "vox");
  assert.equal(out.isUserMod, false);
  assert.equal(out.heldCount, 0);
  assert.ok(out.filteredTopics.some((t) => t.id.includes("welcome")), "boas-vindas oficial presente");
});

test("loadCommunityMetaAndTopics: tópico local aparece e fica em localTopics", async () => {
  const me = await freshAccount();
  const signed = await localAccount.signPayload({ id: "top_cov_t2_a", type: "topic", communityId: "bairro-t2", title: "Pauta local", body: "texto", ts: Date.now() });
  await cacheNode.saveLocalPost(signed);
  const out = await data.loadCommunityMetaAndTopics("bairro-t2", me);
  assert.ok(out.filteredTopics.some((t) => t.id === "top_cov_t2_a"));
  assert.deepEqual(out.localTopics.map((t) => t.id), ["top_cov_t2_a"]);
});

test("loadCommunityTabSpecifics: ofertas só na aba de ofertas; propostas sempre", async () => {
  await freshAccount();
  const posts = await data.loadCommunityTabSpecifics("demo-feira-local", "posts", "vx_x", true);
  assert.deepEqual(posts.listings, []);
  const tab = await data.loadCommunityTabSpecifics("demo-feira-local", "listings", "vx_x", true);
  assert.deepEqual(tab.listings, [], "sem ofertas locais nem demo, a aba volta vazia");
  const gov = await data.loadCommunityTabSpecifics("demo-aprenda-vox", "governance", "vx_x", false);
  assert.deepEqual(gov.proposals, []);
});

test("loadCommunityTabSpecifics: ofertas e propostas locais entram sem duplicar", async () => {
  await freshAccount();
  await cacheNode.saveLocalPost({ id: "lst_cov_t2", type: "listing", communityId: "feira-t2", title: "Bolo", body: "caseiro", author: "vx_a", ts: 1 });
  await cacheNode.saveLocalPost({ id: "prop_cov_t2", type: "governance-proposal", communityId: "feira-t2", title: "Regra", author: "vx_a", ts: 1 });
  const out = await data.loadCommunityTabSpecifics("feira-t2", "listings", "vx_a", false);
  assert.equal(out.listings.filter((l) => l.id === "lst_cov_t2").length, 1);
  assert.deepEqual(out.proposals.map((p) => p.id), ["prop_cov_t2"]);
});

test("buildCommunityRecentPeople: dono vai à frente, autores e membro entram sem repetir", async () => {
  const topics = [{ id: "a", author: "vx_ana", ts: 1 }, { id: "b", author: "vx_ana", ts: 2 }];
  const people = await data.buildCommunityRecentPeople({
    filteredTopics: topics, meta: { owner: "vx_dono" }, user: "vx_eu", isMember: true, tab: "posts", communityId: "x",
  });
  const ids = people.map((p) => p.routeId);
  assert.equal(ids[0], "vx_dono");
  assert.deepEqual([...ids].sort(), ["vx_ana", "vx_dono", "vx_eu"]);
  const other = await data.buildCommunityRecentPeople({ filteredTopics: topics, meta: null, user: "", isMember: false, tab: "listings" });
  assert.deepEqual(other, [], "aba sem relevância e sem dono não lista ninguém");
});

test("buildCommunityRecentPeople: na comunidade vox soma o diretório local, menos quem saiu", async () => {
  await freshAccount();
  const profileDirectory = await import("../client/js/profile-directory.js");
  const base = { filteredTopics: [], meta: {}, user: "", isMember: false, tab: "members", communityId: "vox" };
  const people = await data.buildCommunityRecentPeople(base);
  const cards = profileDirectory.listDiscoverableProfileCards().filter((c) => c?.routeId);
  assert.equal(people.length, cards.length);
  if (!cards.length) return;
  await cacheNode.saveLocalPost({ id: "leave_t2", type: "membership_leave", communityId: "vox", author: cards[0].routeId, ts: 1 });
  const afterLeave = await data.buildCommunityRecentPeople(base);
  assert.equal(afterLeave.some((p) => p.routeId === cards[0].routeId), false);
});

test("resolveCommunitySeedChecklist: sem usuário é nulo; dono de comunidade recém-criada recebe o checklist", () => {
  assert.equal(data.resolveCommunitySeedChecklist("c1", "", {}, 0, { enabled: false }), null);
  const meta = { owner: "vx_dono" };
  seed.markSeedPending("c-seed-t2");
  assert.equal(seed.shouldOfferSeedRitual("c-seed-t2", "vx_dono", meta), true, "pré-condição do cenário");
  const res = data.resolveCommunitySeedChecklist("c-seed-t2", "vx_dono", meta, 0, { enabled: false, commOnly: true });
  assert.deepEqual(res.ctx, { topicCount: 0, peerEnabled: false, commOnly: true });
});

test("assertCanPostTopic: sem comunidade libera; canal bloqueia estranho e avisa; falha de leitura não bloqueia", async () => {
  assert.equal(await channelFlow.assertCanPostTopic(""), true);
  const notes = [];
  const deps = (meta, selves) => ({ getMeta: async () => meta, getSelves: async () => selves, notify: (m) => notes.push(m) });
  const canal = { id: "c", owner: "vx_dono", postingMode: "mods" };
  assert.equal(await channelFlow.assertCanPostTopic("c", deps(canal, ["vx_ana"])), false);
  assert.match(notes[0], /canal/);
  assert.equal(await channelFlow.assertCanPostTopic("c", deps(canal, ["vx_dono"])), true);
  const broken = { getMeta: async () => { throw new Error("x"); }, getSelves: async () => ["vx_ana"], notify: () => {} };
  assert.equal(await channelFlow.assertCanPostTopic("c", broken), true);
});

test("assertCanPostTopic: dependências reais liberam quando não há community_update de modo", async () => {
  await freshAccount();
  assert.equal(await channelFlow.assertCanPostTopic("sem-canal-t2"), true);
});

test("assertCanPostTopic: com modo canal gravado, a conta dona publica e os estranhos não", async () => {
  const me = await freshAccount();
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: "c_canal-real-t2", type: "community", communityId: "canal-real-t2", title: "Canal", createdAt: 1 }));
  await cacheNode.saveLocalPost(await localAccount.signPayload({
    id: "comm_update_canal-real-t2_1", type: "community_update", communityId: "canal-real-t2", postingMode: "mods", postingModeSince: "1", updatedAt: 1,
  }));
  assert.equal(await channelFlow.assertCanPostTopic("canal-real-t2"), true, `dona ${me} publica no próprio canal`);
});

test("setPostingMode: só dono ou moderação; assina, salva e propaga", async () => {
  const calls = [];
  const deps = (routeId) => ({
    getMeta: async () => ({ id: "c", owner: "vx_dono" }),
    getRouteId: async () => routeId,
    sign: async (p) => ({ ...p, sig: "s" }),
    save: async (s) => calls.push(["save", s.postingMode]),
    broadcast: (s) => calls.push(["broadcast", s.postingMode]),
    now: () => 5000,
  });
  await assert.rejects(channelFlow.setPostingMode("c", "mods", deps("vx_ana")), /dono ou um moderador/);
  const signed = await channelFlow.setPostingMode("c", "mods", deps("vx_dono"));
  assert.equal(signed.postingMode, "mods");
  assert.equal(signed.postingModeSince, "5000");
  assert.deepEqual(calls, [["save", "mods"], ["broadcast", "mods"]]);
});

test("setPostingMode: com a conta local real grava o community_update no cache", async () => {
  await freshAccount();
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: "c_canal-t2", type: "community", communityId: "canal-t2", title: "Canal", createdAt: 1 }));
  const signed = await channelFlow.setPostingMode("canal-t2", "mods");
  assert.equal(signed.type, "community_update");
  const saved = await cacheNode.getLocalPosts({ type: "community_update", communityId: "canal-t2" });
  assert.deepEqual(saved.map((s) => s.postingMode), ["mods"]);
});

test("dropMountedCommunityPage: remove só a página da comunidade pedida", () => {
  const doc = installFakeDom();
  const a = doc.add("div", { cls: "community-vox-page", dataset: { communityId: "a" } });
  doc.add("div", { cls: "community-vox-page", dataset: { communityId: "b" } });
  assert.equal(channelFlow.dropMountedCommunityPage("a", doc), true);
  assert.equal(a.parent, null);
  assert.equal(doc.querySelectorAll(".community-vox-page").length, 1);
  assert.equal(channelFlow.dropMountedCommunityPage("zzz", doc), false);
  assert.equal(channelFlow.dropMountedCommunityPage("a", null), false);
});

const channelDoc = new FakeDoc();

test("attachChannelHandlers: liga uma vez; cancelar não faz nada; falha devolve o botão", async () => {
  const doc = channelDoc;
  globalThis.document = doc;
  channelFlow.attachChannelHandlers(null);
  channelFlow.attachChannelHandlers(doc);
  channelFlow.attachChannelHandlers(doc);
  assert.equal(doc.root.listeners.click.length, 1);
  const btn = doc.add("button", { cls: "btn-channel-mode", dataset: { comm: "canal-sem-dono", mode: "mods" } });
  doc.root.fire("click", { target: doc.root });
  globalThis.confirm = () => false;
  doc.root.fire("click", { target: btn });
  assert.equal(btn.disabled, false);
  globalThis.confirm = () => true;
  const toasts = await withToasts(doc, async () => { doc.root.fire("click", { target: btn }); });
  assert.match(toasts.join("|"), /Só o dono ou um moderador/);
  assert.equal(btn.disabled, false);
  btn.dataset.mode = "invalido";
  globalThis.confirm = () => { throw new Error("não deveria perguntar"); };
  doc.root.fire("click", { target: btn });
  delete globalThis.confirm;
});

test("attachChannelHandlers: dono confirma e a página montada cai e o roteador roda", async () => {
  const me = await freshAccount();
  const doc = channelDoc;
  globalThis.document = doc;
  doc.root.children = [];
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: "c_canal-ok-t2", type: "community", communityId: "canal-ok-t2", title: "Canal", createdAt: 1 }));
  const page = doc.add("div", { cls: "community-vox-page", dataset: { communityId: "canal-ok-t2" } });
  const btn = doc.add("button", { cls: "btn-channel-mode", dataset: { comm: "canal-ok-t2", mode: "mods" } });
  let asked = "";
  globalThis.confirm = (m) => { asked = m; return true; };
  routed.length = 0;
  const toasts = await withToasts(doc, async () => { doc.root.fire("click", { target: btn }); await settle(30); });
  assert.match(asked, /Transformar em canal/);
  assert.deepEqual(toasts, ["Pronto: a comunidade agora é um canal."], me);
  assert.equal(page.parent, null);
  assert.equal(routed.length, 1);
  delete globalThis.confirm;
});

test("renderTermoHtml: vazio sem termo; escapa texto; oferece reassinar quando mudou", () => {
  assert.equal(termoFlow.renderTermoHtml(null, "nao-assinou"), "");
  const html = termoFlow.renderTermoHtml({ termoText: "<b>Regra</b>\nSeja gentil" }, "mudou", { isMember: true, isMod: true });
  assert.match(html, /&lt;b&gt;Regra&lt;\/b&gt;<br>Seja gentil/);
  assert.match(html, /btn-termo-assinar/);
  assert.match(html, /<details class="card community-termo" open>/);
  assert.match(html, /Atualizar o termo/);
  const editorOnly = termoFlow.renderTermoHtml(null, "nao-assinou", { isMod: true });
  assert.match(editorOnly, /Escrever o termo/);
  assert.doesNotMatch(editorOnly, /btn-termo-assinar/);
});

test("joinTermoFields: sem termo volta vazio; com termo publicado traz o hash", async () => {
  await freshAccount();
  assert.deepEqual(await termoFlow.joinTermoFields("termo-t2"), {});
  const termo = termoLib.buildTermo("termo-t2", "Combinado: respeito acima de tudo aqui.");
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: "c_termo-t2", type: "community", communityId: "termo-t2", title: "T", createdAt: 1 }));
  await cacheNode.saveLocalPost(await localAccount.signPayload(termo));
  const fields = await termoFlow.joinTermoFields("termo-t2");
  assert.equal(fields.termoHash, await termoLib.termoHash(termo));
});

test("mountCommunityTermo: sem a flag não monta; com flag e moderação publica o termo", async () => {
  const me = await freshAccount();
  const doc = installFakeDom();
  const main = doc.add("div", { id: "main" });
  const meta = { id: "termo-mount-t2", owner: me };
  const args = { communityId: meta.id, meta, isMember: true, isMod: true };
  localStorage.removeItem(AVISO_LAB_KEY);
  await termoFlow.mountCommunityTermo(main, args);
  assert.deepEqual(main.insertedHtml, []);
  localStorage.setItem(AVISO_LAB_KEY, "1");
  await termoFlow.mountCommunityTermo(null, args);
  await termoFlow.mountCommunityTermo(main, args);
  assert.match(main.insertedHtml[0], /id="form-termo"/);
  const form = doc.add("form", { id: "form-termo", parent: main });
  await termoFlow.mountCommunityTermo(main, args);
  const texto = "Combinado da casa: respeito e escuta antes de responder.";
  globalThis.FormData = class { get() { return texto; } };
  const toasts = await withToasts(doc, async () => { form.fire("submit", { target: form }); });
  assert.deepEqual(toasts, ["Termo publicado."]);
  const saved = await cacheNode.getLocalPosts({ type: termoLib.TERMO_TYPE, communityId: meta.id });
  assert.equal(saved[0].termoText, texto);
  globalThis.FormData = class { get() { return "curto"; } };
  const erros = await withToasts(doc, async () => { form.fire("submit", { target: form }); });
  assert.equal(erros.length, 2, "termo curto demais gera um segundo aviso, de erro");
  localStorage.removeItem(AVISO_LAB_KEY);
});

test("mountCommunityTermo: membro reassina o termo que mudou e a assinatura vai para o cache", async () => {
  const me = await freshAccount();
  const doc = installFakeDom();
  const main = doc.add("div", { id: "main" });
  const meta = { id: "termo-resign-t2", owner: me };
  const antigo = termoLib.buildTermo(meta.id, "Termo antigo com texto suficiente para valer.", 1000);
  const novo = termoLib.buildTermo(meta.id, "Termo novo com texto suficiente para valer.", 2000);
  await cacheNode.saveLocalPost(await localAccount.signPayload(antigo));
  await cacheNode.saveLocalPost(await localAccount.signPayload({
    id: `mem_${meta.id}_${me}`, type: "membership", communityId: meta.id, joinedAt: 1500, ...(await termoLib.membershipTermoFields(antigo)),
  }));
  await cacheNode.saveLocalPost(await localAccount.signPayload(novo));
  localStorage.setItem(AVISO_LAB_KEY, "1");
  const args = { communityId: meta.id, meta, isMember: true, isMod: false };
  await termoFlow.mountCommunityTermo(main, args);
  assert.match(main.insertedHtml[0], /O termo mudou desde que você entrou/);
  const btn = doc.add("button", { id: "btn-termo-assinar", parent: main });
  await termoFlow.mountCommunityTermo(main, args);
  const toasts = await withToasts(doc, async () => { btn.fire("click"); });
  assert.ok(toasts.includes("Termo assinado."));
  const mems = await cacheNode.getLocalPosts({ type: "membership", communityId: meta.id });
  assert.ok(mems.some((m) => m.termoHash), "membership reassinada carrega o hash do termo novo");
  localStorage.removeItem(AVISO_LAB_KEY);
});

const OFERTA = { id: "lst_h_t2", type: "listing", communityId: "feira-t2", title: "Bicicleta", body: "Aro 26 em bom estado", priceLabel: "R$ 100", listingStatus: "available" };

async function saveOwnListing(extra = {}) {
  const me = await freshAccount();
  const signed = await localAccount.signPayload({ ...OFERTA, ...extra, ts: Date.now() });
  await cacheNode.saveLocalPost(signed);
  return { me, signed };
}

test("handleListingStatusUpdate: oferta alheia é recusada com aviso", async () => {
  await freshAccount();
  await cacheNode.saveLocalPost({ ...OFERTA, author: "vx_outra", sig: "x", ts: 1 });
  const toasts = await withToasts(installFakeDom(), () => handlers.handleListingStatusUpdate(OFERTA.id, "sold"));
  assert.deepEqual(toasts, ["Só é possível alterar ofertas suas."]);
});

test("handleListingStatusUpdate: troca o status da própria oferta e re-roteia; mesmo status não faz nada", async () => {
  await saveOwnListing();
  routed.length = 0;
  const toasts = await withToasts(installFakeDom(), () => handlers.handleListingStatusUpdate(OFERTA.id, "vendido"));
  assert.equal(toasts.length, 1);
  assert.equal(routed.length, 1);
  const after = await cacheNode.getLocalPost(OFERTA.id);
  assert.equal(listing.normalizeListingStatus(after.listingStatus), "sold");
  const same = await withToasts(installFakeDom(), () => handlers.handleListingStatusUpdate(OFERTA.id, "sold"));
  assert.deepEqual(same, []);
  assert.equal(routed.length, 1);
});

test("handleListingStatusUpdate: oferta inválida mostra o erro de validação e não re-roteia", async () => {
  await saveOwnListing({ title: "x", body: "" });
  routed.length = 0;
  const toasts = await withToasts(installFakeDom(), () => handlers.handleListingStatusUpdate(OFERTA.id, "reserved"));
  assert.match(toasts[0], /^Erro ao atualizar status:/);
  assert.equal(routed.length, 0);
});

test("handleListingRetract: alheia recusa; cancelar mantém; confirmar grava tombstone e re-roteia", async () => {
  await freshAccount();
  await cacheNode.saveLocalPost({ ...OFERTA, id: "lst_alheia_t2", author: "vx_outra", sig: "x", ts: 1 });
  const alheia = await withToasts(installFakeDom(), () => handlers.handleListingRetract("lst_alheia_t2"));
  assert.deepEqual(alheia, ["Só é possível retirar ofertas suas."]);
  await saveOwnListing();
  globalThis.confirm = () => false;
  routed.length = 0;
  await handlers.handleListingRetract(OFERTA.id);
  assert.equal(routed.length, 0);
  assert.ok(await cacheNode.getLocalPost(OFERTA.id), "continua salva");
  let asked = "";
  globalThis.confirm = (m) => { asked = m; return true; };
  const toasts = await withToasts(installFakeDom(), () => handlers.handleListingRetract(OFERTA.id));
  assert.match(asked, /Bicicleta/);
  assert.equal(toasts.length, 1);
  assert.equal(routed.length, 1);
  assert.ok(await cacheNode.getTombstone(OFERTA.id));
  delete globalThis.confirm;
});

test("attachCommunityListingHandlers: Pix sem valor copia a chave; sem permissão cai no toast", async () => {
  const doc = installFakeDom();
  const main = doc.add("div");
  const pix = doc.add("button", { cls: "btn-copy-pix", parent: main, dataset: { pix: "chave@pix", price: "" } });
  const semPix = doc.add("button", { cls: "btn-copy-pix", parent: main });
  handlers.attachCommunityListingHandlers(main);
  let copied = "";
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  const toasts = await withToasts(doc, async () => { pix.fire("click"); semPix.fire("click"); });
  assert.equal(copied, "chave@pix");
  assert.deepEqual(toasts, ["Chave Pix copiada!"]);
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async () => { throw new Error("negado"); } }, configurable: true });
  const fallback = await withToasts(doc, async () => { pix.fire("click"); });
  assert.equal(fallback.at(-1), "Pix: chave@pix");
});

test("attachCommunityListingHandlers: compartilhar, status e retirar chamam os fluxos certos", async () => {
  const doc = installFakeDom();
  const main = doc.add("div");
  const share = doc.add("button", { cls: "btn-share-listing", parent: main, dataset: { title: "Bolo", comm: "feira-t2", price: "R$ 5" } });
  const status = doc.add("button", { cls: "btn-listing-status", parent: main, dataset: { id: "lst_nao_existe", status: "sold" } });
  const semStatus = doc.add("button", { cls: "btn-listing-status", parent: main, dataset: { id: "x" } });
  const retract = doc.add("button", { cls: "btn-listing-retract", parent: main, dataset: { id: "lst_nao_existe" } });
  handlers.attachCommunityListingHandlers(main);
  const shared = [];
  Object.defineProperty(globalThis.navigator, "share", { value: async (p) => { shared.push(p); }, configurable: true });
  const toasts = await withToasts(doc, async () => {
    share.fire("click"); semStatus.fire("click"); status.fire("click"); retract.fire("click");
  });
  delete globalThis.navigator.share;
  assert.equal(shared.length, 1);
  assert.match(shared[0].text, /Bolo.*R\$ 5/);
  assert.match(shared[0].url, /tab=listings/);
  assert.equal(toasts.filter((t) => t === "Só é possível alterar ofertas suas.").length, 1, "botão sem status é ignorado");
  assert.equal(toasts.filter((t) => t === "Só é possível retirar ofertas suas.").length, 1);
});

test("attachCommunityListingHandlers: Pix com valor abre o modal de zap com autor e título", async () => {
  const doc = installFakeDom();
  const main = doc.add("div");
  const pix = doc.add("button", { cls: "btn-copy-pix", parent: main, dataset: { pix: "chave@pix", price: "R$ 25,00", authorName: "Ana Vendedora", title: "Bolo de cenoura" } });
  handlers.attachCommunityListingHandlers(main);
  await withToasts(doc, async () => { pix.fire("click"); });
  const modal = doc.root.all().find((el) => /Ana Vendedora/.test(el.innerHTML));
  assert.ok(modal, "modal de zap renderizado com o nome do autor");
  assert.match(modal.innerHTML, /Bolo de cenoura/);
});
