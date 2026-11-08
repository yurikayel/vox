import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createNostrTransport, encryptFor, decryptFrom } from "../client/js/nostr-transport.js";
import { generateSecretKey, getPublicKey, bytesToHex } from "../client/js/nostr-event.js";

/** Relay Nostr em memória: repassa EVENT aos assinantes cujo filtro #t casa (efêmero, não guarda). */
function createFakeRelay() {
  const sockets = new Set();
  const published = [];
  class FakeWS {
    constructor() {
      this.readyState = 0;
      this.subs = new Map();
      sockets.add(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(frame) {
      const msg = JSON.parse(frame);
      if (msg[0] === "REQ") this.subs.set(msg[1], msg[2]);
      if (msg[0] !== "EVENT") return;
      published.push(msg[1]);
      for (const s of sockets) {
        for (const [subId, f] of s.subs) {
          const t = msg[1].tags.find((x) => x[0] === "t")?.[1];
          if (f.kinds.includes(msg[1].kind) && f["#t"].includes(t)) queueMicrotask(() => s.onmessage?.({ data: JSON.stringify(["EVENT", subId, msg[1]]) }));
        }
      }
    }
    close() {
      sockets.delete(this);
    }
  }
  return { FakeWS, published };
}

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

test("nostr-transport - REV-09: cifra/decifra só entre os dois pares", async () => {
  const a = generateSecretKey();
  const b = generateSecretKey();
  const c = generateSecretKey();
  const ct = await encryptFor(a, bytesToHex(getPublicKey(b)), { type: "offer", sdp: "v=0" });
  assert.deepEqual(await decryptFrom(b, bytesToHex(getPublicKey(a)), ct), { type: "offer", sdp: "v=0" });
  await assert.rejects(() => decryptFrom(c, bytesToHex(getPublicKey(a)), ct));
});

test("nostr-transport - dois pares se descobrem, trocam identidade e oferta/resposta cifradas", async () => {
  const relay = createFakeRelay();
  const gotA = [];
  const gotB = [];
  const mk = (peerId, address, sink) =>
    createNostrTransport({ relays: ["wss://fake"], peerId, getIdentity: () => ({ address, dmPub: { k: address } }), onMessage: (m) => sink.push(m), WebSocketImpl: relay.FakeWS });
  const A = mk("peer_a", "vx_alice", gotA);
  A.start();
  await settle(150);
  const B = mk("peer_b", "vx_bob", gotB);
  B.start();
  await settle();

  assert.ok(gotA.some((m) => m.type === "peer-joined" && m.peerId === "peer_b" && m.address === "vx_bob"));
  assert.ok(gotB.some((m) => m.type === "peer-joined" && m.peerId === "peer_a" && m.address === "vx_alice"));

  assert.equal(A.send({ type: "offer", to: "peer_b", sdp: { type: "offer", sdp: "v=0 A" } }), true);
  await settle();
  const offer = gotB.find((m) => m.type === "offer");
  assert.equal(offer.from, "peer_a");
  assert.equal(offer.sdp.sdp, "v=0 A");
  assert.equal("to" in offer, false);

  B.send({ type: "answer", to: "peer_a", sdp: { type: "answer", sdp: "v=0 B" } });
  await settle();
  assert.equal(gotA.find((m) => m.type === "answer")?.sdp.sdp, "v=0 B");

  for (const ev of relay.published) {
    assert.ok(!ev.content.includes("vx_alice") && !ev.content.includes("vx_bob"), "endereço nunca vai em claro");
    assert.ok(!ev.content.includes("v=0"), "SDP nunca vai em claro");
  }
  assert.equal(A.send({ type: "offer", to: "peer_desconhecido" }), false);
  A.stop();
  B.stop();
});

test("nostr-transport - ignora evento de outra sala e mensagens próprias", async () => {
  const got = [];
  const T = createNostrTransport({ relays: [], peerId: "peer_x", onMessage: (m) => got.push(m) });
  await T._handleEvent({ id: "1", pubkey: "f".repeat(64), tags: [["t", "outra-sala"]], content: JSON.stringify({ type: "hello", from: "peer_y" }) });
  await T._handleEvent({ id: "2", pubkey: T.publicKey, tags: [["t", "vox-brasil-v1"]], content: JSON.stringify({ type: "hello", from: "peer_x" }) });
  assert.deepEqual(got, []);
  assert.equal(T.knows("peer_y"), false);
});
