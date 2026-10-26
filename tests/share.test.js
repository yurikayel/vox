import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

// Mock de DOM para share e toast
const elements = [];
globalThis.document = {
  querySelector: () => null,
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: "",
      textContent: "",
      classList: { add() {}, remove() {} },
      remove() {},
    };
    elements.push(el);
    return el;
  },
  body: {
    appendChild: () => {},
  },
};

globalThis.window.location = {
  origin: "http://127.0.0.1:8080",
  pathname: "/",
};

const share = await import("../client/js/share.js");

test("share - shareTopic aciona navigator.share se disponível", async () => {
  let sharedPayload = null;
  globalThis.navigator.share = async (data) => {
    sharedPayload = data;
  };

  const res = await share.shareTopic({
    title: "Soberania Digital",
    topicId: "tx_123",
    communityId: "brasil",
  });

  assert.equal(res, true);
  assert.ok(sharedPayload);
  assert.equal(sharedPayload.title, "Soberania Digital | Vox");
  assert.ok(sharedPayload.url.includes("tx_123"));
});

test("share - shareTopic usa fallback de clipboard quando share nao existe", async () => {
  delete globalThis.navigator.share;
  let copiedText = null;
  globalThis.navigator.clipboard = {
    writeText: async (text) => {
      copiedText = text;
    },
  };

  const res = await share.shareTopic({
    title: "Crosspost Teste",
    topicId: "tx_456",
    communityId: "geral",
    author: "Helena",
    body: "Trecho para o Zap.",
  });

  assert.equal(res, true);
  assert.ok(copiedText);
  assert.ok(copiedText.includes("*Crosspost Teste*"));
  assert.ok(copiedText.includes("(Helena)"));
  assert.ok(copiedText.includes("Trecho para o Zap."));
  assert.ok(copiedText.includes("tx_456"));
  assert.match(share.SHARE_CLIPBOARD_RICH_TOAST, /Texto formatado copiado/i);
});

test("share - buildTopicShareText e buildWhatsAppShareUrl formatam texto rico para WhatsApp", () => {
  const text = share.buildTopicShareText({
    title: "Discussão Soberana",
    topicId: "tx_abc",
    author: "Helena",
    body: "Um texto de introdução relevante para o debate cívico.",
  });
  assert.ok(text.includes("*Discussão Soberana*"));
  assert.ok(text.includes("(Helena)"));
  assert.ok(text.includes("Um texto de introdução relevante"));
  assert.ok(text.includes("#/t/tx_abc"));

  const waUrl = share.buildWhatsAppShareUrl({
    title: "Discussão Soberana",
    topicId: "tx_abc",
    author: "Helena",
  });
  assert.ok(waUrl.startsWith("https://api.whatsapp.com/send?text="));
  assert.ok(waUrl.includes(encodeURIComponent("*Discussão Soberana*")));
});

test("share - shareCommunity formata link de comunidade", async () => {
  delete globalThis.navigator.share;
  let copiedText = null;
  globalThis.navigator.clipboard = {
    writeText: async (text) => {
      copiedText = text;
    },
  };

  const res = await share.shareCommunity({
    title: "Tecnologia BR",
    communityId: "tec-br",
  });

  assert.equal(res, true);
  assert.ok(copiedText.includes("tec-br"));
});

test("share - honest limits copy mentions no silent Meta post", () => {
  assert.match(share.SHARE_HONEST_LIMITS_SHORT, /Facebook|Instagram/i);
  assert.match(share.SHARE_HONEST_LIMITS_SHORT, /Web Share|JSON|CLI/i);
  assert.match(share.SHARE_HONEST_LIMITS_SHORT, /Sem post automático/i);
});

test("share - shareListing formata link e texto de oferta para a feira", async () => {
  delete globalThis.navigator.share;
  let copiedText = null;
  globalThis.navigator.clipboard = {
    writeText: async (text) => {
      copiedText = text;
    },
  };

  const res = await share.shareListing({
    title: "Pão de fermentação natural",
    communityId: "demo-feira-local",
    priceLabel: "R$ 28",
  });

  assert.equal(res, true);
  assert.ok(copiedText.includes("Pão de fermentação natural"));
  assert.ok(copiedText.includes("R$ 28"));
  assert.ok(copiedText.includes("#/c/demo-feira-local?tab=listings"));
});
