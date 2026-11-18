/**
 * Shell compartilhado das telas: props do layout e compartilhar post com quarentena.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as peers from "../client/js/peers.js";
import * as mod from "../client/js/moderation.js";
import { makeShellProps, shareTopicUnlessQuarantined } from "../client/js/app/context.js";

function stubEl() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    appendChild() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  };
}

globalThis.document = {
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => stubEl(),
  body: stubEl(),
};

describe("context — makeShellProps", () => {
  it("propaga métricas, RTC e peer settings para o shell", () => {
    const props = makeShellProps("vox:me", "network", "Rede", "Sub");
    assert.equal(props.walletAddress, "vox:me");
    assert.equal(props.activeTab, "network");
    assert.equal(props.title, "Rede");
    assert.equal(props.subtitle, "Sub");
    assert.deepEqual(props.settings, peers.getPeerSettings());
    assert.deepEqual(props.metrics, peers.getPeerMetrics());
    assert.deepEqual(props.rtcStatus, peers.getRtcStatus());
  });
});

describe("context — shareTopicUnlessQuarantined", () => {
  it("bloqueia compartilhar quando o post está em quarentena local", () => {
    const topicId = "topic-q-test";
    mod.quarantinePost(topicId);
    try {
      const ok = shareTopicUnlessQuarantined({ topicId, title: "T" });
      assert.equal(ok, false);
      assert.equal(mod.canEchoPost(topicId), false);
    } finally {
      mod.unquarantinePost(topicId);
    }
  });

  it("retorna true quando o post não está em quarentena", async () => {
    const ok = shareTopicUnlessQuarantined({ topicId: "topic-clear", title: "Ok" });
    assert.equal(ok, true);
    assert.equal(mod.canEchoPost("topic-clear"), true);
    await new Promise((r) => setImmediate(r));
  });
});