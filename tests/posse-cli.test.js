import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePosseExportPayload,
  buildPosseShareText,
  dispatchPosseExport,
  postWebhook,
} from "../tools/posse-cli/posse-cli.mjs";

const sample = {
  v: 1,
  type: "vox-posse-export",
  topicId: "top_1",
  communityId: "geral",
  title: "Olá",
  body: "Mundo",
  canonicalUrl: "https://x.test/#/t/top_1",
};

test("posse-cli - validates export payload", () => {
  assert.equal(validatePosseExportPayload(sample).valid, true);
  assert.equal(validatePosseExportPayload({ v: 2 }).valid, false);
});

test("posse-cli - share text includes canonical url", () => {
  const t = buildPosseShareText(sample);
  assert.match(t, /Olá/);
  assert.match(t, /https:\/\/x\.test/);
});

test("posse-cli - webhook dry-run and dispatch", async () => {
  const dry = await postWebhook("https://example.com/h", sample, { dryRun: true });
  assert.equal(dry.ok, true);
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return { ok: true, status: 200 };
  };
  const out = await dispatchPosseExport(sample, {
    webhooks: ["https://example.com/a"],
    fetchImpl,
  });
  assert.equal(out.ok, true);
  assert.equal(called, 1);
});
