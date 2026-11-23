/**
 * @file Cobertura T2: telas da comunidade (`screens-community`), do tópico (`community-topic-screen`)
 * e criação de comunidade (`compose-community`), sobre um DOM falso e o render real.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakeDom, withToasts, settle, installImageFakes } from "./helpers/cov-t2-dom.mjs";

const remote = { replies: [], topic: null };
const jsonRes = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const GATEWAYS = JSON.parse(readFileSync(new URL("../client/config/gateways.json", import.meta.url), "utf8"));
globalThis.fetch = async (url, init) => {
  if (String(url).includes("gateways.json")) return jsonRes(GATEWAYS);
  const q = init?.body ? JSON.parse(init.body).query : "";
  if (q.includes("ListReplies")) return jsonRes({ data: { transactions: { edges: remote.replies.map((node) => ({ node })) } } });
  if (q.includes("GetTopic")) return jsonRes({ data: { transaction: remote.topic } });
  throw new Error("offline");
};

const sc = await import("../client/js/app/screens-community.js");
const ts = await import("../client/js/app/community-topic-screen.js");
const cc = await import("../client/js/app/compose-community.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/index.js");
const navigation = await import("../client/js/app/navigation.js");
const newKeyGuard = await import("../client/js/new-key-guard.js");
const seed = await import("../client/js/community-seed-checklist.js");
const profileDirectory = await import("../client/js/profile-directory.js");
const peersEvents = await import("../client/js/peers-events.js");
const featureFlags = await import("../client/js/feature-flags.js");
const mod = await import("../client/js/moderation.js");
const i18n = await import("../client/js/i18n-pt-br.js");

const routed = [];
navigation.setRoute(async () => { routed.push(globalThis.location.hash); });

async function account() {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  return localAccount.getRouteId();
}

/** Documento com a raiz do shell já montada (`app-root` e `app-main`). */
function shell() {
  const doc = installFakeDom();
  doc.add("div", { id: "app-root" });
  const main = doc.add("main", { id: "app-main" });
  return { doc, main };
}

const comunidade = (id, extra = {}) => cacheNode.saveLocalPost({
  id: `c_${id}`, type: "community", communityId: id, title: `Com ${id}`, author: "vx_dono_scr", createdAt: 1, ...extra,
});

test("showCommunity: monta a página completa e o botão de participar grava a entrada", async () => {
  await account();
  await comunidade("bairro-scr");
  const { doc, main } = shell();
  const join = doc.add("button", { id: "btn-join-comm", parent: main });
  await sc.showCommunity("bairro-scr", "posts");
  assert.match(main.innerHTML, /community-vox-page/);
  assert.match(main.innerHTML, /Com bairro-scr/);
  routed.length = 0;
  const toasts = await withToasts(doc, async () => { join.fire("click"); });
  assert.deepEqual(toasts, [i18n.joinedToast]);
  assert.equal(join.textContent, "Gravando…");
  assert.equal(routed.length, 1);
  const mems = await cacheNode.getLocalPosts({ type: "membership", communityId: "bairro-scr" });
  assert.equal(mems.length, 1);
  assert.match(mems[0].id, /^mem_bairro-scr_vx_/);
});

test("showCommunity: membro vê Sair e a saída grava membership_leave", async () => {
  const me = await account();
  await comunidade("saida-scr");
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: `mem_saida-scr_${me}`, type: "membership", communityId: "saida-scr", joinedAt: 1 }));
  const { doc, main } = shell();
  const leave = doc.add("button", { id: "btn-leave-comm", parent: main });
  const join = doc.add("button", { id: "btn-join-comm", parent: main });
  await sc.showCommunity("saida-scr", "posts");
  join.fire("click");
  const toasts = await withToasts(doc, async () => { leave.fire("click"); });
  assert.deepEqual(toasts, [i18n.leftToast]);
  assert.equal((await cacheNode.getLocalPosts({ type: "membership", communityId: "saida-scr" })).length, 1, "membro não cria nova entrada");
  assert.equal((await cacheNode.getLocalPosts({ type: "membership_leave", communityId: "saida-scr" })).length, 1);
});

