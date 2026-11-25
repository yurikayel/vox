/**
 * @file Ligação do condutor Fairplay ao par da mesa (ADR-040): só com a flag `vox.lab.fairplay`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireFairplayDriver } from "../client/js/dungeon/vtt-fairplay-wire.js";

function memStorage(v) {
  return { getItem: (k) => (k === "vox.lab.fairplay" ? v : null) };
}

function fakePeer(sent) {
  return { dispatchOp: async (op) => { sent.push(op.type); return { opId: `op-${sent.length}` }; } };
}

test("fairplay wire: com a flag desligada não cria condutor nem manda nada", async () => {
  const sent = [];
  const state = {};
  const out = wireFairplayDriver(state, { peer: fakePeer(sent), peerId: "p1", store: {}, campaignId: "c", storage: memStorage(null) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(out, null);
  assert.equal(state.fairplayDriver, null);
  assert.deepEqual(sent, []);
});

test("fairplay wire: com a flag ligada cria o condutor e publica a chave da sessão", async () => {
  const sent = [];
  const state = {};
  const out = wireFairplayDriver(state, { peer: fakePeer(sent), peerId: "p1", store: {}, campaignId: "c", storage: memStorage("1") });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(state.fairplayDriver, out);
  assert.deepEqual(sent, ["FAIRPLAY_KEY"]);
  out.close();
});
