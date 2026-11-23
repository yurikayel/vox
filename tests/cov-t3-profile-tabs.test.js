/**
 * @file Cobertura de `render/profile-tabs.js`: normalização de abas, conteúdo de cada aba e montagem
 * do perfil em grade, conferidos pelo HTML produzido.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl } from "./helpers/cov-t3-dom.mjs";

const tabs = await import("../client/js/render/profile-tabs.js");
const social = await import("../client/js/social.js");
const welcome = await import("../client/js/vox-welcome-profile.js");

const post = (id, extra = {}) => ({ id, title: `Post ${id}`, ...extra });

test("normalizeProfileTab: legados viram sobre e salvos só vale no próprio perfil", () => {
  assert.equal(tabs.normalizeProfileTab("starred", false), "about");
  assert.equal(tabs.normalizeProfileTab("communities", true), "about");
  assert.equal(tabs.normalizeProfileTab("saved", false), "posts");
  assert.equal(tabs.normalizeProfileTab("saved", true), "saved");
  assert.equal(tabs.normalizeProfileTab("", true), "posts");
  assert.equal(tabs.normalizeProfileTab("voxels", false), "voxels");
});

test("aba posts: grade com imagem, inicial do título, fixado e vazio", () => {
  const html = tabs.renderProfileTabContent("posts", {
    authorPostList: [post("a", { image: "x.png" }), post("b", { title: "<Beta>" }), post("c", { thumbnail: "t.png" })],
    finalPinned: "b",
  });
  assert.match(html, /<img src="x\.png"/);
  assert.match(html, /<img src="t\.png"/);
  assert.match(html, /profile-grid-placeholder[^>]*>&lt;<\/span>/);
  assert.equal((html.match(/profile-grid-pin/g) || []).length, 1);
  assert.match(html, /href="#\/t\/b"/);
  assert.match(tabs.renderProfileTabContent("posts", { authorPostList: [] }), /Nenhuma publicação ainda\./);
});

test("aba salvos: grade quando há itens e aviso quando não há", () => {
  assert.match(tabs.renderProfileTabContent("saved", { isCurrentWallet: true, savedList: [post("s1")] }), /href="#\/t\/s1"/);
  assert.match(tabs.renderProfileTabContent("saved", { isCurrentWallet: true, savedList: [] }), /Nenhum post salvo neste aparelho\./);
});

test("aba amizades: perfil alheio fica vazio; o próprio lista os acompanhados com DM", () => {
  const other = tabs.renderProfileTabContent("following", { address: "vx_x", isCurrentWallet: false });
  assert.match(other, /Acompanhados \/ Amizades/);
  assert.match(other, /Nenhuma conta acompanhada ainda/);
  assert.match(tabs.renderProfileTabContent("followers", { address: "vx_x", isCurrentWallet: false }), /<h3[^>]*>Seguidores<\/h3>/);

  social.toggleWatch("vx_amigo_t3");
  const own = tabs.renderProfileTabContent("following", { address: "vx_me", isCurrentWallet: true });
  assert.match(own, /Acompanhados \/ Amizades \(1\)/);
  assert.match(own, /href="#\/dm\/vx_amigo_t3"/);
  assert.match(own, /data-route="vx_amigo_t3"/);
  social.toggleWatch("vx_amigo_t3");
});

test("aba sobre: README vazio do dono, estrelados e comunidades com seus títulos", () => {
  const html = tabs.renderProfileTabContent("about", {
    address: "vx_me", isCurrentWallet: true, displayName: "Eu", finalReadme: "", starredList: [], memberships: [{ communityId: "com<1>" }], activeTab: "about",
  });
  assert.match(html, /Nenhum README\.md adicionado ainda/);
  assert.match(html, /id="btn-toggle-edit-readme"/);
  assert.match(html, /Comunidades \(1\)/);
  assert.match(html, /com&lt;1&gt;/);
  assert.match(html, /ID de rede: <code>vx_me<\/code>/);
});

test("aba sobre: alheio com README mostra markdown sem botão de editar; estados vazios por aba legada", () => {
  const html = tabs.renderProfileTabContent("about", {
    address: "vx_other", isCurrentWallet: false, finalReadme: "**oi**", starredList: [post("e1")], memberships: [],
  });
  assert.match(html, /<strong>oi<\/strong>/);
  assert.doesNotMatch(html, /btn-toggle-edit-readme/);
  assert.match(html, /Estrelados \(1\)/);
  const starredEmpty = tabs.renderProfileTabContent("starred", { address: "vx_o", starredList: [], memberships: [], activeTab: "starred" });
  assert.match(starredEmpty, /Nenhum post favoritado com estrela/);
  const commEmpty = tabs.renderProfileTabContent("communities", { address: "vx_o", starredList: [], memberships: [], activeTab: "communities" });
  assert.match(commEmpty, /Nenhuma comunidade registrada neste perfil/);
  assert.doesNotMatch(commEmpty, /Nenhum post favoritado/);
});

test("aba sobre: conta oficial da plataforma traz o aviso institucional", () => {
  const html = tabs.renderProfileTabContent("about", { address: welcome.WELCOME_ROUTE_ID, isCurrentWallet: false, finalReadme: "" });
  assert.match(html, /Conta oficial da plataforma/);
  assert.match(html, /href="#\/voxpedia"/);
});

test("renderProfile: monta cabeçalho, abas e conteúdo; o fixado vai para o início da grade", () => {
  const main = makeEl();
  tabs.renderProfile(main, "vx_perfil_t3", [], false, {
    posts: [post("p1"), post("p2"), post("p3")], pinnedPostId: "p3", displayName: "Fulana", activeTab: "posts",
    identityMeta: { pronouns: "ela/dela" }, readme: "texto",
  });
  assert.match(main.innerHTML, /data-profile-address="vx_perfil_t3"/);
  assert.match(main.innerHTML, /id="profile-tab-content"/);
  assert.match(main.innerHTML, /Fulana/);
  assert.match(main.innerHTML, /ela\/dela/);
  const order = [...main.innerHTML.matchAll(/href="#\/t\/(p\d)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["p3", "p1", "p2"]);
  assert.match(main.innerHTML, /data-tab="about"/, "README dá direito à aba Sobre");
});

test("renderProfile: dono usa dados locais (GitHub, README) e abre a aba salvos", () => {
  social.setLocalGithubHandle("octo-t3");
  social.setLocalReadme("meu readme t3");
  const main = makeEl();
  tabs.renderProfile(main, "vx_dono_t3", [], true, { activeTab: "saved", savedPosts: [post("sv1")], stats: { posts: 4 } });
  assert.match(main.innerHTML, /octo-t3/);
  assert.match(main.innerHTML, /href="#\/t\/sv1"/);
  const about = makeEl();
  tabs.renderProfile(about, "vx_dono_t3", [{ communityId: "c1" }], true, { activeTab: "about" });
  assert.match(about.innerHTML, /meu readme t3/);
  assert.match(about.innerHTML, /Comunidades \(1\)/);
  social.setLocalGithubHandle("");
  social.setLocalReadme("");
});