test("showCommunity: falha ao assinar a entrada avisa e devolve o botão", async () => {
  await account();
  await comunidade("falha-scr");
  const { doc, main } = shell();
  const join = doc.add("button", { id: "btn-join-comm", parent: main });
  await sc.showCommunity("falha-scr", "posts");
  const original = globalThis.crypto.subtle.sign;
  globalThis.crypto.subtle.sign = async () => { throw new Error("sem chave"); };
  let toasts;
  try {
    toasts = await withToasts(doc, async () => { join.fire("click"); });
  } finally {
    delete globalThis.crypto.subtle.sign;
    assert.equal(globalThis.crypto.subtle.sign, original);
  }
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /^Erro ao participar:/);
  assert.equal(join.disabled, false);
  assert.equal(join.textContent, "Participar da Comunidade");
});

test("showCommunity: com a página já montada só troca o conteúdo da aba e o indicador", async () => {
  await account();
  await comunidade("abas-scr");
  const { doc } = shell();
  const page = doc.add("div", { cls: "community-vox-page", dataset: { communityId: "abas-scr" } });
  const slot = doc.add("div", { id: "community-tab-content", parent: page });
  const nav = doc.add("nav", { cls: "community-vox-nav", parent: page });
  const posts = doc.add("button", { cls: "tab-btn active", parent: nav, dataset: { tab: "posts" } });
  const members = doc.add("button", { cls: "tab-btn", parent: nav, dataset: { tab: "members" } });
  await sc.showCommunity("abas-scr", "members");
  assert.equal(members.classList.contains("active"), true);
  assert.equal(posts.classList.contains("active"), false);
  assert.notEqual(slot.innerHTML, "");
  await sc.showCommunity("abas-scr", "qualquer");
  assert.equal(posts.classList.contains("active"), true, "aba desconhecida cai em posts");
});

test("showCommunity: proposta aprovada liga o comércio e a aba de ofertas mostra o conteúdo", async () => {
  await account();
  await comunidade("feira-scr");
  await cacheNode.saveLocalPost({ id: "prop_scr", type: "governance-proposal", communityId: "feira-scr", state: "merged", diffText: "commercialEnabled: true", author: "vx_dono_scr", ts: 1 });
  const { doc } = shell();
  const page = doc.add("div", { cls: "community-vox-page", dataset: { communityId: "feira-scr" } });
  const slot = doc.add("div", { id: "community-tab-content", parent: page });
  await sc.showCommunity("feira-scr", "listings");
  assert.notEqual(slot.innerHTML, "");
  const semProposta = slot.innerHTML;
  await cacheNode.clearLocalPosts();
  await comunidade("feira-scr");
  await sc.showCommunity("feira-scr", "listings");
  assert.notEqual(slot.innerHTML, semProposta, "o comércio ligado muda o que a aba mostra");
});

test("showCommunity: posts de chave nova recolhidos mostram aviso e 'ver mesmo assim' revela", async () => {
  await account();
  await comunidade("quarentena-scr", { newKeyQuarantine: true });
  const tresDias = 3 * 24 * 60 * 60 * 1000;
  localStorage.setItem(newKeyGuard.FIRST_SEEN_STORAGE_KEY, JSON.stringify({ since: Date.now() - tresDias, keys: {} }));
  await cacheNode.saveLocalPost({ id: "top_novo_scr", type: "topic", communityId: "quarentena-scr", title: "De chave nova", body: "x", author: "vx_chave_nova_scr", ts: Date.now() });
  const { doc, main } = shell();
  const reveal = doc.add("button", { cls: "btn-reveal-new-keys", parent: main });
  const notice = doc.add("p", { cls: "community-newkey-notice", parent: main });
  await sc.showCommunity("quarentena-scr", "posts");
  assert.match(main.insertedHtml.join(""), /community-newkey-notice/);
  assert.match(main.insertedHtml.join(""), /1 post de chave nova está recolhido/);
  const page = doc.add("div", { cls: "community-vox-page", parent: main });
  reveal.fire("click");
  assert.equal(newKeyGuard.isHeldRevealed("quarentena-scr"), true);
  assert.equal(notice.parent, null);
  assert.equal(page.parent, null);
  await settle();
});

test("showCommunity: dono em comunidade recém-criada ganha o checklist e o convite avança", async () => {
  const me = await account();
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: "c_semente-scr", type: "community", communityId: "semente-scr", title: "Semente", createdAt: 1 }));
  seed.markSeedPending("semente-scr");
  const { doc, main } = shell();
  const invite = doc.add("button", { id: "btn-seed-invite", parent: main });
  await sc.showCommunity("semente-scr", "posts");
  Object.defineProperty(globalThis.navigator, "share", { value: async () => {}, configurable: true });
  await withToasts(doc, async () => { invite.fire("click"); });
  delete globalThis.navigator.share;
  assert.equal(seed.loadSeedState("semente-scr").invitesSent, 1, me);
});

