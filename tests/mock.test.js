import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";

test("mock - mockCommunities retorna lista demo incluindo tour", () => {
  const res = mock.mockCommunities();
  assert.equal(res.demo, true);
  assert.ok(Array.isArray(res.items));
  assert.ok(res.items.length >= 2);
  assert.ok(res.items[0].id);
  assert.ok(res.items[0].title);
  assert.equal(res.items[0].id, "demo-aprenda-vox");
  assert.equal(res.items[0].title, "Aprenda o Vox");
});

test("mock - mockTopics retorna topicos da comunidade ou array vazio", () => {
  const tour = mock.mockTopics("demo-aprenda-vox");
  assert.equal(tour.demo, true);
  assert.equal(tour.items.length, 10);
  assert.equal(tour.items[0].communityId, "demo-aprenda-vox");

  const comm1 = mock.mockTopics("demo-community-1");
  assert.equal(comm1.demo, true);
  assert.ok(comm1.items.length >= 1);
  assert.equal(comm1.items[0].communityId, "demo-community-1");

  const inexistente = mock.mockTopics("comunidade_fantasma");
  assert.equal(inexistente.demo, true);
  assert.deepEqual(inexistente.items, []);
});

test("mock - mockReplies retorna respostas do topico ou array vazio", () => {
  const repliesTour = mock.mockReplies("demo-post-helena");
  assert.equal(repliesTour.demo, true);
  assert.ok(repliesTour.items.length >= 1);
  assert.equal(repliesTour.items[0].replyTo, "demo-post-helena");
  assert.equal(repliesTour.items[0].author, "vx_demo_juliana");

  const replies = mock.mockReplies("demo-topic-1");
  assert.equal(replies.demo, true);
  assert.ok(replies.items.length >= 1);
  assert.equal(replies.items[0].replyTo, "demo-topic-1");

  const vazio = mock.mockReplies("topico_fantasma");
  assert.equal(vazio.demo, true);
  assert.deepEqual(vazio.items, []);
});

test("mock - catálogo de 10 perfis demo e helpers getMockProfile / getAuthorDisplay", () => {
  const expectedRoutes = [
    "vx_demo_helena",
    "vx_demo_juliana",
    "vx_demo_yara",
    "vx_demo_mei",
    "vx_demo_fernanda",
    "vx_demo_salma",
    "vx_demo_lucas",
    "vx_demo_andre",
    "vx_demo_kaue",
    "vx_demo_raj",
  ];
  for (const routeId of expectedRoutes) {
    const prof = mock.getMockProfile(routeId);
    assert.ok(prof, `Perfil ${routeId} deve existir no catálogo`);
    assert.equal(prof.routeId, routeId);
    assert.ok(prof.name && prof.name.length > 0);
    assert.ok(prof.bio && prof.bio.length > 0);
    assert.ok(prof.avatar && prof.avatar.includes("images/avatars/"));
  }

  assert.equal(mock.getAuthorDisplay("vx_demo_helena"), "Helena");
  assert.equal(mock.getAuthorDisplay("vx_demo_andre"), "André");
  assert.equal(mock.getAuthorDisplay("rota_desconhecida"), "");
  assert.equal(mock.getAuthorDisplay(""), "");
  assert.equal(mock.getMockProfile(""), null);

  assert.equal(mock.getAuthorAvatar("vx_demo_helena"), "images/avatars/helena.jpg");
  assert.equal(mock.getAuthorHandle("vx_demo_helena"), "helena");
  assert.ok(mock.getAuthorReadme("vx_demo_helena").includes("Helena"));
  assert.equal(mock.getAuthorGithub("vx_demo_helena"), "helenapopular");
  assert.equal(mock.getAuthorPinnedPostId("vx_demo_helena"), "demo-post-helena");

  // Lookup de chave Pix fictícia
  const helenaPix = mock.findMockByPixKey("helena.vox@gmail.com");
  assert.ok(helenaPix);
  assert.equal(helenaPix.routeId, "vx_demo_helena");
});

test("mock - mockListings retorna ofertas para demo-feira-local", () => {
  const feira = mock.mockListings("demo-feira-local");
  assert.equal(feira.demo, true);
  assert.equal(feira.items.length, 4);
  assert.equal(feira.items[0].id, "demo-listing-helena");
  assert.equal(feira.items[0].type, "listing");
  assert.ok(feira.items[0].priceLabel);
  assert.ok(feira.items[0].contactPix);

  const outro = mock.mockListings("demo-aprenda-vox");
  assert.equal(outro.demo, true);
  assert.deepEqual(outro.items, []);
});

test("mock - mockRecentTopics retorna 10 posts educativos com fotos, dor e resolução", () => {
  const recent = mock.mockRecentTopics();
  assert.equal(recent.demo, true);
  assert.equal(recent.items.length, 10);
  assert.equal(recent.items[0].id, "demo-post-helena");
  assert.equal(recent.items[0].author, "vx_demo_helena");
  assert.equal(recent.items[0].image, "images/posts/tour-helena.jpg");
  assert.ok(recent.items[0].externalPain);
  assert.equal(recent.items[0].voxResolution, "now");
  assert.equal(recent.items[0].communityTitle, "Aprenda o Vox");

  // Todos os 10 posts devem conter externalPain e voxResolution
  for (const item of recent.items) {
    assert.ok(item.externalPain, `Post ${item.id} deve ter externalPain`);
    assert.ok(item.voxResolution, `Post ${item.id} deve ter voxResolution`);
    assert.ok(item.image, `Post ${item.id} deve ter imagem`);
  }
});
