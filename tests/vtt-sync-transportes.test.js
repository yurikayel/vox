/**
 * @file Transportes do VTT sync: o barramento em memória (`*` não volta ao remetente, envio direto chega só ao alvo)
 * e o transporte por `BroadcastChannel` (ignora o que ele mesmo enviou e o que é para outro par; entrega `*` e o que é seu).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createBroadcastChannelTransport, createInMemorySyncHub } from "../client/js/dungeon/vtt-sync.js";

function collect(transport) {
  const got = [];
  transport.onMessage((m) => got.push(m));
  return got;
}

test("hub: '*' chega a todos menos ao remetente", () => {
  const hub = createInMemorySyncHub();
  const [a, b, c] = ["a", "b", "c"].map((id) => hub.connect(id));
  const [ga, gb, gc] = [collect(a), collect(b), collect(c)];
  a.send("*", { kind: "X" });
  assert.deepEqual([ga.length, gb.length, gc.length], [0, 1, 1]);
  assert.equal(gb[0].from, "a");
});

test("hub: envio direto chega só ao alvo, e par fechado não recebe", () => {
  const hub = createInMemorySyncHub();
  const [a, b, c] = ["a", "b", "c"].map((id) => hub.connect(id));
  const [gb, gc] = [collect(b), collect(c)];
  a.send("b", { kind: "X" });
  assert.deepEqual([gb.length, gc.length], [1, 0]);
  b.close();
  a.send("b", { kind: "Y" });
  a.send("*", { kind: "Z" });
  assert.deepEqual([gb.length, gc.length], [1, 1]);
});

function installFakeBroadcastChannel() {
  const rooms = new Map();
  const original = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class {
    constructor(name) { this.name = name; this.onmessage = null; (rooms.get(name) || rooms.set(name, new Set()).get(name)).add(this); }
    postMessage(data) { for (const ch of rooms.get(this.name)) if (ch !== this) ch.onmessage?.({ data: structuredClone(data) }); }
  };
  return { rooms, restore: () => { globalThis.BroadcastChannel = original; } };
}

test("BroadcastChannel: entrega '*' e o que é para o par; ignora o de outro par e o próprio", () => {
  const fake = installFakeBroadcastChannel();
  try {
    const a = createBroadcastChannelTransport("sala", "a");
    const b = createBroadcastChannelTransport("sala", "b");
    const [ga, gb] = [collect(a), collect(b)];
    a.send("*", { kind: "TODOS" });
    a.send("b", { kind: "SO_B" });
    a.send("c", { kind: "SO_C" });
    assert.deepEqual(gb.map((m) => m.kind), ["TODOS", "SO_B"]);
    assert.deepEqual(ga, [], "o remetente não recebe o que enviou");
    const rooms = [...fake.rooms.get("vox-vtt-room-sala")];
    rooms[0].onmessage({ data: null });
    rooms[0].onmessage({ data: { kind: "EU", from: "a" } });
    rooms[0].onmessage({ data: { kind: "SEM_DESTINO", from: "z" } });
    assert.deepEqual(ga.map((m) => m.kind), ["SEM_DESTINO"], "nulo e eco próprio ficam de fora; sem destino chega");
  } finally {
    fake.restore();
  }
});

test("BroadcastChannel indisponível: erro claro", () => {
  const original = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = undefined;
  try {
    assert.throws(() => createBroadcastChannelTransport("sala", "a"), /BroadcastChannel indisponível/);
  } finally {
    globalThis.BroadcastChannel = original;
  }
});