const TOPICO = { id: "top_scr_1", type: "topic", communityId: "debate-scr", title: "Pauta da semana", body: "Corpo da pauta", ts: 5 };

test("resolveTopicContent: boas-vindas oficial resolve sem rede", async () => {
  const out = await ts.resolveTopicContent("vox-official-manifesto-welcome", "vox", "vx_x");
  assert.equal(out.isOfficial, true);
  assert.equal(out.isLocal, true);
  assert.equal(out.topic.isOfficial, true);
  assert.equal(out.topicData.body, out.topic.body);
});

test("resolveTopicContent: tópico local marca dono e posse; ausente cai no fallback remoto", async () => {
  const me = await account();
  await cacheNode.saveLocalPost(await localAccount.signPayload(TOPICO));
  const own = await ts.resolveTopicContent(TOPICO.id, "", me);
  assert.equal(own.isLocal, true);
  assert.equal(own.topic.owner, me);
  assert.equal(own.topic.isOwnLocalPost, true);
  assert.equal(own.topicData.body, "Corpo da pauta");
  remote.topic = null;
  const ausente = await ts.resolveTopicContent("nao-existe-scr", "outra-com", me);
  assert.equal(ausente.isLocal, false);
  assert.deepEqual(ausente.topic, { title: "Tópico", owner: "", communityId: "outra-com" });
  assert.deepEqual(ausente.topicData, { body: "", raw: "" });
});

test("resolveTopicContent: tópico remoto vem do gateway com título e comunidade", async () => {
  remote.topic = { id: "rtx_1", owner: { address: "ar_dono" }, tags: [{ name: "Title", value: "Remoto" }, { name: "Community-Id", value: "remo-com" }] };
  const out = await ts.resolveTopicContent("rtx_1", "", "vx_x");
  assert.equal(out.isLocal, false);
  assert.equal(out.topic.title, "Remoto");
  assert.equal(out.topic.communityId, "remo-com");
  remote.topic = null;
});

test("showTopic: boas-vindas oficial renderiza e o compartilhar usa o título do tópico", async () => {
  await account();
  const { doc, main } = shell();
  const share = doc.add("button", { id: "btn-share-topic" });
  await ts.showTopic("vox-official-manifesto-welcome", "vox");
  assert.match(main.innerHTML, /post-author|reply|topic/i);
  const shared = [];
  Object.defineProperty(globalThis.navigator, "share", { value: async (p) => { shared.push(p); }, configurable: true });
  const normal = await withToasts(doc, async () => { share.fire("click"); });
  delete globalThis.navigator.share;
  assert.deepEqual(normal, [], "post fora da quarentena abre o compartilhar sem aviso");
  assert.deepEqual(shared, []);
  mod.quarantinePost("vox-official-manifesto-welcome");
  const quarentena = await withToasts(doc, async () => { share.fire("click"); });
  mod.unquarantinePost("vox-official-manifesto-welcome");
  assert.deepEqual(quarentena, [mod.QUARANTINE_HINT]);
});

test("showTopic: respostas locais e remotas se fundem sem duplicar; corpo vazio é hidratado do cache", async () => {
  const me = await account();
  await cacheNode.saveLocalPost(await localAccount.signPayload(TOPICO));
  await cacheNode.saveLocalPost(await localAccount.signPayload({ id: "rep_local_scr", type: "reply", replyTo: TOPICO.id, communityId: "debate-scr", body: "Resposta local", ts: 6 }));
  remote.replies = [
    { id: "rep_local_scr", tags: [{ name: "Reply-To", value: TOPICO.id }], owner: { address: "ar_1" } },
    { id: "rep_remota_scr", tags: [{ name: "Reply-To", value: TOPICO.id }], owner: { address: "ar_2" } },
  ];
  await cacheNode.setCachedTx("rep_remota_scr", { body: "Texto vindo do cache", raw: "" });
  const { doc, main } = shell();
  const body = doc.add("p", { cls: "reply-body" });
  const holder = doc.add("div", { id: "reply-rep_remota_scr" });
  body.parent = null;
  holder.appendChild(body);
  await ts.showTopic(TOPICO.id, "");
  await settle(30);
  assert.equal(body.textContent, "Texto vindo do cache");
  assert.ok(main.innerHTML.includes("Pauta da semana"), me);
  remote.replies = [];
});

