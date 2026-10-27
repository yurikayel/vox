import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../client/js/app/route-parse.js";

function withLocation({ hash = "", search = "" }, fn) {
  const loc = { hash, search };
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
}

describe("route-parse", () => {
  it("home default and feed query", () => {
    withLocation({ hash: "#/" }, () => {
      assert.deepEqual(parseRoute(), { name: "home", feed: "for-you" });
    });
    withLocation({ hash: "#/?feed=following" }, () => {
      assert.deepEqual(parseRoute(), { name: "home", feed: "following" });
    });
  });

  it("compose-topic uses parts[1] topic not typo", () => {
    withLocation({ hash: "#/compose/topic?c=demo-feira-local" }, () => {
      assert.deepEqual(parseRoute(), {
        name: "compose-topic",
        communityId: "demo-feira-local",
      });
    });
  });

  it("handle via query h=", () => {
    withLocation({ hash: "#/", search: "?h=helena" }, () => {
      assert.deepEqual(parseRoute(), { name: "handle-lookup", slug: "helena" });
    });
  });

  it("status and labs frames", () => {
    withLocation({ hash: "#/status" }, () => {
      assert.deepEqual(parseRoute(), { name: "status" });
    });
    withLocation({ hash: "#/labs/frames" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-frames" });
    });
  });

  it("labs m-of-n flag and hash", () => {
    withLocation({ hash: "#/labs/mofn" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-mofn" });
    });
    withLocation({ hash: "#/", search: "?labs=mofn" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-mofn" });
    });
  });

  it("network steward wizard route", () => {
    withLocation({ hash: "#/settings/network/steward" }, () => {
      assert.deepEqual(parseRoute(), { name: "steward-wizard" });
    });
  });

  it("connect and dm thread", () => {
    withLocation({ hash: "#/connect/vx_abc" }, () => {
      assert.deepEqual(parseRoute(), { name: "connect", routeId: "vx_abc" });
    });
    withLocation({ hash: "#/dm/vx_peer" }, () => {
      assert.deepEqual(parseRoute(), { name: "dm-thread", address: "vx_peer" });
    });
  });
});
