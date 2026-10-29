import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as render from "../client/js/render.js";

function createContainer() {
  return {
    innerHTML: "",
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test("tab-slot-architecture - renderProfile renders persistent layout slot and data attributes", () => {
  const main = createContainer();
  render.renderProfile(main, "vx_alice_123", [], true, "", {
    displayName: "Alice Soares",
    handle: "alices",
    activeTab: "posts",
  });

  assert.ok(main.innerHTML.includes('data-profile-address="vx_alice_123"'), "Profile layout must identify address via data-profile-address");
  assert.ok(main.innerHTML.includes('id="profile-tab-content"'), "Profile must wrap tab body in #profile-tab-content slot");
  assert.ok(main.innerHTML.includes('class="profile-tab-content-slot"'), "Profile must include .profile-tab-content-slot class");
  assert.ok(main.innerHTML.includes('data-tab="posts"'), "Navigation must tag posts tab with data-tab");
  assert.ok(main.innerHTML.includes('data-tab="following"'), "Navigation must tag following tab with data-tab");
  assert.ok(main.innerHTML.includes('data-tab="saved"'), "Navigation must tag saved tab with data-tab");
  assert.ok(main.innerHTML.includes('data-tab="about"'), "Navigation must tag about tab with data-tab");
});

test("tab-slot-architecture - renderProfileTabContent returns only tabbed content without header", () => {
  const postsHtml = render.renderProfileTabContent("posts", {
    address: "vx_alice_123",
    authorPostList: [{ id: "p1", title: "Post 1" }],
  });
  assert.ok(!postsHtml.includes("profile-grid-header"), "Tab content must not repeat profile-grid-header");
  assert.ok(!postsHtml.includes("profile-grid-tabs"), "Tab content must not repeat profile-grid-tabs");
  assert.ok(postsHtml.includes("profile-grid"), "Posts tab must render post grid");

  const networkHtml = render.renderProfileTabContent("following", {
    address: "vx_alice_123",
    isCurrentWallet: true,
  });
  assert.ok(!networkHtml.includes("profile-grid-header"));
  assert.ok(networkHtml.includes("profile-grid-network"));

  const aboutHtml = render.renderProfileTabContent("about", {
    address: "vx_alice_123",
    displayName: "Alice",
    finalReadme: "Meu perfil no Vox",
    isCurrentWallet: true,
  });
  assert.ok(!aboutHtml.includes("profile-grid-header"));
  assert.ok(aboutHtml.includes("profile-grid-about"));
  assert.ok(aboutHtml.includes("profile-readme"));
});

test("tab-slot-architecture - renderCommunity renders persistent layout slot and data attributes", () => {
  const main = createContainer();
  const meta = {
    id: "cinema-brasil",
    title: "Cinema Brasil",
    description: "Debates e mostras de cinema",
  };
  render.renderCommunity(main, "cinema-brasil", [], meta, {
    activeTab: "posts",
  });

  assert.ok(main.innerHTML.includes('data-community-id="cinema-brasil"'), "Community page must identify community via data-community-id");
  assert.ok(main.innerHTML.includes('id="community-tab-content"'), "Community must wrap tab body in #community-tab-content slot");
  assert.ok(main.innerHTML.includes('class="community-tab-content-slot"'), "Community must include .community-tab-content-slot class");
  assert.ok(main.innerHTML.includes('data-tab="posts"'), "Community navigation must tag posts tab with data-tab");
  assert.ok(main.innerHTML.includes('data-tab="members"'), "Community navigation must tag members tab with data-tab");
  assert.ok(main.innerHTML.includes('data-tab="listings"'), "Community navigation must tag listings tab with data-tab");
  assert.ok(main.innerHTML.includes('data-tab="governance"'), "Community navigation must tag governance tab with data-tab");
});

test("tab-slot-architecture - renderCommunityTabContent returns only tabbed content without header", () => {
  const meta = { id: "cinema-brasil", title: "Cinema Brasil" };
  const membersHtml = render.renderCommunityTabContent("members", {
    communityId: "cinema-brasil",
    meta,
    recentPeople: [{ routeId: "vx_user1", name: "User 1" }],
  });
  assert.ok(!membersHtml.includes("community-vox-header"), "Tab content must not repeat community-vox-header");
  assert.ok(!membersHtml.includes("community-vox-nav"), "Tab content must not repeat community-vox-nav");
  assert.ok(membersHtml.includes("community-vox-members-panel"), "Members tab must render members panel");

  const listingsHtml = render.renderCommunityTabContent("listings", {
    communityId: "cinema-brasil",
    meta,
  });
  assert.ok(!listingsHtml.includes("community-vox-header"));
  assert.ok(listingsHtml.includes("community-vox-panel"));
});

test("tab-slot-architecture - CSS declares slot container classes", () => {
  const css = fs.readFileSync("client/css/style.css", "utf8");
  assert.ok(css.includes(".profile-tab-content-slot"), "CSS must declare .profile-tab-content-slot");
  assert.ok(css.includes(".community-tab-content-slot"), "CSS must declare .community-tab-content-slot");
});

test("composer - inline composer permits posting without text when media is attached", () => {
  const main = createContainer();
  render.renderFeed(main, [], { activeFeed: "for-you", userRouteId: "vx_user_1" });
  assert.ok(main.innerHTML.includes('id="inline-topic-body"'), "Feed must render inline-topic-body textarea");
  assert.ok(!main.innerHTML.includes('id="inline-topic-body" class="inline-composer-textarea" rows="3" maxlength="2000" placeholder="Compartilhe texto, #hashtags ou anexe uma foto…" required'), "inline-topic-body must NOT have required attribute so media-only posts can be submitted");
});
