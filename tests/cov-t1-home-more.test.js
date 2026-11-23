/**
 * @file Cobertura de `app/screens-home.js` (lote T1), parte 2: assinaturas do Bluesky, lista de
 * comunidades com não lidas e feed por tag.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as bsky from "../client/js/bsky-feed.js";
import * as unread from "../client/js/community-unread.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as home from "../client/js/app/screens-home.js";

const dom = installFakeDom();
const realFetch = globalThis.fetch;
let seq = 0;

before(async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  dom.reset();
});

const offline = () => { globalThis.fetch = async () => { throw new Error("offline"); }; };
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function bskyForm() {
  return {
    form: dom.add("form-add-bsky"),
    input: Object.assign(dom.add("input-bsky-handle"), { value: "" }),
  };
}

test("bluesky — formulário ignora campo vazio e adiciona o perfil digitado, limpando o campo e atualizando", () => {
  const f = bskyForm();
  let refreshed = 0;
  home.attachBskyManagerHandlers(() => { refreshed += 1; });
  const before = bsky.loadBskySubscriptions().length;
  f.input.value = "   ";
  assert.equal(f.form.fire("submit").defaultPrevented, true);
  assert.equal(bsky.loadBskySubscriptions().length, before);
  f.input.value = "  t1fulano.bsky.social ";
  f.form.fire("submit");
  assert.ok(bsky.loadBskySubscriptions().includes("t1fulano.bsky.social"));
  assert.equal(f.input.value, "");
  assert.equal(refreshed, 1);
  bsky.removeBskySubscription("t1fulano.bsky.social");
});

test("bluesky — ligar os handlers duas vezes no mesmo formulário não duplica o ouvinte", () => {
  const f = bskyForm();
  home.attachBskyManagerHandlers(() => {});
  home.attachBskyManagerHandlers(() => {});
  assert.equal(f.form.listeners.get("submit").length, 1);
  assert.equal(f.form.dataset.wired, "1");
});

function importFixture() {
  return {
    btn: dom.add("btn-import-bsky-follows"),
    input: Object.assign(dom.add("input-bsky-import-me"), { value: "" }),
  };
}

test("bluesky — importar sem @handle não faz nada; com handle importa os perfis e restaura o botão", async () => {
  const f = importFixture();
  let refreshed = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ follows: [{ handle: "t1amiga.bsky.social" }, { handle: "t1amigo.bsky.social" }] }) });
  home.attachBskyManagerHandlers(() => { refreshed += 1; });
  f.btn.fire("click");
  await settle();
  assert.equal(refreshed, 0);
  f.input.value = "eu.bsky.social";
  f.btn.fire("click");
  assert.equal(f.btn.disabled, true);
  assert.equal(f.btn.textContent, "Importando...");
  await settle();
  const subs = bsky.loadBskySubscriptions();
  assert.ok(subs.includes("t1amiga.bsky.social") && subs.includes("t1amigo.bsky.social"));
  assert.equal(f.input.value, "");
  assert.equal(refreshed, 1);
  assert.equal(f.btn.disabled, false);
  assert.match(f.btn.textContent, /Puxar quem eu sigo/);
  bsky.removeBskySubscription("t1amiga.bsky.social");
  bsky.removeBskySubscription("t1amigo.bsky.social");
});

test("bluesky — importação com a API fora do ar não quebra e devolve o botão ao normal", async () => {
  const f = importFixture();
  offline();
  home.attachBskyManagerHandlers(() => {});
  f.input.value = "eu.bsky.social";
  f.btn.fire("click");
  await settle();
  assert.equal(f.btn.disabled, false);
  assert.match(f.btn.textContent, /Puxar quem eu sigo/);
});

test("bluesky — chips adicionam e removem assinaturas; botão sem handle é ignorado", () => {
  const add = Object.assign(makeEl(), { dataset: { handle: "t1chip.bsky.social" } });
  const addBlank = makeEl();
  const remove = Object.assign(makeEl(), { dataset: { handle: "t1chip.bsky.social" } });
  const removeBlank = makeEl();
  dom.group(".btn-add-suggestion", [add, addBlank]);
  dom.group(".btn-remove-bsky-sub", [remove, removeBlank]);
  let refreshed = 0;
  home.attachBskyManagerHandlers(() => { refreshed += 1; });
  addBlank.fire("click");
  removeBlank.fire("click");
  assert.equal(refreshed, 0);
  add.fire("click");
  assert.ok(bsky.loadBskySubscriptions().includes("t1chip.bsky.social"));
  remove.fire("click");
  assert.equal(bsky.loadBskySubscriptions().includes("t1chip.bsky.social"), false);
  assert.equal(refreshed, 2);
});

test("comunidades — lista a oficial Vox e as locais; só conta não lidas de quem já visitou", async () => {
  offline();
  const id = `t1_comm_${++seq}`;
  await cacheNode.saveLocalPost({ id: `c_${id}`, type: "community", communityId: id, title: "Comunidade-visitada-T1", author: "vx_dono", ts: 1000 });
  await cacheNode.saveLocalPost({ id: `c_${id}_b`, type: "community", communityId: `${id}_b`, title: "Comunidade-nova-T1", author: "vx_dono", ts: 1000 });
  await cacheNode.saveLocalPost({ id: `p_${id}_1`, type: "topic", communityId: id, title: "novo 1", body: "x", author: "vx_a", ts: 3000 });
  await cacheNode.saveLocalPost({ id: `p_${id}_2`, type: "topic", communityId: id, title: "novo 2", body: "x", author: "vx_a", ts: 4000 });
  unread.markCommunitySeen(id, 2000);
  await home.showCommunities();
  const html = dom.main.innerHTML;
  assert.ok(html.includes("Comunidade-visitada-T1") && html.includes("Comunidade-nova-T1"));
  assert.ok(html.includes("Vox"), "a oficial entra mesmo sem estar no cache");
  assert.ok(html.includes("2 novidades"), "o banner soma só os 2 tópicos mais novos que a última visita");
  assert.ok(html.includes("2 novos"), "etiqueta da comunidade visitada");
});

test("tag — mostra só os posts com a hashtag e aceita o # na frente", async () => {
  const withTag = { id: `t1_tag_${++seq}`, type: "topic", communityId: "vox", title: "Post-com-tag-T1 #hortaT1", body: "x", author: "vx_a", ts: 7000 };
  const without = { id: `t1_tag_${++seq}`, type: "topic", communityId: "vox", title: "Post-sem-tag-T1", body: "x", author: "vx_a", ts: 7001 };
  await cacheNode.saveLocalPost(withTag);
  await cacheNode.saveLocalPost(without);
  await home.showTagFeed("#hortaT1");
  assert.ok(dom.main.innerHTML.includes("Post-com-tag-T1"));
  assert.equal(dom.main.innerHTML.includes("Post-sem-tag-T1"), false);
  assert.ok(dom.main.innerHTML.includes("#horta"), "título da tela usa o slug limpo");
});
