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
  profileDirectory.setProfileCard("vx_cardnamed00000001", { name: "Ana da Malha", discoverable: true });
  const sections = await peopleIndex.buildPeopleSections();
  assert.ok(sections.mesh.some((p) => p.routeId === "vx_cardnamed00000001"));
  // Autor só com a chave (sem nome escolhido) não entra na lista do diretório.
  assert.equal(sections.mesh.some((p) => p.routeId === "vx_anyauthor00000001"), false);
  assert.equal(sections.all.some((p) => p.routeId === "vx_anyauthor00000001"), false);
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

test("people-index - preserva source self mesmo quando autor possui posts locais e unifica todos os cadastrados", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();

  const primary = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Yuri Kayel");
  const secondary = await localAccount.createAdditionalAccount({ displayName: "Segunda Conta" });

  await cacheNode.saveLocalPost({
    id: "t_self_post_1",
    type: "topic",
    author: secondary.routeId,
    title: "Post da segunda conta",
    ts: Date.now(),
  });
  profileDirectory.setProfileCard("vx_peer_externo_001", {
    name: "Peer Externo",
    discoverable: true,
  });

  const sections = await peopleIndex.buildPeopleSections();
  const selfEntry = sections.contacts.find((p) => p.routeId === secondary.routeId);
  const vaultEntry = sections.contacts.find((p) => p.routeId === primary.routeId);
  const meshEntry = sections.mesh.find((p) => p.routeId === "vx_peer_externo_001");

  assert.equal(selfEntry?.source, "self");
  assert.equal(selfEntry?.name, "Segunda Conta");
  assert.equal(vaultEntry?.name, "Yuri Kayel");
  assert.equal(meshEntry?.name, "Peer Externo");
  assert.equal(sections.all.length >= 4, true);
});

test("people-index - deduplica contas que usam o mesmo perfil/avatar Google na malha e no cofre", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();

  const googleAvatar = "https://lh3.googleusercontent.com/a/ACg8ocJ0M8bek1QZ5cqpBxLshqEBN8hx-vUegj1uOWfbTCwgQTwqjuWj=s96-c";
  const primary = await localAccount.ensureLocalAccount();
  localAccount.setProfileEnrichment({
    displayName: "Yuri Kayel",
    avatarUrl: googleAvatar,
    oauthProvider: "google",
    oauthSub: "google-sub-12345",
  });

  // Simula um perfil duplicado na malha com o mesmo avatar do Google mas outro routeId
  profileDirectory.setProfileCard("vx_kRS3iAuYHMWVcp9p7NTc", {
    name: "Yuri Kayel",
    avatarUrl: googleAvatar,
    discoverable: true,
  });

  const all = await peopleIndex.buildPeopleIndex();
  const yuriEntries = all.filter((p) => p.name === "Yuri Kayel");
  // Deve haver EXATAMENTE UMA entrada para Yuri Kayel!
  assert.equal(yuriEntries.length, 1);
  assert.equal(yuriEntries[0].routeId, primary.routeId);
});

test("people-index - deduplica múltiplas contas do cofre local com o mesmo displayName", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();

  const primary = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Yuri Kayel");

  // Cria uma segunda conta com o mesmo nome (cenário de re-login ou múltiplos perfis locais)
  const secondary = await localAccount.createAdditionalAccount({ displayName: "Yuri Kayel" });

  const all = await peopleIndex.buildPeopleIndex();
  const yuriEntries = all.filter((p) => p.name === "Yuri Kayel");
  // O índice unifica contas locais com o mesmo nome sob a fonte de maior prioridade
  assert.equal(yuriEntries.length, 1);
  assert.equal(yuriEntries[0].name, "Yuri Kayel");
});

test("people-index - deduplica avatares Google Workspace / ogw e CDN Meta", () => {
  const g1 = { routeId: "vx_1", name: "Yuri Kayel", avatarUrl: "https://lh3.googleusercontent.com/ogw/AFcK-ZZZ=s96-c" };
  const g2 = { routeId: "vx_2", name: "Yuri Kayel", avatarUrl: "https://lh3.googleusercontent.com/ogw/AFcK-ZZZ=s120" };
  assert.equal(peopleIndex.isSameGoogleIdentity(g1, g2), true);

  const m1 = { routeId: "vx_1", name: "Yuri", avatarUrl: "https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=123" };
  const m2 = { routeId: "vx_2", name: "Yuri", avatarUrl: "https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=123" };
  assert.equal(peopleIndex.isSameGoogleIdentity(m1, m2), true);
});

test("people-index - homônimo de outra chave na malha aparece ao lado de você (não vira \"Você\")", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();

  const me = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Maria Silva");
  // Outra pessoa, outra chave, outra foto: só o nome coincide.
  profileDirectory.setProfileCard("vx_homonimo00000001", {
    name: "Maria Silva",
    avatarUrl: "https://example.org/outra-maria.png",
    discoverable: true,
  });

  const listed = (await peopleIndex.buildPeopleIndex()).filter((p) => p.name === "Maria Silva" && peopleIndex.isListedPerson(p));
  assert.deepEqual(listed.map((p) => p.routeId).sort(), [me.routeId, "vx_homonimo00000001"].sort());
  assert.equal(listed.find((p) => p.routeId === me.routeId).source, "self");
});

test("people-index - duas contas Google ou Meta distintas com o mesmo nome não se escondem", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  profileDirectory.__resetProfileCardsForTests();

  const me = await localAccount.ensureLocalAccount();
  const av1 = "https://lh3.googleusercontent.com/a/ACg8ocJ0M8bek1QZ5cqpBxLshqEBN8hx-vUegj1uOWfbTCwgQTwqjuWj=s96-c";
  const av2 = "https://lh3.googleusercontent.com/a/ACg8ocLFNrwptrJG1AKEV1wMDVmUbqIFntlEpQxRzbAh2I1mseOEJADg=s96-c";
  const meta1 = "https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=111";
  const meta2 = "https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=222";

  localAccount.setProfileEnrichment({ displayName: "Yuri Kayel", avatarUrl: av1, oauthProvider: "google" });
  profileDirectory.setProfileCard(me.routeId, { name: "Yuri Kayel", avatarUrl: av1, discoverable: true });
  profileDirectory.setProfileCard("vx_outro_google01", { name: "Yuri Kayel", avatarUrl: av2, discoverable: true });
  profileDirectory.setProfileCard("vx_meta_conta0001", { name: "Ana", avatarUrl: meta1, discoverable: true });
  profileDirectory.setProfileCard("vx_meta_conta0002", { name: "Ana", avatarUrl: meta2, discoverable: true });

  const all = await peopleIndex.buildPeopleIndex();
  const yuriIds = all.filter((p) => p.name === "Yuri Kayel").map((p) => p.routeId).sort();
  assert.deepEqual(yuriIds, [me.routeId, "vx_outro_google01"].sort());
  assert.equal(all.find((p) => p.routeId === "vx_outro_google01").avatarUrl, av2);
  assert.equal(all.filter((p) => p.name === "Ana").length, 2);
});
