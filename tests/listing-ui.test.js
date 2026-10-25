import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as listingUi from "../client/js/listing-ui.js";
import * as listing from "../client/js/listing.js";
import * as localAccount from "../client/js/local-account.js";
import * as gossipRetract from "../client/js/gossip-retract-ui.js";
import * as render from "../client/js/render.js";

test.afterEach(() => {
  gossipRetract.__setGossipRetractUiEnabledForTests(null);
});

test("listing-ui - prepareListingsForTab aplica mapOwnLocalFlags e oculta tombstone", () => {
  gossipRetract.__setGossipRetractUiEnabledForTests(true);
  const routeId = "vx_owner_listing";
  const listings = [
    {
      id: "listing_live",
      type: "listing",
      title: "Visível",
      body: "Ok",
      author: routeId,
      sig: "mock",
      pubKey: "pk",
    },
    {
      id: "listing_dead",
      type: "listing",
      title: "Removida",
      body: "Ok",
      author: "vx_other",
      gossipTombstone: { deleted: true, at: 1 },
    },
  ];

  const prepared = listingUi.prepareListingsForTab(listings, routeId);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].id, "listing_live");
  assert.equal(prepared[0].isOwnLocalPost, true);
});

test("listing-ui - badge Verificada e menu dono só em oferta própria assinada", async () => {
  const draft = listing.buildListingDraft({
    id: "listing_ui_verified",
    communityId: "demo-feira-local",
    title: "Mel orgânico",
    body: "500g",
    priceLabel: "30",
    author: "vx_demo_mg",
  });
  const signed = await localAccount.signPayload(draft);
  const own = { ...signed, isOwnLocalPost: true };

  const htmlOwn = render.renderListingItem(own);
  assert.ok(htmlOwn.includes("listing-verified-pill"));
  assert.ok(htmlOwn.includes("Verificada"));
  assert.ok(htmlOwn.includes("listing-owner-menu"));
  assert.ok(htmlOwn.includes("btn-listing-retract"));
  assert.ok(htmlOwn.includes("btn-listing-status"));

  const htmlRemote = render.renderListingItem({ ...signed, isOwnLocalPost: false });
  assert.ok(htmlRemote.includes("listing-verified-pill"));
  assert.ok(!htmlRemote.includes("listing-owner-menu"));
});

test("listing-ui - renderListingItem oculta oferta com gossipTombstone", () => {
  gossipRetract.__setGossipRetractUiEnabledForTests(true);
  const html = render.renderListingItem({
    id: "listing_tomb",
    type: "listing",
    title: "Sumiu",
    body: "x",
    gossipTombstone: { deleted: true },
  });
  assert.equal(html, "");
});

test("listing-ui - filterListingsByStoredTombstones remove ids tombstonados", async () => {
  const tombIds = new Set(["listing_gone"]);
  const filtered = await listingUi.filterListingsByStoredTombstones(
    [
      { id: "listing_gone", title: "A" },
      { id: "listing_ok", title: "B" },
    ],
    async (id) => (tombIds.has(id) ? { id, type: "tombstone" } : null)
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "listing_ok");
});
