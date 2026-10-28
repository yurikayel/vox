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
  assert.ok(html.includes("REPLICAÇÃO MULTI-REDES"));
  assert.ok(!html.includes("MÉTODO JANONES"));
  assert.ok(!html.includes("Janones"));
  assert.ok(html.includes("btn-explode-burst"));
  assert.ok(html.includes('data-explode-action="burst"'));
  assert.ok(html.includes('data-explode-action="cascade"'));
  assert.ok(html.includes('data-explode-action="story-card"'));
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

test("explode - posse post-publish sheet offers explode option and omits Janones", () => {
  const posseSrc = fs.readFileSync(path.join(root, "js/posse-dispatch.js"), "utf8");
  assert.ok(posseSrc.includes('data-posse="explode"'));
  assert.ok(posseSrc.includes("📢 EXPLODE! (Disparo Multi-Redes)"));
  assert.ok(!posseSrc.includes("Janones"));
});

test("explode - megaphone emoji and SVG icon are used to clarify civic nature", () => {
  const html = explode.buildExplodeSheetHtml({ id: "post_megaphone", title: "Cívico" });
  assert.ok(html.includes("📢 REPLICAÇÃO MULTI-REDES"));
  assert.ok(html.includes("<span>📢</span>"));

  const igHtml = igToolbar.renderIgToolbar({ id: "post_ig_mega", title: "Foto" }, "Autor");
  assert.ok(igHtml.includes("m3 11 18-5v12L3 14v-3z"));

  const feedHtml = feed.renderPostItem({ id: "post_feed_mega", title: "Feed", ts: Date.now() });
  assert.ok(feedHtml.includes("m3 11 18-5v12L3 14v-3z"));

  const main = { innerHTML: "" };
  topic.renderTopic(main, "topic_mega", { id: "topic_mega", title: "Tema" }, []);
  assert.ok(main.innerHTML.includes("m3 11 18-5v12L3 14v-3z"));
});

test("explode - UI copy, buttons and aria labels do not mention Janones", () => {
  const feedHtml = feed.renderPostItem({
    id: "post_feed_2",
    title: "Post limpo",
    author: "user_1",
    ts: Date.now(),
  });
  assert.ok(!feedHtml.includes("Janones"));

  const igHtml = igToolbar.renderIgToolbar({ id: "post_ig_2", title: "Foto" }, "Autor");
  assert.ok(!igHtml.includes("Janones"));

  const main = { innerHTML: "" };
  topic.renderTopic(main, "topic_2", { id: "topic_2", title: "Tema" }, []);
  assert.ok(!main.innerHTML.includes("Janones"));
});

test("explode - style.css defines backdrop dismissibility and hidden states", () => {
  const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
  assert.ok(css.includes(".explode-sheet[hidden]"));
  assert.ok(css.includes(".explode-sheet:not(.is-open)"));
  assert.ok(css.includes("display: none !important;"));
  assert.ok(css.includes(".explode-sheet {"));
  assert.ok(css.includes("cursor: pointer;"));
  assert.ok(!css.includes("Método Janones"));
});

test("explode - openExplodeSheet and closeExplodeSheet manage sheet lifecycle", () => {
  const elements = new Map();
  const makeEl = (tag = "div") => ({
    tagName: tag.toUpperCase(),
    attributes: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    hidden: false,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; },
    addEventListener() {},
    querySelector() { return { focus() {} }; },
    appendChild() {},
  });

  const prevDoc = globalThis.document;
  const body = makeEl("body");
  globalThis.document = {
    body,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) {
      const el = makeEl(tag);
      return el;
    },
  };
  body.appendChild = (el) => { if (el.id) elements.set(el.id, el); };

  try {
    explode.openExplodeSheet({
      id: "post_test_sheet",
      title: "Teste lifecycle",
      body: "Corpo teste",
    });
    const sheet = globalThis.document.getElementById(explode.EXPLODE_SHEET_ID);
    assert.ok(sheet);
    assert.equal(sheet.hidden, false);
    assert.ok(sheet.classList.contains("is-open"));

    explode.closeExplodeSheet();
    assert.equal(sheet.hidden, true);
    assert.ok(!sheet.classList.contains("is-open"));
  } finally {
    globalThis.document = prevDoc;
  }
});

test("explode - buildTwitterExplodeText formats concise tweet under character limits", () => {
  const tw = explode.buildTwitterExplodeText({
    title: "Voto Popular na Praça contra a escala 6x1 e pelos direitos",
    body: "Vamos defender o salário mínimo e a soberania popular! Mais de mil trabalhadores reunidos hoje em São Paulo. #SalarioDigno #6x1Nao",
  });
  assert.ok(tw.startsWith("📢 Voto Popular na Praça"));
  assert.ok(tw.includes("#SalarioDigno"));
  assert.ok(tw.length <= 220);
});

test("explode - buildBlueskyExplodeText formats post under 290 characters", () => {
  const bsky = explode.buildBlueskyExplodeText({
    title: "Voto Popular na Praça contra a escala 6x1 e pelos direitos",
    body: "Vamos defender o salário mínimo e a soberania popular! Mais de mil trabalhadores reunidos hoje em São Paulo. #SalarioDigno #6x1Nao",
    url: "https://yurikayel.github.io/vox/#/t/top_bsky_123",
  });
  assert.ok(bsky.includes("https://yurikayel.github.io/vox/#/t/top_bsky_123"));
  assert.ok(bsky.includes("#SalarioDigno"));
  assert.ok(bsky.length <= 290);
});

