import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";
import { UF_ROUTE_IDS, MOCK_DEMO_UF_COUNT } from "../client/js/data/profiles-brazil-uf.js";

test("mock - mockCommunities retorna tour UF demo", () => {
  const res = mock.mockCommunities();
  assert.equal(res.items[0].title, "Brasil Estereótipo (Demo Vox)");
});

test("mock - mockTopics retorna 27 topicos", () => {
  const tour = mock.mockTopics("demo-aprenda-vox");
  assert.equal(tour.items.length, MOCK_DEMO_UF_COUNT);
});

test("mock - mockReplies MG", () => {
  const mg = mock.mockReplies("demo-post-mg");
  assert.equal(mg.items[0].author, "vx_demo_sp");
});

test("mock - 27 perfis UF", () => {
  assert.equal(UF_ROUTE_IDS.length, 27);
  assert.equal(mock.getAuthorDisplay("vx_demo_mg"), "Maria");
  assert.ok(mock.findMockByPixKey("maria.mg@voxbrasil.org"));
});

test("mock - feira 6 listings", () => {
  assert.equal(mock.mockListings("demo-feira-local").items.length, 6);
});

test("mock - recent topics", () => {
  assert.equal(mock.mockRecentTopics().items.length, MOCK_DEMO_UF_COUNT);
});

test("mock - topic media temático (não avatar)", () => {
  const tour = mock.mockTopics("demo-aprenda-vox");
  for (const t of tour.items) {
    const avatar = mock.getAuthorAvatar(t.author);
    assert.notEqual(t.image, avatar, `${t.id} reutiliza avatar como mídia`);
    assert.match(t.image, /images\.unsplash\.com/, `${t.id} sem URL temática`);
    assert.ok(t.imageAlt && !/retrato/i.test(t.imageAlt), `${t.id} alt deve ser tema regional`);
  }
  const ma = tour.items.find((t) => t.id === "demo-post-ma");
  assert.equal(
    ma.image,
    "https://images.unsplash.com/photo-1519892306449-f6395edf9ebe?w=800&q=80"
  );
});
