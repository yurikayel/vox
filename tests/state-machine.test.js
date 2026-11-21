/**
 * Máquina de estados finita (`client/js/shared/state-machine.js`) + máquina de sinalização WebRTC.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createScope } from "../client/js/shared/signals.js";
import { createMachine } from "../client/js/shared/state-machine.js";
import { getSignalingMachine, getSignalingState } from "../client/js/webrtc-peer-state.js";
import { createVoiceRecordMachine } from "../client/js/app/inline-composer.js";

test("state-machine — rejeita estado inicial fora do mapa", () => {
  assert.throws(() => createMachine({ initial: "missing", states: { idle: {} } }), /estado inicial/);
});

test("state-machine — transições, guard, hooks e reatividade no escopo", () => {
  const log = [];
  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        onExit: (_p, from, to) => log.push(`exit:${from}->${to}`),
        on: {
          DIAL: { target: "connecting", guard: (_s, url) => Boolean(url), action: (_f, url) => log.push(`dial:${url}`) },
        },
      },
      connecting: {
        onEnter: (_p, from, to) => log.push(`enter:${from}->${to}`),
        on: { OPEN: "open", STOP: "idle" },
      },
      open: { on: { STOP: "idle" } },
    },
  });

  const seen = [];
  const scope = createScope();
  scope.effect(() => { seen.push(machine.state.get()); });

  assert.equal(machine.can("DIAL", ""), false);
  assert.equal(machine.send("DIAL", "").changed, false);
  assert.equal(machine.send("OPEN").changed, false);
  assert.equal(machine.send("DIAL", "wss://s.test").changed, true);
  assert.equal(machine.matches("connecting"), true);
  assert.deepEqual(seen, ["idle", "connecting"]);
  assert.deepEqual(log, ["exit:idle->connecting", "dial:wss://s.test", "enter:idle->connecting"]);
  machine.reset();
  assert.equal(machine.state.peek(), "idle");
  scope.dispose();
});

test("webrtc-peer-state — signalingMachine respeita ciclo idle → connecting → open → backoff → idle", () => {
  const sm = getSignalingMachine();
  sm.reset();
  assert.equal(getSignalingState(), "idle");
  assert.equal(sm.send("OPEN").changed, false);
  assert.equal(sm.send("DIAL").to, "connecting");
  assert.equal(sm.send("OPEN").to, "open");
  assert.equal(sm.send("BACKOFF").to, "backoff");
  assert.equal(sm.send("STOP").to, "idle");
});

test("inline-composer — createVoiceRecordMachine bloqueia duplo REQUEST e trata cancelar/falhar", () => {
  const vm = createVoiceRecordMachine();
  assert.equal(vm.send("START").changed, false);
  assert.equal(vm.send("REQUEST").changed, true);
  assert.equal(vm.matches("requesting"), true);
  assert.equal(vm.send("REQUEST").changed, false);
  assert.equal(vm.send("CANCEL").to, "idle");
  assert.equal(vm.send("REQUEST").to, "requesting");
  assert.equal(vm.send("START").to, "recording");
  assert.equal(vm.send("STOP").to, "stopping");
  assert.equal(vm.send("DONE").to, "idle");
  vm.send("REQUEST");
  assert.equal(vm.send("FAIL").to, "idle");
});
