import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";
import {
  UF_ROUTE_IDS,
  UF_STEREOTYPE_SEEDS,
  MOCK_DEMO_UF_COUNT,
  MOCK_DEMO_TOPIC_COUNT,
} from "../client/js/data/profiles-brazil-uf.js";

const demoMg = UF_STEREOTYPE_SEEDS.find((s) => s.uf === "MG");
const mgPixKey = `${demoMg.handle.replace("-", ".")}@voxbrasil.org`;

test("mock - mockCommunities retorna tour UF demo", () => {
  const res = mock.mockCommunities();
  assert.equal(res.items[0].title, "Brasil Estereótipo (Demo Vox)");
});

test("mock - mockTopics retorna 81 topicos (27×3)", () => {
  const tour = mock.mockTopics("demo-aprenda-vox");
  assert.equal(tour.items.length, MOCK_DEMO_TOPIC_COUNT);
});

test("mock - mockTopics espelho demo reutiliza tour", () => {
  const mirror = mock.mockTopics("demo-aprenda-vox-mirror");
  assert.equal(mirror.items.length, MOCK_DEMO_TOPIC_COUNT);
  assert.equal(mirror.demo, true);
});

test("mock - mockReplies MG", () => {
  const mg = mock.mockReplies("demo-post-mg");
  assert.equal(mg.items[0].author, "vx_demo_sp");
});

test("mock - 27 perfis UF", () => {
  assert.equal(UF_ROUTE_IDS.length, 27);
  assert.equal(mock.getAuthorDisplay("vx_demo_mg"), demoMg.displayName);
  assert.ok(mock.findMockByPixKey(mgPixKey));
});

test("mock - 27 prenomes IBGE unicos (sem repeticao entre UFs)", () => {
  const names = UF_STEREOTYPE_SEEDS.map((s) => s.displayName);
  assert.equal(names.length, 27);
  assert.equal(new Set(names).size, 27);
});

test("mock - feira 6 listings", () => {
  assert.equal(mock.mockListings("demo-feira-local").items.length, 6);
});

test("mock - recent topics", () => {
  assert.equal(mock.mockRecentTopics().items.length, MOCK_DEMO_TOPIC_COUNT);
});

test("mock - titulos AL vs MA distintos", () => {
  const tour = mock.mockTopics("demo-aprenda-vox");
  const al = tour.items.filter((t) => t.author === "vx_demo_al").map((t) => t.title);
  const ma = tour.items.filter((t) => t.author === "vx_demo_ma").map((t) => t.title);
  assert.equal(al.length, 3);
  assert.equal(ma.length, 3);
  assert.notDeepEqual(al, ma);
  for (const title of al.concat(ma)) {
    assert.doesNotMatch(title, /nossa voz sem algoritmo estrangeiro/i);
  }
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
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80"
  );
});
