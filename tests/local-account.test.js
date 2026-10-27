import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";

test("local-account - gera e persiste par ECDSA P-256 e routeId unico", async () => {
  localStorage.clear();
  const acc1 = await localAccount.ensureLocalAccount();
  assert.ok(acc1.routeId);
  assert.ok(acc1.routeId.startsWith("vx_"));
  assert.equal(acc1.publicJwk.kty, "EC");
  assert.equal(acc1.publicJwk.crv, "P-256");

  const routeId2 = await localAccount.getRouteId();
  assert.equal(routeId2, acc1.routeId);
  assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
});

test("local-account - gerencia display name localmente", async () => {
  localStorage.clear();
  assert.equal(localAccount.getDisplayName(), "");

  localAccount.setDisplayName("Maria da Silva");
  assert.equal(localAccount.getDisplayName(), "Maria da Silva");

  localAccount.setDisplayName("   ");
  assert.equal(localAccount.getDisplayName(), "");
});

test("local-account - assina e verifica payload canonicamente", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();

  const original = {
    type: "topic",
    communityId: "democracia",
    title: "Voz do Povo",
    body: "Post descentralizado sem intermediários",
  };

  const signed = await localAccount.signPayload(original);
  assert.ok(signed.id);
  assert.ok(signed.ts);
  assert.ok(signed.author);
  assert.ok(signed.pubKey);
  assert.ok(signed.sig);
  assert.equal(signed.title, "Voz do Povo");

  const isValid = await localAccount.verifyPayload(signed);
  assert.equal(isValid, true);

  // Adulteração de conteúdo deve invalidar a assinatura
  const tampered = { ...signed, title: "Título Adulterado" };
  const isTamperedValid = await localAccount.verifyPayload(tampered);
  assert.equal(isTamperedValid, false);

  // Payload sem assinatura deve falhar
  assert.equal(await localAccount.verifyPayload(original), false);
});

test("cache-node - armazena e consulta posts locais P2P (local-posts)", async () => {
  await cacheNode.clearLocalPosts();

  const post1 = {
    id: "p_1",
    type: "topic",
    communityId: "tecnologia",
    title: "WebRTC e Redes Mesh",
    ts: 1000,
  };
  const post2 = {
    id: "p_2",
    type: "reply",
    communityId: "tecnologia",
    replyTo: "p_1",
    body: "Excelente iniciativa",
    ts: 2000,
  };
  const comm1 = {
    id: "c_tecnologia",
    type: "community",
    communityId: "tecnologia",
    title: "Tecnologia",
    ts: 500,
  };

  await cacheNode.saveLocalPost(post1);
  await cacheNode.saveLocalPost(post2);
  await cacheNode.saveLocalPost(comm1);

  const fetched1 = await cacheNode.getLocalPost("p_1");
  assert.equal(fetched1?.title, "WebRTC e Redes Mesh");

  const topics = await cacheNode.getLocalPosts({ type: "topic", communityId: "tecnologia" });
  assert.equal(topics.length, 1);
  assert.equal(topics[0].id, "p_1");

  const replies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "p_1" });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, "p_2");

  const comms = await cacheNode.getLocalCommunities();
  assert.equal(comms.length, 1);
  assert.equal(comms[0].communityId, "tecnologia");

  // Testa persistência e busca de tipo listing
  const listing1 = {
    id: "l_1",
    type: "listing",
    communityId: "tecnologia",
    title: "Teclado Mecânico",
    priceLabel: "R$ 250",
    locationLabel: "Pinheiros, SP",
    contactPix: "+5511999998888",
    listingStatus: "available",
    ts: 2500,
  };
  await cacheNode.saveLocalPost(listing1);
  const fetchedListing = await cacheNode.getLocalPost("l_1");
  assert.equal(fetchedListing?.priceLabel, "R$ 250");
  assert.equal(fetchedListing?.locationLabel, "Pinheiros, SP");
  assert.equal(fetchedListing?.contactPix, "+5511999998888");
  assert.equal(fetchedListing?.listingStatus, "available");

  const listings = await cacheNode.getLocalPosts({ type: "listing", communityId: "tecnologia" });
  assert.equal(listings.length, 1);
  assert.equal(listings[0].id, "l_1");
});

