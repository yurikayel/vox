import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as peopleIndex from "../client/js/people-index.js";
import * as contacts from "../client/js/contacts.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as handles from "../client/js/handles.js";
import * as localAccount from "../client/js/local-account.js";
import { WELCOME_ROUTE_ID } from "../client/js/vox-welcome-profile.js";

test("people-index - includes welcome and search", async () => {
  contacts.__resetContactsForTests();
  const all = await peopleIndex.buildPeopleIndex();
  assert.ok(all.some((p) => p.routeId === WELCOME_ROUTE_ID));
  const found = await peopleIndex.searchPeople("vox");
  assert.ok(found.some((p) => p.routeId === WELCOME_ROUTE_ID));
});

test("people-index - parseConnectTarget", () => {
  assert.equal(peopleIndex.parseConnectTarget("vx_abc123"), "vx_abc123");
  assert.equal(
    peopleIndex.parseConnectTarget("https://x.test/#/connect/vx_peer"),
    "vx_peer"
  );
  assert.equal(peopleIndex.parseConnectTarget(""), null);
});

test("people-index - extractRecentAuthors dedupes", () => {
  const topics = [
    { author: "vx_a" },
    { author: "vx_b" },
    { author: "vx_a" },
  ];
  const recent = peopleIndex.extractRecentAuthors(topics, 5);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].routeId, "vx_a");
});

test("people-index - mesh-author from gossip posts", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();
  await cacheNode.saveLocalPost({
    id: "t_mesh_1",
    type: "topic",
    author: "vx_meshauthor123456",
    title: "Hi",
    ts: Date.now(),
  });
  const all = await peopleIndex.buildPeopleIndex();
  const mesh = all.find((p) => p.routeId === "vx_meshauthor123456");
  assert.equal(mesh?.source, "mesh-author");
});

test("people-index - mesh-card from profile directory", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();
  profileDirectory.setProfileCard("vx_cardpeer00000001", {
    name: "Cartão Malha",
    discoverable: true,
  });
  const all = await peopleIndex.buildPeopleIndex();
  assert.ok(all.some((p) => p.routeId === "vx_cardpeer00000001" && p.source === "mesh-card"));
});

test("people-index - @handle resolves via cache", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  const routeId = await localAccount.getRouteId();
  handles.cacheHandleMapping("anatest", routeId);
  const found = await peopleIndex.searchPeople("@anatest");
  assert.ok(found.some((p) => p.routeId === routeId));
  assert.ok(localStorage.getItem(peopleIndex.PEOPLE_SEARCH_OK_METRIC));
});

test("people-index - demo only in tour when mesh populated", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();
  await cacheNode.saveLocalPost({
    id: "t_mesh_2",
    type: "reply",
    author: "vx_anyauthor00000001",
    body: "x",
    ts: Date.now(),
  });
  const sections = await peopleIndex.buildPeopleSections();
  assert.ok(sections.mesh.length >= 1);
  assert.ok(sections.tour.length >= 1);
  const demoInMesh = sections.mesh.some((p) => p.source === "demo");
  assert.equal(demoInMesh, false);
});
