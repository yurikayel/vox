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

test("nostr-signaling - createNostrSignalEnvelope gera evento efêmero com kind 25000", () => {
  const envelope = nostr.createNostrSignalEnvelope({
    fromPeerId: "peer_alice",
    toPeerId: "peer_bob",
    signalType: "OFFER",
    payload: { sdp: "v=0\r\no=alice" },
    createdAt: 1700000000,
  });

  assert.equal(envelope[0], "EVENT");
  const event = envelope[1];
  assert.equal(event.kind, 25000);
  assert.equal(event.created_at, 1700000000);
  assert.deepEqual(event.tags, [
    ["p", "peer_bob"],
    ["t", "vox-webrtc-signal"],
  ]);

  const body = JSON.parse(event.content);
  assert.equal(body.from, "peer_alice");
  assert.equal(body.to, "peer_bob");
  assert.equal(body.type, "OFFER");
  assert.equal(body.payload.sdp, "v=0\r\no=alice");
});

test("nostr-signaling - createNostrSubscriptionMessage e parseNostrSignalMessage", () => {
  const subMsg = nostr.createNostrSubscriptionMessage("peer_bob");
  assert.equal(subMsg[0], "REQ");
  assert.ok(subMsg[1].startsWith("vox_sig_"));
  assert.deepEqual(subMsg[2].kinds, [25000]);
  assert.deepEqual(subMsg[2]["#p"], ["peer_bob"]);

  const rawServerMsg = JSON.stringify([
    "EVENT",
    subMsg[1],
    {
      kind: 25000,
      content: JSON.stringify({
        from: "peer_alice",
        to: "peer_bob",
        type: "ANSWER",
        payload: { sdp: "v=0\r\no=bob" },
      }),
    },
  ]);

  const parsed = nostr.parseNostrSignalMessage(rawServerMsg, "peer_bob");
  assert.ok(parsed);
  assert.equal(parsed.from, "peer_alice");
  assert.equal(parsed.type, "ANSWER");

  // Rejeita mensagem destinada a outro peer
  const wrongTarget = nostr.parseNostrSignalMessage(rawServerMsg, "peer_charlie");
  assert.equal(wrongTarget, null);
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
