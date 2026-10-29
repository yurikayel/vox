import test from "node:test";
import assert from "node:assert/strict";
import * as render from "../client/js/render.js";
import * as mock from "../client/js/mock.js";

function createContainer() {
  return {
    innerHTML: "",
    querySelector(sel) {
      return null;
    },
    querySelectorAll(sel) {
      return [];
    },
  };
}

test("community-orkut - renderCommunityAvatarHtml renders image when provided and fallback when absent", () => {
  const withImg = render.renderCommunityAvatarHtml(
    { image: "https://example.com/photo.jpg", title: "Cinema Nacional" },
    "cinema-nacional",
    "community-avatar-lg"
  );
  assert.ok(withImg.includes("community-avatar-box"));
  assert.ok(withImg.includes("community-avatar-lg"));
  assert.ok(withImg.includes('src="https://example.com/photo.jpg"'));
  assert.ok(withImg.includes('alt="Cinema Nacional"'));
  assert.ok(withImg.includes("community-avatar-fallback"));

  const fallback = render.renderCommunityAvatarHtml(
    { title: "Política Viva" },
    "politica-viva",
    "community-avatar-md"
  );
  assert.ok(fallback.includes("community-avatar-box"));
  assert.ok(fallback.includes("community-avatar-md"));
  assert.ok(fallback.includes("P"));
  assert.ok(!fallback.includes("<img"));
});

test("community-orkut - renderCommunity header renders Orkut photo, owner display name and Ficha Técnica", () => {
  const main = createContainer();
  const meta = {
    id: "cinema-nacional",
    title: "Cinema Nacional",
    description: "Comunidade para debater o cinema brasileiro contemporâneo e clássico.",
    category: "Cultura & Cinema",
    owner: "vx_9kN6qN",
    language: "Português",
    memberCount: 42,
    createdAt: 1729000000000,
    image: "https://example.com/cinema.png",
  };

  render.renderCommunity(main, "cinema-nacional", [], meta, {
    isMember: false,
    walletAddress: "vx_9kN6qN",
    activeTab: "posts",
  });

  const html = main.innerHTML;

  // Foto da comunidade estilo Orkut
  assert.ok(html.includes("community-vox-avatar-wrap"), "Must have community-vox-avatar-wrap");
  assert.ok(html.includes("https://example.com/cinema.png"), "Must render community photo");
  assert.ok(html.includes("input-comm-photo-file"), "Owner can change community photo");

  // Ficha Técnica Orkut
  assert.ok(html.includes("community-orkut-ficha"), "Must have community-orkut-ficha");
  assert.ok(html.includes("community-orkut-details-grid"), "Must have details grid");
  assert.ok(html.includes("Cultura &amp; Cinema") || html.includes("Cultura & Cinema"));
  assert.ok(html.includes("Português"));
  assert.ok(html.includes("42 membros"));
  assert.ok(html.includes("Dono:"));
  assert.ok(html.includes("community-orkut-owner-link"));
  assert.ok(html.includes("#/u/vx_9kN6qN"));

  // Layout Orkut
  assert.ok(html.includes("community-vox-posts-wrap"));
  assert.ok(html.includes("Novo post"));
});

test("community-orkut - renderCommunityOrkutMembersBox renders member thumbnails and link to all members", () => {
  const recentPeople = [
    { routeId: "vx_alice", name: "Alice Soares" },
    { routeId: "vx_bob", name: "Bob Silva" },
    { routeId: "vx_carol", name: "Carol Dias" },
  ];
  const boxHtml = render.renderCommunityOrkutMembersBox(
    { title: "Filosofia" },
    "filosofia",
    recentPeople,
    150
  );

  assert.ok(boxHtml.includes("community-orkut-members-box"));
  assert.ok(boxHtml.includes("Membros da comunidade (150)"));
  assert.ok(boxHtml.includes("Alice"));
  assert.ok(boxHtml.includes("Bob"));
  assert.ok(boxHtml.includes("Carol"));
  assert.ok(boxHtml.includes("#/u/vx_alice"));
  assert.ok(boxHtml.includes("#/c/filosofia?tab=members"));
});

test("community-orkut - renderCommunityTopicRow displays author avatar and reply count in forum style", () => {
  const topic = {
    id: "top-orkut-1",
    title: "Qual o seu filme nacional favorito de 2026?",
    author: "vx_cinéfilo",
    authorDisplay: "Cinéfilo Paulistano",
    ts: Date.now() - 3600000,
    repliesCount: 14,
  };
  const rowHtml = render.renderCommunityTopicRow(topic, { communityId: "cinema-nacional" });

  assert.ok(rowHtml.includes("community-topic-row"));
  assert.ok(rowHtml.includes("Qual o seu filme nacional favorito de 2026?"));
  assert.ok(rowHtml.includes("14 respostas"));
  assert.ok(rowHtml.includes("avatar"));
  assert.ok(rowHtml.includes("community-topic-row-author"));
});

test("community-orkut - renderHome displays community photo thumbnail in card list", () => {
  const main = createContainer();
  const communities = [
    {
      id: "cinema-nacional",
      title: "Cinema Nacional",
      description: "Debates e resenhas.",
      category: "Cultura",
      memberCount: 50,
      image: "https://example.com/cine.jpg",
    },
  ];

  render.renderHome(main, communities);
  const html = main.innerHTML;

  assert.ok(html.includes("community-vox-card-layout"));
  assert.ok(html.includes("community-vox-card-avatar-wrap"));
  assert.ok(html.includes("https://example.com/cine.jpg"));
  assert.ok(html.includes("Cinema Nacional"));
});

test("community-orkut - renderComposeCommunity includes photo upload field and live preview", () => {
  const main = createContainer();
  render.renderComposeCommunity(main);
  const html = main.innerHTML;

  assert.ok(html.includes("comm-photo-file"));
  assert.ok(html.includes("comm-photo-url"));
  assert.ok(html.includes("comm-photo-preview"));
  assert.ok(html.includes("Foto da Comunidade (estilo Orkut)"));
  assert.ok(html.includes("comm-category-suggestions"));
  assert.ok(html.includes("comm-type"));
});

test("profile - action buttons aligned on same line with nowrap and unconstrained width", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.resolve("client/css/style.css"), "utf8");
  assert.ok(css.includes(".profile-grid-actions"));
  assert.ok(css.includes("flex-wrap: nowrap;"));
  assert.ok(css.includes("overflow-x: auto;"));
});
