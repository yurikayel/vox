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
  linked.saveLinkedAccount("bsky", { handle: "cidadao.bsky.social", enabled: true });
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
  assert.equal(resInsta.ok, false, "Instagram não pode ser verificado sem login — nada de ✅ falso");
  assert.equal(resInsta.state, "unverified");
  assert.equal(resInsta.profileUrl, "https://www.instagram.com/kayel_yuri/");
  assert.ok(resInsta.message.includes("@kayel_yuri"));
  assert.ok(!resInsta.message.includes("✅"));

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

test("linked-accounts - tela simples: uma linha por rede, um botão Conectar, avançado recolhido", () => {
  localStorage.clear();
  linked.saveLinkedAccount("bsky", { handle: "teste.bsky.social", appPassword: "secret" });

  const html = linkedUi.renderLinkedAccountsHtml();
  assert.ok(html.includes("Redes Vinculadas"));
  for (const name of ["Bluesky", "Twitter / X", "Threads", "Instagram", "Facebook", "TikTok", "GitHub"]) assert.ok(html.includes(name), name);
  assert.ok(html.includes("@teste.bsky.social"));
  assert.ok(html.includes("btn-test-network") && html.includes("btn-unlink-network"), "ações da conta no menu ⋯");
  assert.equal((html.match(/btn-link-connect/g) || []).length, 6, "um Conectar por rede não conectada");
  assert.ok(html.includes("chk-auto-replicate-master"));
  assert.ok(html.includes('<details class="link-advanced">') && html.includes("input-general-webhook"), "webhook fica em Opções avançadas");
  assert.ok(html.includes("input-net-app-password"));
  assert.ok(!html.includes("escudo cívico soberano"), "sem texto de manifesto na tela de tarefa");
});

test("sw.js caches linked-accounts.js and linked-accounts-ui.js", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes('"./js/linked-accounts.js"'));
  assert.ok(sw.includes('"./js/render/linked-accounts-ui.js"'));
});


test("linked-accounts - vincular exige o @usuário digitado: sem palpites e sem perfil oficial", () => {
  localStorage.clear();
  localStorage.setItem("vox-profile-enrichment", JSON.stringify({ displayName: "Yuri Kayel" }));

  // Nada de adivinhar pelo nome do perfil, ID local ou contas seguidas.
  assert.equal(linked.getSuggestedHandle("bsky"), "");
  assert.equal(linked.getSuggestedHandle("instagram"), "");

  // Sem handle, ou com o perfil oficial da rede, não vincula.
  assert.equal(linked.connectWithOneClick("instagram").ok, false);
  assert.match(linked.connectWithOneClick("instagram", "instagram").error, /perfil oficial/);
  assert.match(linked.connectWithOneClick("twitter", "nome com espaço").error, /não é um usuário válido/);
  assert.equal(linked.loadLinkedAccounts().instagram, undefined);

  // Com o handle real: vincula como "não verificado" e aponta para o perfil dele.
  const res = linked.connectWithOneClick("instagram", "@kayel_yuri");
  assert.equal(res.ok, true);
  assert.equal(res.authUrl, "https://www.instagram.com/kayel_yuri/");
  assert.equal(linked.loadLinkedAccounts().instagram.verified, false);
  assert.equal(linked.confirmLinkedAccount("instagram"), true);
  assert.equal(linked.loadLinkedAccounts().instagram.verified, true);

  // URL colada vira handle.
  assert.equal(linked.validateHandle("instagram", "https://www.instagram.com/kayel_yuri/").handle, "kayel_yuri");

  // Vínculo inválido já salvo (ex.: @instagram inventado) é descartado ao carregar.
  localStorage.setItem(linked.LINKED_ACCOUNTS_KEY, JSON.stringify({ instagram: { handle: "instagram" }, twitter: { handle: "yurix" } }));
  assert.deepEqual(Object.keys(linked.loadLinkedAccounts()), ["twitter"]);

  // UI: campo do @usuário + botão "Vincular", sem a promessa falsa de login automático.
  localStorage.clear();
  const html = linkedUi.renderLinkedAccountsHtml();
  assert.ok(html.includes("btn-one-click-connect"));
  assert.ok(html.includes('aria-label="Seu usuário no Instagram"'));
  assert.ok(!html.includes("loga sozinho"));
  assert.ok(!html.includes("(1 Clique)"));
});

test("linked-accounts - getConnectedIntentTargets returns enabled accounts without direct webhook/ATProto", () => {
  localStorage.clear();
  linked.saveLinkedAccount("twitter", { handle: "yurix", enabled: true });
  linked.saveLinkedAccount("instagram", { handle: "kayel_yuri", enabled: true });
  linked.saveLinkedAccount("bsky", { handle: "yuri.bsky.social", appPassword: "secret", enabled: true });
  linked.saveLinkedAccount("threads", { handle: "yuri_th", webhook: "https://hook.test/th", enabled: true });
  linked.saveLinkedAccount("facebook", { handle: "yuri_fb", enabled: false });

  const targets = linked.getConnectedIntentTargets();
  assert.equal(targets.length, 2);
  assert.equal(targets[0].id, "twitter");
  assert.ok(targets[0].label.includes("@yurix"));
  assert.equal(targets[1].id, "instagram");
  assert.ok(targets[1].label.includes("@kayel_yuri"));
  assert.equal(linked.hasDirectReplicationTargets(), true);
});

test("linked-accounts - dispatchAutoReplication with force:true fires even when master toggle is false", async () => {
  localStorage.clear();
  linked.setAutoReplicationEnabled(false);
  linked.setGeneralWebhookUrl("https://hook.test/forced");

  const origFetch = globalThis.fetch;
  const called = [];
  globalThis.fetch = async (u) => {
    called.push(String(u));
    return { ok: true };
  };

  try {
    const res = await linked.dispatchAutoReplication({ id: "p_force", title: "Forçado" }, { force: true });
    assert.equal(res.dispatched, true);
    assert.equal(res.count, 1);
    assert.ok(called.includes("https://hook.test/forced"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