test("showTopic: ações de moderação assinam, avisam, re-roteiam e ocultar remove o item", async () => {
  await account();
  await cacheNode.saveLocalPost(await localAccount.signPayload(TOPICO));
  const { doc } = shell();
  const pin = doc.add("button", { cls: "btn-mod-action", dataset: { id: TOPICO.id, action: "pin" } });
  const incompleto = doc.add("button", { cls: "btn-mod-action", dataset: { id: TOPICO.id } });
  const item = doc.add("div", { cls: "reply-item" });
  const hide = doc.add("button", { cls: "btn-mod-hide", parent: item, dataset: { id: "rep_x" } });
  await ts.showTopic(TOPICO.id, "");
  routed.length = 0;
  const toasts = await withToasts(doc, async () => { pin.fire("click"); incompleto.fire("click"); });
  assert.deepEqual(toasts, ["Tópico fixado no topo!"]);
  assert.equal(incompleto.disabled, false);
  assert.equal(routed.length, 1);
  globalThis.confirm = () => false;
  hide.fire("click");
  assert.notEqual(item.parent, null);
  globalThis.confirm = () => true;
  const ocultar = await withToasts(doc, async () => { hide.fire("click"); });
  delete globalThis.confirm;
  assert.deepEqual(ocultar, ["Item ocultado."]);
  assert.equal(item.parent, null);
  const acts = await cacheNode.getLocalPosts({ type: "mod-action", communityId: "debate-scr" });
  assert.deepEqual(acts.map((a) => a.action).sort(), ["hide", "pin"]);
});

test("showTopic: ação de moderação desconhecida usa o aviso genérico", async () => {
  await account();
  await cacheNode.saveLocalPost(await localAccount.signPayload(TOPICO));
  const { doc } = shell();
  const btn = doc.add("button", { cls: "btn-mod-action", dataset: { id: TOPICO.id, action: "outra" } });
  await ts.showTopic(TOPICO.id, "");
  const toasts = await withToasts(doc, async () => { btn.fire("click"); });
  assert.deepEqual(toasts, ["Ação de moderação aplicada."]);
});

test("showTopic: gossip de autor da conversa atualiza nome e avatar na tela", async () => {
  const me = await account();
  await cacheNode.saveLocalPost(await localAccount.signPayload(TOPICO));
  profileDirectory.setProfileCard(me, { name: "Nome Novo", avatarUrl: "https://exemplo.test/a.png" });
  const { doc } = shell();
  const link = doc.add("a", { cls: "post-author", href: `#/u/${encodeURIComponent(me)}` });
  link.setAttribute("href", `#/u/${encodeURIComponent(me)}`);
  const alink = doc.add("a", { cls: "avatar-link" });
  alink.setAttribute("href", `#/u/${encodeURIComponent(me)}`);
  const img = doc.add("img", { cls: "avatar-img", parent: alink });
  await ts.showTopic(TOPICO.id, "");
  peersEvents.dispatchGossipPost({ author: "vx_desconhecido_scr" });
  peersEvents.dispatchGossipPost({});
  assert.notEqual(link.textContent, "Nome Novo", "autor fora da conversa é ignorado");
  peersEvents.dispatchGossipPost({ author: me });
  assert.equal(link.textContent, "Nome Novo");
  assert.equal(img.src, "https://exemplo.test/a.png");
});

test("showTopic: tópico inexistente em qualquer fonte renderiza o título padrão", async () => {
  await account();
  const { main } = shell();
  remote.replies = [];
  await ts.showTopic("sem-nada-scr", "com-scr");
  assert.match(main.innerHTML, /Tópico/);
});

const formCriar = () => {
  const doc = installFakeDom();
  doc.add("div", { id: "app-root" });
  doc.add("main", { id: "app-main" });
  const f = (id, over = {}) => doc.add("input", { id, ...over });
  return {
    doc, form: doc.add("form", { id: "form-compose-community" }),
    id: f("comm-id", { value: " Meu-Bairro " }), title: f("comm-title", { value: " Meu Bairro " }),
    category: f("comm-category", { value: "" }), desc: f("comm-desc", { value: "Descrição" }),
    type: f("comm-type", { value: "" }), quarantine: f("comm-new-key-quarantine", { checked: true }),
    url: f("comm-photo-url", { value: "" }), file: f("comm-photo-file"),
    preview: doc.add("div", { id: "comm-photo-preview" }), submit: doc.add("button", { id: "btn-submit-comm" }),
  };
};

