import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as peers from "../client/js/peers.js";

const MB = 1024 * 1024;

test("peers - clampCellularCapMb limita ao intervalo PM-52", () => {
  assert.equal(peers.clampCellularCapMb(0), 5);
  assert.equal(peers.clampCellularCapMb(-3), 5);
  assert.equal(peers.clampCellularCapMb("x"), 5);
  assert.equal(peers.clampCellularCapMb(0.4), 1);
  assert.equal(peers.clampCellularCapMb(1), 1);
  assert.equal(peers.clampCellularCapMb(50), 50);
  assert.equal(peers.clampCellularCapMb(99), 50);
  assert.equal(peers.clampCellularCapMb(12.7), 13);
});

test("peers - canServeNow respeita teto diário, wifiOnly e teto no 4G", () => {
  localStorage.clear();
  const settings = {
    enabled: true,
    maxMb: 200,
    wifiOnly: true,
    commOnly: false,
    supporter: false,
    backgroundRelay: true,
    dailyCapMb: 10,
    cellularCapMb: 5,
    webrtcEnabled: true,
  };
  const atCap = { bytesServedToday: 10 * MB, bytesCellularToday: 0 };
  assert.equal(peers.canServeNow(settings, true, atCap), false);

  const onCellular = { bytesServedToday: 0, bytesCellularToday: 0 };
  assert.equal(peers.canServeNow(settings, false, onCellular), false, "wifiOnly bloqueia 4G");

  const cellularOk = { ...settings, wifiOnly: false };
  assert.equal(peers.canServeNow(cellularOk, false, onCellular), true);
  const cellFull = { bytesServedToday: 0, bytesCellularToday: 5 * MB };
  assert.equal(peers.canServeNow(cellularOk, false, cellFull), false);

  assert.equal(peers.canServeNow(cellularOk, true, cellFull), true, "no Wi-Fi vale só o teto diário");
});

test("peers - getPeerSettings normaliza cellularCapMb ao salvar", () => {
  localStorage.clear();
  peers.savePeerSettings({
    enabled: true,
    maxMb: 50,
    wifiOnly: false,
    commOnly: false,
    supporter: false,
    backgroundRelay: false,
    dailyCapMb: 100,
    cellularCapMb: 200,
    webrtcEnabled: true,
  });
  assert.equal(peers.getPeerSettings().cellularCapMb, peers.CELLULAR_CAP_MAX_MB);
});