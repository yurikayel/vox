import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { attachVttPlayerJoin } from "../client/js/dungeon/dungeon-vtt-join.js";
import { buildRoomInviteHref, generateRoomKey } from "../client/js/dungeon/vtt-sync-codec.js";
import { parseRoute } from "../client/js/app/route-parse.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";

class MockBroadcastChannel {
  static rooms = new Map();

  /** @param {string} name */
  constructor(name) {
    this.name = name;
    this._handlers = new Set();
    if (!MockBroadcastChannel.rooms.has(name)) MockBroadcastChannel.rooms.set(name, new Set());
    MockBroadcastChannel.rooms.get(name).add(this);
  }

  /** @param {MessageEvent} ev */
  set onmessage(fn) {
    this._onmessage = fn;
    this._handlers.add(fn);
  }

  /** @param {object} data */
  postMessage(data) {
    for (const peer of MockBroadcastChannel.rooms.get(this.name) || []) {
      if (peer === this) continue;
      peer._onmessage?.({ data });
    }
  }

  close() {
    MockBroadcastChannel.rooms.get(this.name)?.delete(this);
  }
}

test("route-parse: #/dungeon/entrar/:id ativa joinP2p", () => {
  globalThis.location = { hash: "#/dungeon/entrar/mesa-alpha?gm=vx_gm#k=" + generateRoomKey() };
  const route = parseRoute();
  assert.equal(route.name, "dungeon");
  assert.equal(route.joinP2p, true);
  assert.equal(route.tableId, "mesa-alpha");
});

test("attachVttPlayerJoin: convite inválido e BroadcastChannel mock", async () => {
  globalThis.BroadcastChannel = MockBroadcastChannel;
  const state = createDungeonSessionState();
  const bad = await attachVttPlayerJoin(state, "#/dungeon/mesa");
  assert.equal(bad.ok, false);
  const key = generateRoomKey();
  const href = buildRoomInviteHref({ tableId: "mesa-join", gmRouteId: "vx_gm", roomKey: key });
  const ok = await attachVttPlayerJoin(state, href);
  assert.equal(ok.ok, true);
  assert.equal(state.viewerRole, "player");
  assert.equal(state.campaignId, "mesa-join");
  assert.equal(typeof state.syncPeer?.join, "function");
  state.syncPeer?.close?.();
});