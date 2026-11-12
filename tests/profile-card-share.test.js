import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as centralMemory from "../client/js/central-memory.js";
import * as profileCard from "../client/js/profile-card.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as gossipProfile from "../client/js/peers-gossip-profile.js";
import * as localAccount from "../client/js/local-account.js";

const fresh = () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
};

/** Roda uma sincronização com a memória central falsa e devolve os cartões enviados. */
async function sentProfiles(reply = {}) {
  const originalFetch = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).endsWith("/memory/sync")) return { ok: false };
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ status: "ok", revision: 1, posts: [], tombstones: [], profiles: [], ...reply }) };
  };
  try {
    await centralMemory.syncWithCentralMemory();
  } finally {
    globalThis.fetch = originalFetch;
    centralMemory.setCentralMemoryAutoPush(false);
  }
  return body.profiles.map((c) => c.routeId);
}

test("P1 - só cartão com nome escolhido sai do aparelho", () => {
  fresh();
  profileDirectory.setProfileCard("vx_comnome0000001", { name: "Ana", discoverable: true });
  profileDirectory.setProfileCard("vx_semnome0000001", { name: "", discoverable: true });
  profileDirectory.setProfileCard("vx_sochave0000001", { name: "vx_sochave", discoverable: true });
  const ids = profileDirectory.listShareableProfileCards().map((c) => c.routeId);
  assert.deepEqual(ids, ["vx_comnome0000001"]);
});

test("P1 - conta ativa sem nome não publica cartão na memória central", async () => {
  fresh();
  const acc = await localAccount.ensureLocalAccount();
  assert.equal((await sentProfiles()).includes(acc.routeId), false);
  localAccount.setDisplayName("Ana da Praça");
  assert.equal((await sentProfiles()).includes(acc.routeId), true);
});

test("P1 - as outras contas do cofre não são publicadas junto com a ativa", async () => {
  fresh();
  const first = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Conta Primeira");
  const second = await localAccount.createAdditionalAccount({ displayName: "Conta Segunda" });
  const sent = await sentProfiles();
  assert.equal(sent.includes(second.routeId), true);
  assert.equal(sent.includes(first.routeId), false);
});

test("P1 - quem desligou 'aparecer na malha' não tem o próprio cartão enviado", async () => {
  fresh();
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Ana Reservada");
  localAccount.setMeshDiscoverable(false);
  profileDirectory.setProfileCard(acc.routeId, { name: "Ana Reservada", discoverable: true });
  assert.equal((await sentProfiles()).includes(acc.routeId), false);
  localAccount.setMeshDiscoverable(true);
});

test("P1 - cartão sem nome vindo da malha ou da memória central não é guardado", async () => {
  fresh();
  const unnamed = await profileCard.buildSignedProfileCard();
  assert.equal(await gossipProfile.applyVerifiedProfileCardItem(unnamed), false, "não guarda nem repassa");
  assert.equal(profileDirectory.getProfileCard(unnamed.routeId), null);
  await sentProfiles({ profiles: [{ routeId: "vx_remotosemnome01", name: "" }, { routeId: "vx_remotocomnome1", name: "Bia" }] });
  assert.equal(profileDirectory.getProfileCard("vx_remotosemnome01"), null);
  assert.equal(profileDirectory.getProfileCard("vx_remotocomnome1").name, "Bia");
});
