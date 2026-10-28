import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as linked from "../client/js/linked-accounts.js";
import * as linkedUi from "../client/js/render/linked-accounts-ui.js";
import * as bskyFeed from "../client/js/bsky-feed.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("linked-accounts - save, load, remove accounts and sync bsky subscription", () => {
  localStorage.clear();
  assert.deepEqual(linked.loadLinkedAccounts(), {});

  linked.saveLinkedAccount("bsky", { handle: "@lula.bsky.social", appPassword: "app-pwd-123", enabled: true });
  const accs = linked.loadLinkedAccounts();
  assert.equal(accs.bsky?.handle, "lula.bsky.social");
  assert.equal(accs.bsky?.appPassword, "app-pwd-123");
  assert.equal(accs.bsky?.enabled, true);
  assert.ok(bskyFeed.loadBskySubscriptions().includes("lula.bsky.social"));

  linked.saveLinkedAccount("twitter", { handle: "vox_brasil", webhook: "https://hook.com/x" });
  assert.equal(linked.loadLinkedAccounts().twitter?.webhook, "https://hook.com/x");

  linked.removeLinkedAccount("twitter");
  assert.equal(linked.loadLinkedAccounts().twitter, undefined);
  assert.ok(linked.loadLinkedAccounts().bsky);
});

test("linked-accounts - auto-replication and general webhook toggles", () => {
  localStorage.clear();
  assert.equal(linked.isAutoReplicationEnabled(), false);
  assert.equal(linked.getGeneralWebhookUrl(), "");

  linked.setAutoReplicationEnabled(true);
  assert.equal(linked.isAutoReplicationEnabled(), true);

  linked.setGeneralWebhookUrl("https://n8n.my-server.com/webhook/vox");
  assert.equal(linked.getGeneralWebhookUrl(), "https://n8n.my-server.com/webhook/vox");

  linked.setGeneralWebhookUrl("");
  assert.equal(linked.getGeneralWebhookUrl(), "");
});

test("linked-accounts - buildReplicationPayload formats event data", () => {
  localStorage.clear();
  linked.saveLinkedAccount("bsky", { handle: "cidadao", enabled: true });
  linked.saveLinkedAccount("threads", { handle: "cidadao_threads", enabled: false });

  const post = {
    id: "top_abc123",
    title: "Manifesto pela Soberania Digital",
    body: "Construindo redes livres sem algoritmo de ódio.",
    canonicalUrl: "https://yurikayel.github.io/vox/#/t/top_abc123",
  };

  const payload = linked.buildReplicationPayload(post);
  assert.equal(payload.event, "vox.post.replicate");
  assert.equal(payload.id, "top_abc123");
  assert.equal(payload.title, "Manifesto pela Soberania Digital");
  assert.equal(payload.linkedNetworks.length, 1);
  assert.equal(payload.linkedNetworks[0].network, "bsky");
  assert.ok(payload.janonesBurst.headline.includes("🚨 NOVO POST NO VOX"));
});

test("linked-accounts - postToBlueskyAtProto creates session and record via AT Protocol", async () => {
  const origFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("createSession")) {
      return { ok: true, json: async () => ({ did: "did:plc:vox123", accessJwt: "jwt_tok" }) };
    }
    return { ok: true, json: async () => ({ uri: "at://did:plc:vox123/app.bsky.feed.post/3k1" }) };
  };

  try {
    const res = await linked.postToBlueskyAtProto("@cidadao.bsky.social", "app-secret", {
      title: "Soberania Popular",
      body: "Post direto via AT Protocol",
      canonicalUrl: "https://yurikayel.github.io/vox/#/t/1",
    });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes("com.atproto.server.createSession"));
    assert.ok(calls[1].url.includes("com.atproto.repo.createRecord"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("linked-accounts - dispatchAutoReplication respects toggle and sends webhooks + ATProto", async () => {
  localStorage.clear();
  linked.setAutoReplicationEnabled(false);
  linked.setGeneralWebhookUrl("https://hook.test/vox");

  const post = { id: "top_test", title: "Teste", body: "Mensagem" };
  const resDisabled = await linked.dispatchAutoReplication(post);
  assert.equal(resDisabled.dispatched, false);
  assert.equal(resDisabled.reason, "auto_replication_disabled");

  linked.setAutoReplicationEnabled(true);
  linked.saveLinkedAccount("bsky", { handle: "user.bsky.social", appPassword: "pwd", enabled: true });
  const origFetch = globalThis.fetch;
  const calledUrls = [];
  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));
    return { ok: true, json: async () => ({ did: "did:plc:1", accessJwt: "jwt", uri: "at://1" }) };
  };

  try {
    const resEnabled = await linked.dispatchAutoReplication(post);
    assert.equal(resEnabled.dispatched, true);
    assert.equal(resEnabled.count, 2);
    assert.ok(calledUrls.includes("https://hook.test/vox"));
    assert.ok(calledUrls.some((u) => u.includes("createRecord")));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("linked-accounts - testLinkedAccount verifies webhook, bsky, github and profile link", async () => {
  localStorage.clear();
  linked.saveLinkedAccount("instagram", { handle: "kayel_yuri" });
  const resInsta = await linked.testLinkedAccount("instagram");
  assert.equal(resInsta.ok, true);
  assert.equal(resInsta.profileUrl, "https://www.instagram.com/kayel_yuri/");
  assert.ok(resInsta.message.includes("@kayel_yuri"));

  linked.saveLinkedAccount("twitter", { handle: "vox_br", webhook: "https://hook.test/ping" });
  const origFetch = globalThis.fetch;
  let pinged = false;
  globalThis.fetch = async () => {
    pinged = true;
    return { ok: true };
  };
  try {
    const resHook = await linked.testLinkedAccount("twitter");
    assert.equal(resHook.ok, true);
    assert.equal(pinged, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("linked-accounts - renderLinkedAccountsHtml renders networks, ATProto field and OAuth button", () => {
  localStorage.clear();
  linked.saveLinkedAccount("bsky", { handle: "teste.bsky.social", appPassword: "secret" });

  const html = linkedUi.renderLinkedAccountsHtml();
  assert.ok(html.includes("Redes Vinculadas"));
  assert.ok(html.includes("Bluesky"));
  assert.ok(html.includes("btn-test-network"));
  assert.ok(html.includes("Testar se conectou"));
  assert.ok(html.includes("AT Protocol direto configurado"));
  assert.ok(html.includes("btn-open-oauth-from-linked"));
  assert.ok(html.includes("Twitter / X"));
  assert.ok(html.includes("Threads"));
  assert.ok(html.includes("Instagram"));
  assert.ok(html.includes("Facebook"));
  assert.ok(html.includes("TikTok"));
  assert.ok(html.includes("GitHub"));
  assert.ok(html.includes("@teste.bsky.social"));
  assert.ok(html.includes("chk-auto-replicate-master"));
  assert.ok(html.includes("input-general-webhook"));
});

test("sw.js caches linked-accounts.js and linked-accounts-ui.js", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes('"./js/linked-accounts.js"'));
  assert.ok(sw.includes('"./js/render/linked-accounts-ui.js"'));
});
