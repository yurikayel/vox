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
  });

  assert.equal(res, true);
  assert.ok(copiedText);
  assert.ok(copiedText.includes("tx_456"));
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
