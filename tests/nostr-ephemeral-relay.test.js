/**
 * @file Testes do relay Nostr efêmero local usado no E2E de dois navegadores (PM-99).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeWsFrame,
  decodeWsFrames,
  matchesNostrFilter,
  startEphemeralNostrRelay,
} from "../scripts/nostr-ephemeral-relay.mjs";

test("nostr-ephemeral-relay - decodeWsFrames lê quadro mascarado", () => {
  const plain = Buffer.from('["REQ","s1",{"kinds":[25050]}]', "utf8");
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.from(plain);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  const header = Buffer.from([0x81, 0x80 | plain.length]);
  const raw = Buffer.concat([header, mask, masked]);
  const { frames, rest } = decodeWsFrames(raw);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].opcode, 1);
  assert.equal(frames[0].payload.toString("utf8"), plain.toString("utf8"));
  assert.equal(rest.length, 0);
});

test("nostr-ephemeral-relay - encodeWsFrame preserva payloads de 126+ bytes", () => {
  const payload = Buffer.from("x".repeat(300), "utf8");
  const wire = encodeWsFrame(0x1, payload);
  const { frames } = decodeWsFrames(wire);
  assert.equal(frames[0].payload.toString("utf8"), payload.toString("utf8"));
});

test("nostr-ephemeral-relay - matchesNostrFilter confere kind e tags #t/#p", () => {
  const ev = { kind: 25050, pubkey: "abc", tags: [["t", "sala-1"], ["p", "dest"]] };
  assert.equal(matchesNostrFilter(ev, { kinds: [25050], "#t": ["sala-1"] }), true);
  assert.equal(matchesNostrFilter(ev, { kinds: [25050], "#t": ["outra"] }), false);
  assert.equal(matchesNostrFilter(ev, { kinds: [1], "#t": ["sala-1"] }), false);
});

test("nostr-ephemeral-relay - dois WebSockets trocam evento efêmero kind 25050", async () => {
  const relay = await startEphemeralNostrRelay();
  const wsA = new WebSocket(relay.url);
  const wsB = new WebSocket(relay.url);
  try {
    await Promise.all([
      new Promise((r) => { wsA.onopen = r; }),
      new Promise((r) => { wsB.onopen = r; }),
    ]);
    const gotB = new Promise((resolve) => {
      wsB.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg[0] === "EVENT" && msg[2]?.id === "ev_1") resolve(msg[2]);
      };
    });
    wsB.send(JSON.stringify(["REQ", "subB", { kinds: [25050], "#t": ["pm99"] }]));
    await new Promise((r) => setTimeout(r, 40));
    wsA.send(JSON.stringify(["EVENT", { id: "ev_1", kind: 25050, pubkey: "p1", tags: [["t", "pm99"]], content: "oi" }]));
    const received = await gotB;
    assert.equal(received.content, "oi");
    assert.equal(relay.getStats().events, 1);
  } finally {
    wsA.close();
    wsB.close();
    await relay.close();
  }
});
