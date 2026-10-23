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
  assert.equal(tour.items.length, 5);
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
  const repliesTour = mock.mockReplies("demo-post-lia");
  assert.equal(repliesTour.demo, true);
  assert.ok(repliesTour.items.length >= 1);
  assert.equal(repliesTour.items[0].replyTo, "demo-post-lia");
  assert.equal(repliesTour.items[0].author, "vx_demo_pri");

  const replies = mock.mockReplies("demo-topic-1");
  assert.equal(replies.demo, true);
  assert.ok(replies.items.length >= 1);
  assert.equal(replies.items[0].replyTo, "demo-topic-1");

  const vazio = mock.mockReplies("topico_fantasma");
  assert.equal(vazio.demo, true);
  assert.deepEqual(vazio.items, []);
});

test("mock - catálogo de 5 perfis demo e helpers getMockProfile / getAuthorDisplay", () => {
  const expectedRoutes = ["vx_demo_lia", "vx_demo_rafa", "vx_demo_camila", "vx_demo_davi", "vx_demo_pri"];
  for (const routeId of expectedRoutes) {
    const prof = mock.getMockProfile(routeId);
    assert.ok(prof, `Perfil ${routeId} deve existir no catálogo`);
    assert.equal(prof.routeId, routeId);
    assert.ok(prof.name && prof.name.length > 0);
    assert.ok(prof.bio && prof.bio.length > 0);
  }

  assert.equal(mock.getAuthorDisplay("vx_demo_lia"), "Lia");
  assert.equal(mock.getAuthorDisplay("vx_demo_rafa"), "Rafa");
  assert.equal(mock.getAuthorDisplay("vx_demo_camila"), "Camila");
  assert.equal(mock.getAuthorDisplay("vx_demo_davi"), "Davi");
  assert.equal(mock.getAuthorDisplay("vx_demo_pri"), "Pri");
  assert.equal(mock.getAuthorDisplay("rota_desconhecida"), "");
  assert.equal(mock.getAuthorDisplay(""), "");
  assert.equal(mock.getMockProfile(""), null);
});

test("mock - mockRecentTopics retorna 5 posts educativos alinhados ao tour", () => {
  const recent = mock.mockRecentTopics();
  assert.equal(recent.demo, true);
  assert.equal(recent.items.length, 5);
  assert.equal(recent.items[0].id, "demo-post-lia");
  assert.equal(recent.items[0].author, "vx_demo_lia");
  assert.equal(recent.items[0].communityTitle, "Aprenda o Vox");
});
