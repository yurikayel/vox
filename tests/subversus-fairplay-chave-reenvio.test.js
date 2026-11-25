/**
 * @file Regressão PM-111: quem entra na mesa assina a chave Fairplay antes de receber o snapshot; o Mestre recusa
 * por `lamport` atrasado (`out_of_phase`) e o condutor precisa reenviar a chave em vez de ficar sem ela.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createFairplayDriver } from "../client/js/dungeon/vtt-fairplay-driver.js";

function makeDriver() {
  const sent = [];
  const stops = [];
  const driver = createFairplayDriver({
    peerId: "vx_player",
    dispatchOp: async (op) => { sent.push(op); return { opId: `op-${sent.length}` }; },
    loadCampaign: async () => ({}),
    onStopped: (info) => stops.push(info),
  });
  return { driver, sent, stops };
}

test("chave recusada por lamport atrasado é reenviada", async () => {
  const { driver, sent } = makeDriver();
  await driver.start();
  assert.equal(sent.length, 1);
  await driver.onRejected({ opId: "op-1", reason: "out_of_phase" });
  assert.deepEqual(sent.map((o) => o.type), ["FAIRPLAY_KEY", "FAIRPLAY_KEY"], "a chave foi publicada de novo");
  driver.close();
});

test("reenvio da chave tem limite e uma recusa de outro motivo para o condutor", async () => {
  const { driver, sent, stops } = makeDriver();
  await driver.start();
  for (let i = 1; i <= 6; i += 1) await driver.onRejected({ opId: `op-${i}`, reason: "out_of_phase" });
  assert.equal(sent.length, 4, "1 envio + 3 reenvios, no máximo");
  assert.equal(stops.length, 1);
  const other = makeDriver();
  await other.driver.start();
  await other.driver.onRejected({ opId: "op-1", reason: "bad_signature" });
  assert.equal(other.sent.length, 1);
  assert.equal(other.stops[0].reason, "bad_signature");
});

test("chave recusada por não admitido espera a aprovação do Mestre e é reenviada ao ser admitido", async () => {
  const { driver, sent, stops } = makeDriver();
  await driver.start();
  await driver.onRejected({ opId: "op-1", reason: "not_admitted" });
  assert.equal(stops.length, 0, "esperar a aprovação não é parar");
  await driver.onUpdate({ fairplay: { admitted: {}, rolls: {} } });
  assert.equal(sent.length, 1, "sem admissão no log, nada é reenviado");
  await driver.onUpdate({ fairplay: { admitted: { vx_player: {} }, rolls: {} } });
  await driver.onUpdate({ fairplay: { admitted: { vx_player: {} }, rolls: {} } });
  assert.deepEqual(sent.map((o) => o.type), ["FAIRPLAY_KEY", "FAIRPLAY_KEY"], "reenvia uma única vez");
  driver.close();
});
