/**
 * PM-09 — `community_update` só vale do dono (ou de moderador listado) e só muda
 * foto, título, descrição e categoria. Antes, qualquer chave trocava a foto e o
 * título de qualquer comunidade, e a atualização mais antiga vencia.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cu from "../client/js/community-updates.js";
import * as cav from "../client/js/shared/community-avatar-image.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as peers from "../client/js/peers.js";
import * as render from "../client/js/render.js";

const OWNER = "vx_dono";
const MOD = "vx_moderador";
const STRANGER = "vx_estranho";
const IMG_DONO = "https://example.com/dono.jpg";
const BASE = { id: "cinema", communityId: "cinema", title: "Cinema", owner: OWNER, image: IMG_DONO, avatar: IMG_DONO };

function update(author, fields, t) {
  return { id: `comm_update_cinema_${t}`, type: "community_update", communityId: "cinema", author, ts: t, updatedAt: t, ...fields };
}

test("PM-09: só dono e moderador listado podem atualizar", () => {
  assert.equal(cu.canUpdateCommunity(BASE, OWNER), true);
  assert.equal(cu.canUpdateCommunity(BASE, STRANGER), false);
  assert.equal(cu.canUpdateCommunity(BASE, ""), false);
  assert.equal(cu.canUpdateCommunity(BASE, undefined), false);
  assert.equal(cu.canUpdateCommunity({ ...BASE, owner: "" }, ""), false);
  assert.equal(cu.canUpdateCommunity(BASE, OWNER.toUpperCase()), false, "routeId é sensível a maiúsculas");
  assert.equal(cu.canUpdateCommunity({ ...BASE, moderators: `vx_a, ${MOD}` }, MOD), true);
  assert.equal(cu.canUpdateCommunity({ ...BASE, moderators: [MOD] }, MOD), true);
});

test("PM-09: só foto, título, descrição e categoria passam", () => {
  const picked = cu.pickCommunityUpdateFields({
    id: "x", author: STRANGER, owner: STRANGER, moderators: STRANGER, sig: "s", pubKey: {},
    title: "Novo", image: "https://example.com/nova.jpg", visibility: "closed", commercialEnabled: true,
  });
  assert.deepEqual(picked, { title: "Novo", image: "https://example.com/nova.jpg", avatar: "https://example.com/nova.jpg" });
  assert.deepEqual(cu.pickCommunityUpdateFields({ title: 42, description: "" }), {});
});

test("PM-09: update de estranho é ignorado; o do dono vale e não troca id nem dono", () => {
  const out = cu.applyCommunityUpdates(BASE, [
    update(STRANGER, { title: "Sequestrada", image: "https://evil.example/golpe.jpg" }, 3),
    update(OWNER, { title: "Cinema Nacional" }, 2),
  ]);
  assert.equal(out.title, "Cinema Nacional");
  assert.equal(out.image, IMG_DONO);
  assert.equal(out.id, "cinema");
  assert.equal(out.owner, OWNER);
  assert.equal(out.author, undefined, "o author do update não vaza para o registro");
  assert.equal(BASE.title, "Cinema", "não muda o objeto de entrada");
});

test("PM-09: a atualização mais nova vence, em qualquer ordem de chegada", () => {
  const older = update(OWNER, { title: "Velho", image: "https://example.com/velha.jpg" }, 10);
  const newer = update(OWNER, { title: "Novo" }, 20);
  for (const list of [[older, newer], [newer, older]]) {
    const out = cu.applyCommunityUpdates(BASE, list);
    assert.equal(out.title, "Novo");
    assert.equal(out.image, "https://example.com/velha.jpg", "campo que o mais novo não traz fica do anterior");
  }
});

test("PM-09: update de outra comunidade ou de outro tipo não se aplica", () => {
  const other = { ...update(OWNER, { title: "Outra" }, 5), communityId: "teatro" };
  const topic = { ...update(OWNER, { title: "Tópico" }, 6), type: "topic" };
  assert.equal(cu.applyCommunityUpdates(BASE, [other, topic]).title, "Cinema");
  assert.equal(cu.applyCommunityUpdates(BASE, null).title, "Cinema");
});

test("PM-09: só o post c_<communityId> define a comunidade", () => {
  assert.equal(cu.isCanonicalCommunityPost({ id: "c_cinema", communityId: "cinema" }), true);
  assert.equal(cu.isCanonicalCommunityPost({ id: "c_x", communityId: "cinema" }), false);
  assert.equal(cu.isCanonicalCommunityPost({ id: "c_cinema" }), false);
});

async function signAs(fresh, payload) {
  if (fresh) localStorage.clear();
  return localAccount.signPayload(payload);
}

async function seedOwnerCommunity() {
  await cacheNode.clearLocalPosts();
  const community = await signAs(true, {
    id: "c_cinema", type: "community", communityId: "cinema", title: "Cinema", image: IMG_DONO, ts: 1000,
  });
  await cacheNode.saveLocalPost(community);
  return community;
}

test("PM-09: getLocalCommunities ignora update de estranho e post que tenta tomar a comunidade", async () => {
  const community = await seedOwnerCommunity();
  const ownerUpdate = await signAs(false, {
    id: "comm_update_cinema_1", type: "community_update", communityId: "cinema", title: "Cinema Nacional", updatedAt: 2000,
  });
  const squat = await signAs(true, {
    id: "c_cinema_squat", type: "community", communityId: "cinema", title: "Minha agora", ts: 1,
  });
  const strangerUpdate = await signAs(false, {
    id: "comm_update_cinema_2", type: "community_update", communityId: "cinema", title: "Sequestrada", image: "https://evil.example/golpe.jpg", updatedAt: 3000,
  });
  for (const item of [ownerUpdate, squat, strangerUpdate]) await cacheNode.saveLocalPost(item);

  const list = (await cacheNode.getLocalCommunities()).filter((c) => c.communityId === "cinema");
  assert.equal(list.length, 1);
  assert.equal(list[0].owner, community.author);
  assert.equal(list[0].title, "Cinema Nacional");
  assert.equal(list[0].image, IMG_DONO);
});

test("PM-09: gossip não grava nem repassa update de estranho", async () => {
  await seedOwnerCommunity();
  const ownerUpdate = await signAs(false, {
    id: "comm_update_cinema_ok", type: "community_update", communityId: "cinema", title: "Do dono", updatedAt: 2000,
  });
  const strangerUpdate = await signAs(true, {
    id: "comm_update_cinema_bad", type: "community_update", communityId: "cinema", title: "Golpe", updatedAt: 3000,
  });
  const unknownCommunity = await signAs(false, {
    id: "comm_update_teatro_1", type: "community_update", communityId: "teatro", title: "Ainda sem dono conhecido", updatedAt: 3000,
  });
  for (const item of [strangerUpdate, ownerUpdate, unknownCommunity]) {
    await peers.handleVoxMessage({ type: "GOSSIP", item, fromPeer: "peer_x" }, () => {}, "rtc");
  }
  assert.equal(await cacheNode.getLocalPost("comm_update_cinema_bad"), null);
  assert.ok(await cacheNode.getLocalPost("comm_update_cinema_ok"));
  assert.ok(await cacheNode.getLocalPost("comm_update_teatro_1"), "sem a comunidade aqui, guarda; o filtro de exibição decide");

  assert.equal(await cacheNode.isCommunityUpdateAcceptable({ ...strangerUpdate, communityId: "" }), false);
});

test("PM-09: gossip não grava update com SVG ou imagem acima do teto", async () => {
  await seedOwnerCommunity();
  const svgUpdate = await signAs(false, {
    id: "comm_update_cinema_svg",
    type: "community_update",
    communityId: "cinema",
    image: "data:image/svg+xml;base64,PHN2Zy8+",
    updatedAt: 4000,
  });
  await peers.handleVoxMessage({ type: "GOSSIP", item: svgUpdate, fromPeer: "peer_svg" }, () => {}, "rtc");
  assert.equal(await cacheNode.getLocalPost("comm_update_cinema_svg"), null);
  assert.equal(cav.communityGossipHasRejectedImages(svgUpdate), true);
});

function renderHeaderHtml(opts) {
  const main = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  render.renderCommunity(main, "cinema", [], { ...BASE, moderators: MOD }, { isMember: false, activeTab: "posts", ...opts });
  return main.innerHTML;
}

test("PM-09: botão de trocar foto segue a mesma regra", () => {
  assert.ok(renderHeaderHtml({ routeId: OWNER }).includes("input-comm-photo-file"));
  assert.ok(renderHeaderHtml({ routeId: MOD }).includes("input-comm-photo-file"));
  assert.ok(!renderHeaderHtml({ routeId: STRANGER, isMod: true }).includes("input-comm-photo-file"),
    "isMod calculado com a carteira não basta: quem assina é a chave local");
});
