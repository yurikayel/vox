import { test } from "node:test";
import assert from "node:assert/strict";
import * as seed from "../client/js/community-seed-checklist.js";

const storage = {};

test("community-seed-checklist - pending, state e conclusão", () => {
  const ls = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => {
      storage[k] = v;
    },
    removeItem: (k) => {
      delete storage[k];
    },
  };
  const prev = globalThis.localStorage;
  globalThis.localStorage = ls;
  try {
    Object.keys(storage).forEach((k) => delete storage[k]);

    seed.markSeedPending("bairro-teste");
    assert.equal(seed.getSeedPendingCommunityId(), "bairro-teste");
    assert.ok(seed.shouldOfferSeedRitual("bairro-teste", "vx_user", {}));

    seed.recordSeedInvite("bairro-teste");
    seed.recordSeedInvite("bairro-teste");
    let state = seed.loadSeedState("bairro-teste");
    assert.equal(state.invitesSent, 2);

    assert.ok(!seed.isSeedComplete(state, { topicCount: 0, peerEnabled: true }));
    assert.ok(seed.isSeedComplete(state, { topicCount: 1, peerEnabled: true }));

    seed.finalizeSeedIfComplete("bairro-teste", { topicCount: 1, peerEnabled: true });
    assert.equal(seed.getSeedPendingCommunityId(), "");

    seed.dismissSeedRitual("outra");
    assert.ok(seed.loadSeedState("outra").dismissed);
    assert.ok(!seed.shouldOfferSeedRitual("outra", "vx_user", { owner: "vx_user" }));

    assert.ok(!seed.shouldOfferSeedRitual("demo-aprenda-vox", "vx_user", { owner: "vx_user" }));
    assert.ok(seed.SEED_RITUAL_SKIP_COMMUNITY_IDS.has("demo-aprenda-vox"));
  } finally {
    globalThis.localStorage = prev;
  }
});
