import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const hashtags = await import("../client/js/hashtags.js");
const cacheNode = await import("../client/js/cache-node.js");
const render = await import("../client/js/render.js");

function createContainer() {
  return { innerHTML: "" };
}

test("hashtags - slugifyTag normaliza acentos, caixa alta e pontuacao", () => {
  assert.equal(hashtags.slugifyTag("#educação"), "educacao");
  assert.equal(hashtags.slugifyTag("Saúde_Pública"), "saude_publica");
  assert.equal(hashtags.slugifyTag("#AGROECOLOGIA!"), "agroecologia");
  assert.equal(hashtags.slugifyTag("#pão_de_queijo-2026"), "pao_de_queijo2026");
  assert.equal(hashtags.slugifyTag(""), "");
  assert.equal(hashtags.slugifyTag(null), "");
  assert.equal(hashtags.slugifyTag(123), "");
});

test("hashtags - extractHashtags extrai slugs unicos ignorando numeros puros", () => {
  const text = "Apoie a #educação e a #saude_publica! Venha para a #educação popular. #123 #2026";
  const tags = hashtags.extractHashtags(text);
  assert.deepEqual(tags, ["educacao", "saude_publica"]);

  // Respeita limite maxTags para evitar tag-stuffing
  const multiText = "#a #b #c #d #e #f #g #h #i #j";
  const limited = hashtags.extractHashtags(multiText, 4);
  assert.equal(limited.length, 4);
  assert.deepEqual(limited, ["a", "b", "c", "d"]);

  assert.deepEqual(hashtags.extractHashtags(""), []);
  assert.deepEqual(hashtags.extractHashtags(null), []);
});

test("hashtags - linkifyHashtags preserva exibicao original e blinda contra entidades HTML", () => {
  const input = "Texto com &#39;aspas&#39; e tag #Educação e #AgroEcologia_2026 mais #100 reais.";
  const html = hashtags.linkifyHashtags(input);

  // Não deve alterar &#39; para hashtag
  assert.ok(html.includes("&#39;aspas&#39;"));
  assert.ok(!html.includes("#/tag/39"));

  // Deve linkificar tags reais com display original e slug limpo na URL
  assert.ok(html.includes('<a href="#/tag/educacao" class="hashtag-link">#Educação</a>'));
  assert.ok(html.includes('<a href="#/tag/agroecologia_2026" class="hashtag-link">#AgroEcologia_2026</a>'));

  // Não deve linkificar valor numerico puro #100
  assert.ok(html.includes("#100 reais"));
  assert.ok(!html.includes("#/tag/100"));
});

test("hashtags - cache-node saveLocalPost indexa tags e getPostsByTag busca por slug", async () => {
  await cacheNode.clearLocalPosts();

  const post1 = {
    id: "post_tag_test_1",
    type: "topic",
    title: "Oficina de horta comunitária",
    body: "Venha participar do mutirão de #agroecologia e #permacultura neste sábado!",
    author: "vx_demo_helena",
    ts: 1000,
  };
  const post2 = {
    id: "post_tag_test_2",
    type: "topic",
    title: "Debate sobre dados",
    body: "Nossa luta por #soberania e #privacidade nos aparelhos.",
    author: "vx_demo_yara",
    ts: 2000,
  };
  const post3 = {
    id: "post_tag_test_3",
    type: "topic",
    title: "Post mais recente de horta",
    body: "Colheita fresca de hortaliças com foco em #AgroEcologia!",
    author: "vx_demo_fernanda",
    ts: 3000,
  };

  await cacheNode.saveLocalPost(post1);
  await cacheNode.saveLocalPost(post2);
  await cacheNode.saveLocalPost(post3);

  // Busca por slug com ordenação cronológica pura (mais recente primeiro: post3 depois post1)
  const agroPosts = await cacheNode.getPostsByTag("agroecologia");
  assert.ok(agroPosts.length >= 2);
  const foundIds = agroPosts.map((p) => p.id);
  assert.ok(foundIds.includes("post_tag_test_3"));
  assert.ok(foundIds.includes("post_tag_test_1"));
  assert.ok(!foundIds.includes("post_tag_test_2"));

  // Verifica ordenação decrescente de ts
  const idxPost3 = foundIds.indexOf("post_tag_test_3");
  const idxPost1 = foundIds.indexOf("post_tag_test_1");
  assert.ok(idxPost3 < idxPost1, "post3 (ts=3000) deve vir antes de post1 (ts=1000)");

  // Busca por tag inexistente retorna vazio
  const none = await cacheNode.getPostsByTag("inexistente_xyz_123");
  assert.equal(none.length, 0);
});

test("hashtags - getPostsByTag resolve topicos com tags", async () => {
  await cacheNode.saveLocalPost({
    id: "top_mg_real",
    type: "topic",
    title: "Post de Minas",
    body: "Post sobre soberania em #minasgerais!",
    author: "vx_real_mg",
    ts: Date.now(),
  });
  await cacheNode.saveLocalPost({
    id: "top_sp_real",
    type: "topic",
    title: "Post de SP",
    body: "Post sobre coletivos em #saopaulo!",
    author: "vx_real_sp",
    ts: Date.now(),
  });

  const posts = await cacheNode.getPostsByTag("minasgerais");
  assert.ok(posts.length >= 1);
  assert.equal(posts[0].id, "top_mg_real");
  assert.ok(posts[0].body.includes("#minasgerais"));

  const spPosts = await cacheNode.getPostsByTag("saopaulo");
  assert.ok(spPosts.length >= 1);
  assert.equal(spPosts[0].id, "top_sp_real");
});

test("hashtags - renderTagFeed gera cabeçalho limpo e empty state honesto", () => {
  const main = createContainer();

  // Teste com posts
  const fakePosts = [
    {
      id: "p_tag_1",
      title: "Horta Urbana",
      body: "Plantando na cidade #agroecologia",
      author: "vx_demo_helena",
      ts: Date.now() - 5000,
    },
  ];
  render.renderTagFeed(main, "agroecologia", fakePosts);
  let html = main.innerHTML;
  assert.ok(html.includes("tag-feed-header"));
  assert.ok(html.includes("#"));
  assert.ok(html.includes("agroecologia"));
  assert.ok(html.includes("1 post no seu índice"));
  assert.ok(html.includes("Descoberta local gossip (Willow)"));
  assert.ok(html.includes("Horta Urbana"));

  // Teste empty state honesto (sem trending ou contagem global)
  render.renderTagFeed(main, "inexistente", []);
  html = main.innerHTML;
  assert.ok(html.includes("Nenhum post com #inexistente no seu índice ainda"));
  assert.ok(html.includes("No Vox, o índice vive no seu próprio dispositivo"));
  assert.ok(html.includes("Criar post com #inexistente"));
  assert.ok(!html.includes("Em alta"));
  assert.ok(!html.includes("Trending"));
});
