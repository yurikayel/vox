/**
 * @file Testes do item PM-30: Quarentena de chave nova editável pelo dono/moderador via `community_update`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cu from "../client/js/community-updates.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as render from "../client/js/render.js";
import { toggleCommunityQuarantine } from "../client/js/app/community-controls.js";
import {
  wantsNewKeyQuarantine,
  heldByQuarantine,
  attachPowIfWanted,
  createKeyAgeBook,
  NEW_KEY_AGE_MS,
} from "../client/js/new-key-guard.js";

const OWNER = "vx_dono_quarantine";
const MOD = "vx_mod_quarantine";
const STRANGER = "vx_estranho_quarantine";
const BASE_COMM = {
  id: "bairro-seguro",
  communityId: "bairro-seguro",
  title: "Bairro Seguro",
  owner: OWNER,
  moderators: [MOD],
  newKeyQuarantine: false,
};

function createUpdate(author, fields, ts) {
  return {
    id: `comm_update_bairro_${ts}`,
    type: cu.COMMUNITY_UPDATE_TYPE,
    communityId: "bairro-seguro",
    author,
    ts,
    updatedAt: ts,
    ...fields,
  };
}

test("PM-30: ativar e desativar quarentena via community_update assinado", () => {
  const comm = { ...BASE_COMM };
  assert.equal(comm.newKeyQuarantine, false);

  const turnOn = createUpdate(OWNER, cu.buildQuarantineUpdate("bairro-seguro", true, 1000), 1000);
  const commActive = cu.applyCommunityUpdates(comm, [turnOn]);
  assert.equal(commActive.newKeyQuarantine, true);
  assert.equal(commActive.newKeyQuarantineSince, "1000");

  const turnOff = createUpdate(MOD, cu.buildQuarantineUpdate("bairro-seguro", false, 2000), 2000);
  const commDisabled = cu.applyCommunityUpdates(commActive, [turnOff]);
  assert.equal(commDisabled.newKeyQuarantine, false);
  assert.equal(commDisabled.newKeyQuarantineSince, "2000");
});

test("PM-30: ordem cronológica prevalece independente da ordem de chegada", () => {
  const comm = { ...BASE_COMM, newKeyQuarantine: true, newKeyQuarantineSince: "500" };
  const u1 = createUpdate(OWNER, cu.buildQuarantineUpdate("bairro-seguro", false, 1000), 1000);
  const u2 = createUpdate(OWNER, cu.buildQuarantineUpdate("bairro-seguro", true, 2000), 2000);

  const resForward = cu.applyCommunityUpdates(comm, [u1, u2]);
  const resReverse = cu.applyCommunityUpdates(comm, [u2, u1]);

  assert.equal(resForward.newKeyQuarantine, true);
  assert.equal(resForward.newKeyQuarantineSince, "2000");
  assert.equal(resReverse.newKeyQuarantine, true);
  assert.equal(resReverse.newKeyQuarantineSince, "2000");
});

test("PM-30: recusa community_update de quem não é dono nem moderador", async () => {
  const comm = { ...BASE_COMM, newKeyQuarantine: true };
  const attack = createUpdate(STRANGER, cu.buildQuarantineUpdate("bairro-seguro", false, 3000), 3000);

  assert.equal(cu.canUpdateCommunity(comm, STRANGER), false);
  const afterAttack = cu.applyCommunityUpdates(comm, [attack]);
  assert.equal(afterAttack.newKeyQuarantine, true, "update de estranho é ignorado");

  await cacheNode.clearLocalPosts();
  const canonicalPost = { id: "c_bairro-seguro", type: "community", communityId: "bairro-seguro", owner: OWNER };
  await cacheNode.saveLocalPost(canonicalPost);

  const acceptable = await cacheNode.isCommunityUpdateAcceptable(attack);
  assert.equal(acceptable, false, "cacheNode rejeita update de quarentena de estranho");
});

test("PM-30: integração com wantsNewKeyQuarantine, heldByQuarantine e attachPowIfWanted", async () => {
  const now = 1_000_000_000_000;
  const storage = new Map();
  const memoryStore = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
  };
  const book = createKeyAgeBook({ storage: memoryStore, now: () => now, ageMs: NEW_KEY_AGE_MS });
  book.noteSeen("vx_old");

  const commBase = { ...BASE_COMM, newKeyQuarantine: false };
  const turnOnUpdate = createUpdate(OWNER, cu.buildQuarantineUpdate("bairro-seguro", true, now), now);
  const commOn = cu.applyCommunityUpdates(commBase, [turnOnUpdate]);

  assert.equal(wantsNewKeyQuarantine(commOn), true);
  const sampleTopics = [
    { id: "t_spam", author: "vx_spammer_new" },
    { id: "t_owner", author: OWNER },
  ];
  const heldOn = await heldByQuarantine(sampleTopics, commOn, { viewer: "vx_other", book: { isNewKey: () => true } });
  assert.deepEqual([...heldOn], ["t_spam"]);

  const payload = { id: "msg_1", body: "Olá" };
  const withPow = await attachPowIfWanted({ ...payload }, commOn, "vx_spammer_new");
  assert.ok(withPow.pow, "anexa PoW quando a quarentena foi ativada por update");

  const turnOffUpdate = createUpdate(OWNER, cu.buildQuarantineUpdate("bairro-seguro", false, now + 100), now + 100);
  const commOff = cu.applyCommunityUpdates(commOn, [turnOffUpdate]);
  assert.equal(wantsNewKeyQuarantine(commOff), false);
  const heldOff = await heldByQuarantine(sampleTopics, commOff, { viewer: "vx_other", book: { isNewKey: () => true } });
  assert.equal(heldOff.size, 0);

  const withoutPow = await attachPowIfWanted({ ...payload }, commOff, "vx_spammer_new");
  assert.equal(withoutPow.pow, undefined, "não anexa PoW após desligar quarentena");
});

test("PM-30: controle na UI é visível para dono/moderador e oculto para terceiros", () => {
  const container = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  const comm = { ...BASE_COMM, newKeyQuarantine: true };

  render.renderCommunity(container, "bairro-seguro", [], comm, { routeId: OWNER, activeTab: "posts" });
  assert.ok(container.innerHTML.includes("community-quarantine-control"));
  assert.ok(container.innerHTML.includes("Ligada"));
  assert.ok(container.innerHTML.includes("btn-toggle-comm-quarantine"));

  const strangerContainer = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  render.renderCommunity(strangerContainer, "bairro-seguro", [], comm, { routeId: STRANGER, activeTab: "posts" });
  assert.ok(!strangerContainer.innerHTML.includes("community-quarantine-control"), "não moderador não vê o controle");
});

test("PM-30: toggleCommunityQuarantine alterna estado e persiste no cacheNode", async () => {
  localStorage.clear();
  const identity = await localAccount.ensureLocalAccount();
  const comm = { ...BASE_COMM, owner: identity.routeId, newKeyQuarantine: false };

  const signed = await toggleCommunityQuarantine("bairro-seguro", comm);
  assert.ok(signed);
  assert.equal(signed.type, cu.COMMUNITY_UPDATE_TYPE);
  assert.equal(signed.newKeyQuarantine, true);
  assert.equal(comm.newKeyQuarantine, true);

  const saved = await cacheNode.getLocalPost(signed.id);
  assert.ok(saved);
  assert.equal(saved.newKeyQuarantine, true);

  const signedOff = await toggleCommunityQuarantine("bairro-seguro", comm, false);
  assert.ok(signedOff);
  assert.equal(signedOff.newKeyQuarantine, false);
  assert.equal(comm.newKeyQuarantine, false);

  const savedOff = await cacheNode.getLocalPost(signedOff.id);
  assert.ok(savedOff);
  assert.equal(savedOff.newKeyQuarantine, false);
});