test("local-account - gerencia chave Pix opcional localmente", () => {
  localStorage.clear();
  assert.equal(localAccount.getPixKey(), null);

  const saved = localAccount.setPixKey({
    normalized: "lia@voxbrasil.org",
    type: "email",
    masked: "li***a@voxbrasil.org",
  });
  assert.equal(saved.normalized, "lia@voxbrasil.org");
  assert.equal(saved.type, "email");
  assert.ok(saved.updatedAt > 0);

  const retrieved = localAccount.getPixKey();
  assert.equal(retrieved.normalized, "lia@voxbrasil.org");
  assert.equal(retrieved.masked, "li***a@voxbrasil.org");

  localAccount.clearPixKey();
  assert.equal(localAccount.getPixKey(), null);
});

test("local-account - profile enrichment and backup bundle", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  localAccount.setProfileEnrichment({
    displayName: "OAuth User",
    avatarUrl: "https://example.com/a.jpg",
    bio: "bio curta",
    oauthProvider: "google",
  });
  assert.equal(localAccount.getProfileEnrichment()?.oauthProvider, "google");
  assert.equal(localAccount.getDisplayName(), "OAuth User");
  const bundle = await localAccount.exportLocalAccountBundle();
  assert.equal(bundle.enrichment.displayName, "OAuth User");
  localAccount.clearProfileEnrichment();
  assert.equal(localAccount.getProfileEnrichment(), null);
});

test("local-account - wipe gera outro routeId e limpa chaves deste navegador", async () => {
  localStorage.clear();
  const session = {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
      this.store.set(key, String(value));
    },
    removeItem(key) {
      this.store.delete(key);
    },
  };
  globalThis.sessionStorage = session;
  session.setItem("vox-sovereignty-passphrase", "frase-sessao");

  const acc1 = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Nome Temporario");
  localAccount.setPixKey({ normalized: "pix@vox.example", type: "email" });
  localAccount.setProfileEnrichment({ displayName: "Nome Temporario", bio: "bio" });
  localAccount.setMeshDiscoverable(true);
  assert.ok(acc1.routeId);
  assert.ok(localStorage.getItem("vox-local-account-v1"));
  assert.ok(localStorage.getItem("vox-dm-keypair"));

  localAccount.wipeLocalAccount();
  assert.equal(localAccount.getCachedRouteIdSync(), "");
  assert.equal(localStorage.getItem("vox-local-account-v1"), null);
  assert.equal(localStorage.getItem("vox-dm-keypair"), null);
  assert.equal(localStorage.getItem("vox-display-name"), null);
  assert.equal(localStorage.getItem("vox-pix-key-v1"), null);
  assert.equal(localStorage.getItem("vox-profile-enrichment-v1"), null);
  assert.equal(localStorage.getItem("vox-discoverable-mesh-v1"), null);
  assert.equal(session.getItem("vox-sovereignty-passphrase"), null);

  const acc2 = await localAccount.ensureLocalAccount();
  assert.ok(acc2.routeId);
  assert.notEqual(acc2.routeId, acc1.routeId);
});

test("local-account - confirmLocalWipe exige duas confirmações", () => {
  const calls = [];
  assert.equal(
    localAccount.confirmLocalWipe((msg) => {
      calls.push(msg);
      return true;
    }),
    true,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0], localAccount.LOCAL_WIPE_NOTICE);
  assert.equal(calls[1], localAccount.LOCAL_WIPE_NOTICE);

  let n = 0;
  assert.equal(
    localAccount.confirmLocalWipe(() => {
      n += 1;
      return false;
    }),
    false,
  );
  assert.equal(n, 1);
});
