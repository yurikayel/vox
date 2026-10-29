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
  assert.equal(sections.tour.length, 0, 'perfis demo foram removidos do índice');
  const demoInMesh = sections.mesh.some((p) => p.source === "demo");
  assert.equal(demoInMesh, false);
});

test("people-index - busca flexível por @vx_... rota curta e nome de exibição local", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Yuri Kayel");

  // 1. Busca pelo prefixo da rota com '@' (ex: @vx_jn2jPl)
  const shortWithAt = `@${acc.routeId.slice(0, 9)}`;
  const byRouteWithAt = await peopleIndex.searchPeople(shortWithAt);
  assert.ok(byRouteWithAt.some((p) => p.routeId === acc.routeId));

  // 2. Busca pelo prefixo da rota sem '@'
  const shortWithoutAt = acc.routeId.slice(0, 9);
  const byRouteWithoutAt = await peopleIndex.searchPeople(shortWithoutAt);
  assert.ok(byRouteWithoutAt.some((p) => p.routeId === acc.routeId));

  // 3. Busca por nome próprio
  const byName = await peopleIndex.searchPeople("Yuri Kayel");
  assert.ok(byName.some((p) => p.routeId === acc.routeId));

  // 4. Busca por primeiro nome
  const byFirstName = await peopleIndex.searchPeople("Yuri");
  assert.ok(byFirstName.some((p) => p.routeId === acc.routeId));

  // 5. parseConnectTarget com '@vx_...'
  assert.equal(peopleIndex.parseConnectTarget(`@${acc.routeId}`), acc.routeId);
});

test("people-index - indexa contas do cofre e exibe em contatos", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  const accVault = await localAccount.createAdditionalAccount({ displayName: "Clarice Co-Irmã" });

  const sections = await peopleIndex.buildPeopleSections();
  assert.ok(sections.contacts.some((p) => p.routeId === accVault.routeId));

  const found = await peopleIndex.searchPeople("Clarice");
  assert.ok(found.some((p) => p.routeId === accVault.routeId));
});
