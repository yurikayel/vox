import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as gossipRetract from "../client/js/gossip-retract-ui.js";

function createContainer() {
  return { innerHTML: "" };
}

globalThis.document = {
  getElementById: (id) => ({ id, innerHTML: "", appendChild() {} }),
};

test.afterEach(() => {
  gossipRetract.__setGossipRetractUiEnabledForTests(null);
});

test("gossip-retract-ui - flag default on (pós-protocolo v1)", () => {
  assert.equal(gossipRetract.GOSSIP_RETRACT_UI, true);
  assert.equal(gossipRetract.isGossipRetractUiEnabled(), true);
});

test("gossip-retract-ui - tombstone oculto no feed com flag on", async () => {
  gossipRetract.__setGossipRetractUiEnabledForTests(true);
  const render = await import("../client/js/render.js");

  const topics = [
    { id: "live-post", title: "Visível", author: "vx_demo_lucas", ts: Date.now() },
    {
      id: "dead-post",
      title: "Removido",
      author: "vx_demo_helena",
      ts: Date.now(),
      gossipTombstone: { deleted: true, at: 1700000000000, sig: "mock-tombstone" },
    },
  ];

  const filtered = gossipRetract.filterFeedTopicsForGossipRetract(topics);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "live-post");

  const main = createContainer();
  render.renderFeed(main, topics, { userRouteId: "vx_demo_lucas" });
  assert.ok(main.innerHTML.includes("live-post"));
  assert.ok(!main.innerHTML.includes("dead-post"));
  assert.ok(!main.innerHTML.includes("Removido"));

  const tombHtml = render.renderPostItem(topics[1]);
  assert.equal(tombHtml, "");
});

test("gossip-retract-ui - feed card sem badge Editado no header (chip removido)", async () => {
  gossipRetract.__setGossipRetractUiEnabledForTests(true);
  const render = await import("../client/js/render.js");

  const html = render.renderPostItem({
    id: "edited-gossip",
    title: "Texto revisado",
    author: "vx_demo_yara",
    gossipEditedAt: 1700000001000,
  });

  assert.ok(!html.includes("gossip-edited-pill"));
  assert.ok(!html.includes("post-header-tags"));
});

test("gossip-retract-ui - flag off ignora tombstone e gossip edit", async () => {
  gossipRetract.__setGossipRetractUiEnabledForTests(false);
  const render = await import("../client/js/render.js");

  const post = {
    id: "still-shown",
    title: "Antes do protocolo",
    author: "vx_demo_raj",
    gossipTombstone: { deleted: true, at: 1 },
    gossipEditedAt: 999,
  };

  const html = render.renderPostItem(post);
  assert.ok(html.includes("still-shown"));
  assert.ok(!html.includes("gossip-edited-pill"));
});
