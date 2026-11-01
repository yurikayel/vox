import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as nostr from "../client/js/nostr-signaling.js";
import * as webrtcPeer from "../client/js/webrtc-peer.js";

test("nostr-signaling - buildNostrSignalingCandidates deduplica e valida protocolo", () => {
  const custom = ["wss://relay.custom.io", "http://invalid.com", "wss://relay.damus.io"];
  const list = nostr.buildNostrSignalingCandidates(custom);

  assert.ok(list.length >= 3);
  assert.ok(list.includes("wss://relay.custom.io"));
  assert.ok(list.includes("wss://nos.lol"));
  assert.ok(!list.includes("http://invalid.com"));
});

test("nostr-signaling - getDecentralizedSignalingMesh combina base, trackers e nostr", () => {
  const cfg = {
    signalingUrls: ["wss://base.vox.net"],
    webtorrentTrackers: ["wss://tracker.openwebtorrent.com"],
    nostrRelays: ["wss://relay.damus.io"],
  };

  const mesh = webrtcPeer.getDecentralizedSignalingMesh(cfg);
  assert.ok(mesh);
  assert.equal(mesh.baseUrls.length, 1);
  assert.equal(mesh.webtorrentTrackers.length, 1);
  assert.ok(mesh.nostrRelays.length >= 1);
  assert.ok(mesh.totalEndpoints >= 3);
});
