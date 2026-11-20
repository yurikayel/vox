import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { generateRoomKey } from "../client/js/dungeon/vtt-sync-codec.js";
import { saveDungeonPrefs } from "../client/js/dungeon/dungeon-persistence.js";

function makeHost() {
  const host = {
    dataset: {},
    innerHTML: "",
    listeners: {},
    ownerDocument: { querySelector: () => null },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    querySelector() {
      return null;
    },
  };
  return host;
}

test("wireDungeonView joinP2p: convite inválido define rollError", async () => {
  globalThis.localStorage?.clear();
  saveDungeonPrefs({ viewerRole: "gm" });
  const state = createDungeonSessionState();
  const host = makeHost();
  globalThis.location = { hash: "#/dungeon/entrar/mesa-sem-chave" };
  wireDungeonView(host, { screen: "mesa", state, joinP2p: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(state.rollError, /inválido|incompleto/i);
});

test("wireDungeonView joinP2p: prefs viewerRole não sobrescreve jogador P2P", async () => {
  globalThis.localStorage?.clear();
  saveDungeonPrefs({ viewerRole: "gm" });
  class MockBroadcastChannel {
    static rooms = new Map();
    constructor(name) {
      this.name = name;
      if (!MockBroadcastChannel.rooms.has(name)) MockBroadcastChannel.rooms.set(name, new Set());
      MockBroadcastChannel.rooms.get(name).add(this);
    }
    set onmessage(fn) {
      this._onmessage = fn;
    }
    postMessage() {}
    close() {
      MockBroadcastChannel.rooms.get(this.name)?.delete(this);
    }
  }
  globalThis.BroadcastChannel = MockBroadcastChannel;
  const state = createDungeonSessionState();
  const host = makeHost();
  const key = generateRoomKey();
  globalThis.location = { hash: `#/dungeon/entrar/join-wt?gm=vx_gm#k=${key}` };
  wireDungeonView(host, { screen: "mesa", state, joinP2p: true });
  for (let i = 0; i < 50 && state.joinMode !== "p2p_player"; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(state.viewerRole, "player");
  assert.equal(state.joinMode, "p2p_player");
  state.syncPeer?.close?.();
});