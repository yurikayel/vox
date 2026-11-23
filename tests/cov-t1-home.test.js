/**
 * @file Cobertura de `app/screens-home.js` (lote T1): feeds da Home, comunidades fechadas, citação externa,
 * gestão de assinaturas do Bluesky, lista de comunidades e feed por tag.
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import * as social from "../client/js/social.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as welcome from "../client/js/vox-welcome-profile.js";
import * as home from "../client/js/app/screens-home.js";

const dom = installFakeDom();
const realFetch = globalThis.fetch;
let me = "";
let seq = 0;
const DISMISS_KEY = "vox-welcome-post-dismissed";

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.removeItem(DISMISS_KEY);
  dom.reset();
});

const offline = () => { globalThis.fetch = async () => { throw new Error("offline"); }; };
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const topic = (over = {}) => ({ id: `t1_home_${++seq}`, type: "topic", communityId: "vox", title: `Titulo-home-${seq}`, body: "corpo", author: "vx_autor_home", ts: 5000 + seq, ...over });

test("home — for-you mostra o tópico local e o post de boas-vindas", async () => {
  offline();
  const t = topic();
  await cacheNode.saveLocalPost(t);
  await home.showHome("for-you");
  assert.ok(dom.main.innerHTML.includes(t.title));
  assert.ok(dom.main.innerHTML.includes(welcome.getOfficialWelcomeTopic().id), "boas-vindas presente");
});

test("home — feed desconhecido cai em for-you", async () => {
  offline();
  const t = topic();
  await cacheNode.saveLocalPost(t);
  await home.showHome("nao-existe");
  assert.ok(dom.main.innerHTML.includes(t.title));
});

test("home — civic não traz boas-vindas nem tópicos sociais comuns", async () => {
  offline();
  const t = topic();
  await cacheNode.saveLocalPost(t);
  await home.showHome("civic");
  assert.equal(dom.main.innerHTML.includes(t.title), false);
  assert.equal(dom.main.innerHTML.includes(welcome.getOfficialWelcomeTopic().id), false);
});

test("home — following mostra só tópicos de quem a pessoa acompanha", async () => {
  offline();
  const watched = topic({ author: "vx_seguido_home" });
  const stranger = topic({ author: "vx_estranho_home" });
  await cacheNode.saveLocalPost(watched);
  await cacheNode.saveLocalPost(stranger);
  assert.equal(social.toggleWatch("vx_seguido_home"), true);
  try {
    await home.showHome("following");
    assert.ok(dom.main.innerHTML.includes(watched.title));
    assert.equal(dom.main.innerHTML.includes(stranger.title), false);
  } finally {
    social.toggleWatch("vx_seguido_home");
  }
});

test("home — external e all montam com o Bluesky fora do ar sem quebrar", async () => {
  offline();
  const t = topic();
  await cacheNode.saveLocalPost(t);
  await home.showHome("external");
  assert.equal(dom.main.innerHTML.includes(t.title), false, "só externos no feed external");
  await home.showHome("all");
  assert.ok(dom.main.innerHTML.includes(t.title), "all mistura os locais com os externos");
});

test("home — dispensar o post de boas-vindas grava a marca, remove o cartão e remonta sem ele", async () => {
  offline();
  const card = makeEl();
  const post = makeEl();
  card.closest = (sel) => (sel === ".post" ? post : null);
  dom.group(".btn-dismiss-welcome-topic", [card]);
  await home.showHome("for-you");
  const welcomeId = welcome.getOfficialWelcomeTopic().id;
  assert.ok(dom.main.innerHTML.includes(welcomeId));
  const ev = card.fire("click");
  assert.equal(ev.defaultPrevented && ev.stopped, true);
  assert.equal(localStorage.getItem(DISMISS_KEY), "1");
  assert.equal(post.removed, true);
  await settle();
  assert.equal(dom.main.innerHTML.includes(welcomeId), false, "a Home remontada não traz mais as boas-vindas");
});

test("home — filterClosedCommunityTopics deixa passar abertas e sem comunidade e barra fechada de outro dono", async () => {
  await cacheNode.saveLocalPost({ id: "c_t1_aberta", type: "community", communityId: "t1_aberta", title: "Aberta", author: "vx_dono_x", visibility: "open", ts: 1 });
  await cacheNode.saveLocalPost({ id: "c_t1_fechada", type: "community", communityId: "t1_fechada", title: "Fechada", author: "vx_dono_x", visibility: "closed", ts: 1 });
  await cacheNode.saveLocalPost({ id: "c_t1_minha", type: "community", communityId: "t1_minha", title: "Minha", author: me, visibility: "closed", ts: 1 });
  await cacheNode.saveLocalPost({ id: "m_t1_minha", type: "membership", communityId: "t1_minha", author: me, ts: 2 });
  const topics = [
    { id: "a", communityId: "t1_aberta" },
    { id: "b", communityId: "t1_fechada" },
    { id: "c", communityId: "t1_minha" },
    { id: "d", communityId: "vox" },
    { id: "e" },
    { id: "f", communityId: "t1_fechada" },
  ];
  const ids = async (user) => (await home.filterClosedCommunityTopics(topics, user)).map((t) => t.id);
  assert.deepEqual(await ids(me), ["a", "c", "d", "e"]);
  assert.deepEqual(await ids(""), ["a", "d", "e"], "sem usuário, fechadas ficam de fora");
});

/** Compositor aberto/fechado e citação: elementos mínimos que `insertQuoteIntoComposer` procura. */
function addComposer({ collapsedForm = false } = {}) {
  const textarea = Object.assign(dom.add("inline-topic-body"), { value: "texto antes" });
  textarea.dispatchEvent = (ev) => { textarea.dispatched = ev?.type; };
  const form = dom.add("form-inline-topic");
  if (collapsedForm) form.classes.add("hidden");
  const collapsed = makeEl();
  dom.group("#feed-inline-composer .inline-composer-collapsed", [collapsed]);
  dom.document.querySelector = (sel) => (dom.groups.get(sel) || [])[0] || null;
  const wrap = dom.add("feed-inline-composer");
  return { textarea, form, collapsed, wrap };
}

