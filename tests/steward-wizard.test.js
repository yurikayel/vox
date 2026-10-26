import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_KEY,
  loadDraft,
  saveDraft,
  loadStep,
  saveStep,
  formatRelayHealthSummary,
  verifyRelayHttp,
} from "../client/js/steward-wizard.js";

test("steward-wizard - draft and step persistence", () => {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem("vox-steward-wizard-step");
  assert.deepEqual(loadDraft(), {});
  saveDraft({ pledge: true, communityId: "bairro-centro" });
  assert.equal(loadDraft().communityId, "bairro-centro");
  saveStep(4);
  assert.equal(loadStep(), 4);
  saveStep(99);
  assert.equal(loadStep(), 5);
});

test("steward-wizard - formatRelayHealthSummary quota", () => {
  const line = formatRelayHealthSummary({
    status: "ok",
    communityIndexCount: 2,
    cacheBytes: 64 * 1024 * 1024,
    maxCacheBytes: 512 * 1024 * 1024,
  });
  assert.match(line, /2 espelho/);
  assert.match(line, /64\/512 MB/);
});

test("steward-wizard - verifyRelayHttp ok", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://relay.test/health");
    return {
      ok: true,
      json: async () => ({
        status: "ok",
        communityIndexCount: 1,
        cacheBytes: 0,
        maxCacheBytes: null,
      }),
    };
  };
  try {
    const r = await verifyRelayHttp("https://relay.test/");
    assert.equal(r.ok, true);
    assert.equal(r.data.communityIndexCount, 1);
  } finally {
    globalThis.fetch = prev;
  }
});