test("explode - buildExplodeSheetHtml renders connected account badges", async () => {
  const linkedModule = await import("../client/js/linked-accounts.js");
  linkedModule.saveLinkedAccount("instagram", { handle: "kayel_yuri" });
  linkedModule.saveLinkedAccount("twitter", { handle: "yurix" });

  const html = explode.buildExplodeSheetHtml({
    id: "post_with_linked",
    title: "Post com badges",
  });

  assert.ok(html.includes('class="explode-grid-connected"'));
  assert.ok(html.includes("kayel_yuri"));
  assert.ok(html.includes("yurix"));
});

test("explode - quickExplodePost triggers burst and copies content", async () => {
  const res = await explode.quickExplodePost({
    id: "post_quick",
    title: "Post rápido",
    body: "Corpo do disparo rápido",
  });
  assert.ok(res.text.includes("Post rápido"));
  assert.ok(res.canonicalUrl.includes("post_quick"));
});

test("explode - cascade stepper manages multi-channel flow", () => {
  const elements = new Map();
  const makeEl = (tag = "div") => ({
    tagName: tag.toUpperCase(),
    attributes: {},
    innerHTML: "",
    hidden: false,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; },
    querySelector() { return { focus() {}, set textContent(v) {} }; },
    remove() { elements.delete(this.id); },
  });

  const prevDoc = globalThis.document;
  const prevWindow = globalThis.window;
  const openedUrls = [];
  globalThis.window = {
    open: (u) => openedUrls.push(u),
  };
  globalThis.document = {
    body: { appendChild: (el) => { if (el.id) elements.set(el.id, el); } },
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => makeEl(tag),
  };

  try {
    explode.startCascadeExplode({
      id: "post_cascade_1",
      title: "Onda Popular",
      body: "Texto onda",
      communityId: "comm_sp",
    });

    const bar = globalThis.document.getElementById(explode.CASCADE_BAR_ID);
    assert.ok(bar);
    assert.ok(bar.innerHTML.includes("WhatsApp"));

    explode.advanceCascadeExplode();
    assert.ok(openedUrls.some((u) => u.includes("twitter.com") || u.includes("x.com")));

    explode.removeCascadeBar();
    assert.equal(globalThis.document.getElementById(explode.CASCADE_BAR_ID), null);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWindow;
  }
});

test("explode - posse post-publish sheet includes quick explode button", () => {
  const posseSrc = fs.readFileSync(path.join(root, "js/posse-dispatch.js"), "utf8");
  assert.ok(posseSrc.includes('data-posse="quick-explode"'));
  assert.ok(posseSrc.includes("Disparo Imediato em 1 Toque"));
});

test("explode - sw.js caches explode-dispatch.js", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes('"./js/explode-dispatch.js"'));
});

test("explode - renderers display explode counter and updateExplodeButtonsUi updates DOM", () => {
  const mockPost = {
    id: "post_exp_dom_1",
    title: "Voto e Democracia",
    body: "Conteúdo do post",
    communityId: "comm_geral",
    explodesCount: 7,
  };

  const feedHtml = feed.renderPostItem(mockPost, "0x123", "Helena", "@helena");
  assert.ok(feedHtml.includes("count-explodes"));
  assert.ok(feedHtml.includes("btn-explode-post"));
  assert.ok(feedHtml.includes(">7<"));

  const igHtml = igToolbar.renderIgToolbar(mockPost, "Helena");
  assert.ok(igHtml.includes("count-explodes"));
  assert.ok(igHtml.includes(">7<"));

  const mainEl = { innerHTML: "" };
  topic.renderTopic(mainEl, "post_exp_dom_1", mockPost, []);
  assert.ok(mainEl.innerHTML.includes("count-explodes"));
  assert.ok(mainEl.innerHTML.includes("7 disparos"));

  // Test DOM update
  const fakeBtn1 = {
    id: "btn_1",
    dataset: { id: "post_exp_dom_1" },
    classList: { add: (c) => fakeBtn1.classes.add(c) },
    classes: new Set(),
    querySelector: (sel) => (sel === ".count-explodes" ? fakeSpan1 : null),
  };
  const fakeSpan1 = { textContent: "" };

  const fakeBtnTopic = {
    id: "btn-explode-topic",
    dataset: { id: "post_exp_dom_1" },
    classList: { add: (c) => fakeBtnTopic.classes.add(c) },
    classes: new Set(),
    querySelector: (sel) => (sel === ".count-explodes" ? fakeSpanTopic : null),
  };
  const fakeSpanTopic = { textContent: "" };

  const prevDoc = globalThis.document;
  globalThis.document = {
    querySelectorAll: (sel) => {
      if (sel.includes('post_exp_dom_1')) return [fakeBtn1, fakeBtnTopic];
      return [];
    },
  };

  try {
    explode.updateExplodeButtonsUi("post_exp_dom_1", 8);
    assert.ok(fakeBtn1.classes.has("exploded"));
    assert.equal(fakeSpan1.textContent, "8");
    assert.ok(fakeBtnTopic.classes.has("exploded"));
    assert.equal(fakeSpanTopic.textContent, "8 disparos");
  } finally {
    globalThis.document = prevDoc;
  }
});