test("updateCommunityPhotoPreview: com imagem mostra <img>; sem imagem mostra a inicial", () => {
  const { doc, preview } = formCriar();
  cc.updateCommunityPhotoPreview(null, "x");
  cc.updateCommunityPhotoPreview(preview, "data:image/png;base64,AAAA");
  assert.equal(preview.children[0].tagName, "IMG");
  assert.equal(preview.children[0].alt, "Preview");
  cc.updateCommunityPhotoPreview(preview, "", "Z");
  assert.equal(preview.children.length, 1);
  assert.equal(preview.children[0].textContent, "Z");
  assert.equal(preview.children[0].className, "community-avatar-fallback");
  assert.ok(doc);
});

test("compose comunidade: pausa pelo kill-switch mostra o aviso e não monta o formulário", async () => {
  await account();
  const { doc, form, main = doc.getElementById("app-main") } = formCriar();
  featureFlags.applyFlags({ flags: { communityCreate: false } });
  try {
    await cc.showComposeCommunity();
  } finally {
    featureFlags.applyFlags({});
  }
  assert.equal(form.listeners.submit, undefined, "formulário não é ligado quando pausado");
  assert.match(main.innerHTML, /pausad|indispon/i);
});

test("compose comunidade: foto por URL, por título e por arquivo atualizam a prévia", async () => {
  await account();
  installImageFakes();
  const t = formCriar();
  await cc.showComposeCommunity();
  t.title.value = "Zeca";
  t.title.fire("input", { target: t.title });
  assert.equal(t.preview.children[0].textContent, "Z");
  t.url.value = "data:image/png;base64,AAAA";
  t.url.fire("input", { target: t.url });
  assert.equal(t.preview.children[0].src, "data:image/png;base64,AAAA");
  t.title.fire("input", { target: t.title });
  assert.equal(t.preview.children[0].tagName, "IMG", "foto escolhida não volta para a inicial");
  t.url.value = "javascript:alert(1)";
  t.url.fire("input", { target: t.url });
  assert.equal(t.preview.children[0].textContent, "Z");
  t.file.files = [];
  t.file.fire("change", { target: t.file });
  t.file.files = [{ type: "text/plain", size: 3 }];
  const erro = await withToasts(t.doc, async () => { t.file.fire("change", { target: t.file }); });
  assert.deepEqual(erro, ["Formato não suportado. Use JPEG, PNG, WebP ou GIF."]);
  t.file.files = [{ type: "image/png", size: 3 }];
  t.file.fire("change", { target: t.file });
  await settle();
  assert.match(t.preview.children[0].src, /^data:image\/jpeg/);
  globalThis.Image = class { set src(_v) { queueMicrotask(() => this.onerror?.()); } };
  const falha = await withToasts(t.doc, async () => { t.file.fire("change", { target: t.file }); });
  assert.deepEqual(falha, ["Imagem inválida"]);
});

test("compose comunidade: enviar assina a comunidade, marca a semente e navega para ela", async () => {
  await account();
  const t = formCriar();
  await cc.showComposeCommunity();
  t.url.value = "data:image/png;base64,AAAA";
  const toasts = await withToasts(t.doc, async () => { t.form.fire("submit", { target: t.form }); await settle(30); });
  assert.deepEqual(toasts, ["Comunidade criada na rede!"]);
  assert.equal(globalThis.location.hash, "#/c/meu-bairro?seed=1");
  const [saved] = await cacheNode.getLocalPosts({ type: "community", communityId: "meu-bairro" });
  assert.equal(saved.title, "Meu Bairro");
  assert.equal(saved.category, "Geral");
  assert.equal(saved.visibility, "open");
  assert.equal(saved.newKeyQuarantine, true);
  assert.equal(saved.image, "data:image/png;base64,AAAA");
  assert.equal(seed.getSeedPendingCommunityId(), "meu-bairro");
  globalThis.location.hash = "#/";
});

test("compose comunidade: falha ao assinar avisa e devolve o botão", async () => {
  await account();
  const t = formCriar();
  await cc.showComposeCommunity();
  globalThis.crypto.subtle.sign = async () => { throw new Error("sem chave"); };
  let toasts;
  try {
    toasts = await withToasts(t.doc, async () => { t.form.fire("submit", { target: t.form }); await settle(30); });
  } finally {
    delete globalThis.crypto.subtle.sign;
  }
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /^Erro:/);
  assert.equal(t.submit.disabled, false);
  assert.equal(t.submit.textContent, "Publicar Comunidade");
});