function quoteTarget(data) {
  return { target: { closest: (sel) => (sel === ".btn-quote-external" ? { dataset: data } : null) } };
}

test("home — citar post externo insere a citação no compositor, abrindo-o se estava fechado", () => {
  globalThis.Event = globalThis.Event || class { constructor(type) { this.type = type; } };
  home.attachQuoteExternalHandlers();
  home.attachQuoteExternalHandlers();
  const c = addComposer({ collapsedForm: true });
  dom.document.docFire("click", { target: { closest: () => null } });
  assert.equal(c.textarea.value, "texto antes", "clique fora do botão não mexe no compositor");
  dom.document.docFire("click", quoteTarget({ handle: "@fulano", body: "frase citada", url: "https://bsky.app/p/1" }));
  assert.ok(c.textarea.value.includes("frase citada"));
  assert.ok(c.textarea.value.endsWith("texto antes"));
  assert.equal(c.textarea.focused, 1);
  assert.equal(c.wrap.scrolled, true);
  assert.equal(c.collapsed.listeners.size, 0);
});

test("home — citar sem compositor guarda o prefill e vai para a tela de novo tópico", () => {
  const store = new Map();
  globalThis.sessionStorage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
  globalThis.location = { hash: "#/" };
  dom.document.querySelector = () => null;
  try {
    dom.document.docFire("click", quoteTarget({ author: "@autora", body: "outra frase", url: "" }));
    assert.match(store.get("vox_quote_prefill"), /outra frase/);
    assert.equal(window.location.hash, "#/compose/topic");
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("home — menu de ações do overlay fecha os abertos ao clicar fora e preserva o clicado", () => {
  home.attachPostOverlayActionMenuHandlers();
  home.attachPostOverlayActionMenuHandlers();
  const open = makeEl();
  open.attrs.set("open", "");
  dom.group(".post-actions-overlay .post-overlay-actions-more[open]", [open]);
  dom.document.docFire("click", { target: { closest: (sel) => (sel.includes("post-overlay-actions-more") ? {} : null) } });
  assert.equal(open.attrs.has("open"), true, "clique dentro do menu não fecha");
  dom.document.docFire("click", { target: { closest: () => null } });
  assert.equal(open.attrs.has("open"), false);
});
