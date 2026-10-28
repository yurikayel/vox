import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as explode from "../client/js/explode-dispatch.js";
import * as igToolbar from "../client/js/render/ig-toolbar.js";
import * as feed from "../client/js/render/feed.js";
import * as topic from "../client/js/render/topic.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("explode - buildJanonesExplodeText formats mobilization package with hashtags", () => {
  const text = explode.buildJanonesExplodeText({
    title: "Voto Popular na Praça",
    body: "Vamos defender o salário mínimo e a soberania popular! #SalarioDigno #6x1Nao",
    url: "https://yurikayel.github.io/vox/#/t/top_123",
  });

  assert.ok(text.includes("COMANDO DE MOBILIZAÇÃO: EXPLODE NAS REDES!"));
  assert.ok(text.includes("Voto Popular na Praça"));
  assert.ok(text.includes("#SalarioDigno"));
  assert.ok(text.includes("#6x1Nao"));
  assert.ok(text.includes("https://yurikayel.github.io/vox/#/t/top_123"));
  assert.ok(text.includes("Espalhe nos grupos"));
});

test("explode - buildJanonesExplodeText applies default tags when body has none", () => {
  const text = explode.buildJanonesExplodeText({
    title: "Comunicado Geral",
    body: "Sem tags aqui",
    url: "https://yurikayel.github.io/vox/#/t/top_456",
  });

  assert.ok(text.includes("#Democracia"));
  assert.ok(text.includes("#VozDoPovo"));
  assert.ok(text.includes("#Vox"));
});

test("explode - buildTelegramShareUrl generates t.me share url", () => {
  const url = explode.buildTelegramShareUrl("Mensagem & alerta", "https://yurikayel.github.io/vox/#/t/1");
  assert.ok(url.startsWith("https://t.me/share/url?"));
  assert.ok(url.includes("url="));
  assert.ok(url.includes("text="));
});

test("explode - buildThreadsIntentUrl and buildFacebookShareUrl generate valid share intents", () => {
  const threadsUrl = explode.buildThreadsIntentUrl("Alerta geral", "https://yurikayel.github.io/vox/#/t/1");
  assert.ok(threadsUrl.startsWith("https://www.threads.net/intent/post?text="));
  assert.ok(threadsUrl.includes("Alerta%20geral"));

  const fbUrl = explode.buildFacebookShareUrl("https://yurikayel.github.io/vox/#/t/1", "Mobilização");
  assert.ok(fbUrl.startsWith("https://www.facebook.com/sharer/sharer.php?u="));
  assert.ok(fbUrl.includes("quote="));
});

test("explode - buildExplodeSheetHtml renders launchpad with all 9 network actions", () => {
  const html = explode.buildExplodeSheetHtml({
    id: "top_test_explode",
    title: "Vitória dos Trabalhadores",
    body: "Texto de teste para disparo",
    communityId: "comm_sp",
  });

  assert.ok(html.includes("explode-panel"));
  assert.ok(html.includes("EXPLODE NAS REDES!"));
  assert.ok(html.includes("btn-explode-burst"));
  assert.ok(html.includes('data-explode-action="burst"'));
  assert.ok(html.includes('data-explode-action="whatsapp"'));
  assert.ok(html.includes('data-explode-action="twitter"'));
  assert.ok(html.includes('data-explode-action="bluesky"'));
  assert.ok(html.includes('data-explode-action="threads"'));
  assert.ok(html.includes('data-explode-action="facebook"'));
  assert.ok(html.includes('data-explode-action="instagram"'));
  assert.ok(html.includes('data-explode-action="tiktok"'));
  assert.ok(html.includes('data-explode-action="telegram"'));
  assert.ok(html.includes('data-explode-action="webhooks"'));
  assert.ok(html.includes('data-explode-action="copy"'));
  assert.ok(html.includes('data-explode-action="native"'));
});

test("explode - renderIgToolbar includes btn-explode-post after share", () => {
  const html = igToolbar.renderIgToolbar({
    id: "post_ig_1",
    title: "Post de foto",
    likesCount: 3,
  }, "Maria Acre");

  assert.ok(html.includes("btn-explode-post"));
  assert.ok(html.includes("icon-explode"));
  assert.ok(html.indexOf("btn-share-post") < html.indexOf("btn-explode-post"));
});

test("explode - feed renderPostItem includes btn-explode-post", () => {
  const html = feed.renderPostItem({
    id: "post_feed_1",
    title: "Texto do feed",
    body: "Corpo do post",
    author: "vx_demo",
    ts: Date.now(),
  });

  assert.ok(html.includes("btn-explode-post"));
  assert.ok(html.includes("icon-explode"));
});

test("explode - topic view includes btn-explode-topic", () => {
  const main = { innerHTML: "" };
  topic.renderTopic(main, "topic_view_1", {
    id: "topic_view_1",
    title: "Título do tópico",
    body: "Conteúdo completo",
    author: "vx_author",
    communityId: "comm_demo",
  }, []);

  assert.ok(main.innerHTML.includes("btn-explode-topic"));
  assert.ok(main.innerHTML.includes("btn-explode-post"));
  assert.ok(main.innerHTML.includes("EXPLODE!"));
});

test("explode - posse post-publish sheet offers explode option", () => {
  const posseSrc = fs.readFileSync(path.join(root, "js/posse-dispatch.js"), "utf8");
  assert.ok(posseSrc.includes('data-posse="explode"'));
  assert.ok(posseSrc.includes("EXPLODE!"));
});

test("explode - sw.js caches explode-dispatch.js", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes('"./js/explode-dispatch.js"'));
});
