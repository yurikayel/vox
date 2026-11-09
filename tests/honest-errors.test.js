import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  classifyUploadError,
  toHonestError,
  honestMessage,
  isSignalingDown,
  createSignalingHealth,
  SIGNALING_DOWN_GRACE_MS,
} from "../client/js/honest-errors.js";

test("LAN-21: classifica falhas de envio", () => {
  assert.equal(classifyUploadError(Object.assign(new Error("x"), { status: 402 })), "payment");
  assert.equal(classifyUploadError(new Error("HTTP 429")), "rateLimit");
  assert.equal(classifyUploadError(new Error("Insufficient balance")), "quota");
  assert.equal(classifyUploadError(Object.assign(new Error("signal timed out"), { name: "TimeoutError" })), "timeout");
  assert.equal(classifyUploadError(new TypeError("Failed to fetch")), "offline");
  assert.equal(classifyUploadError(new Error("HTTP 500")), "");
});

test("LAN-21: toHonestError troca o texto e guarda a causa", () => {
  const cause = new Error("HTTP 402");
  const e = toHonestError(cause);
  assert.equal(e.kind, "payment");
  assert.equal(e.cause, cause);
  assert.match(e.message, /pediu pagamento/);
  const other = new Error("HTTP 500");
  assert.equal(toHonestError(other), other);
});

test("LAN-21: todos os estados do backlog têm texto", () => {
  for (const k of ["quota", "payment", "gatewaysDown", "signalingDown", "dmNoRelay"]) {
    assert.ok(honestMessage(k).length > 20, k);
  }
});

test("LAN-21: sinalização só cai quando WebSocket desistiu e nenhum relay Nostr está aberto ou abrindo", () => {
  assert.equal(isSignalingDown({ wsOpen: false, wsGaveUp: true }), true);
  assert.equal(isSignalingDown({ wsOpen: true, wsGaveUp: false }), false);
  assert.equal(isSignalingDown({ wsOpen: false, wsGaveUp: false }), false, "ainda girando pela lista de nós");
  assert.equal(isSignalingDown({ wsOpen: false, wsGaveUp: true, nostrOpen: 1 }), false, "Nostr segura a troca");
  assert.equal(isSignalingDown({ wsOpen: false, wsGaveUp: true, nostrPending: 2 }), false, "relays Nostr ainda abrindo");
  assert.equal(isSignalingDown(), false);
  assert.ok(honestMessage("signalingDown").includes("continua lendo"));
  assert.ok(honestMessage("signalingBack"));
});

test("LAN-21: aviso de sinalização caída espera a carência e avisa a volta uma vez", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const changes = [];
    const health = createSignalingHealth({ onChange: (down) => changes.push(down) });
    health.update({ wsOpen: false, wsGaveUp: true });
    assert.equal(health.isDown(), false, "não avisa antes da carência");
    mock.timers.tick(SIGNALING_DOWN_GRACE_MS - 1);
    health.update({ nostrPending: 1 });
    mock.timers.tick(SIGNALING_DOWN_GRACE_MS);
    assert.deepEqual(changes, [], "relay Nostr abrindo cancela o aviso");

    health.update({ nostrPending: 0, nostrOpen: 0 });
    mock.timers.tick(SIGNALING_DOWN_GRACE_MS);
    assert.equal(health.isDown(), true);
    health.update({ wsGaveUp: true });
    mock.timers.tick(SIGNALING_DOWN_GRACE_MS);
    assert.deepEqual(changes, [true], "não repete o aviso");

    health.update({ nostrOpen: 1 });
    assert.deepEqual(changes, [true, false]);
    assert.equal(health.isDown(), false);

    health.update({ nostrOpen: 0 });
    mock.timers.tick(SIGNALING_DOWN_GRACE_MS);
    health.reset();
    assert.equal(health.isDown(), false);
    assert.deepEqual(changes, [true, false, true], "reset (rede desligada) não avisa a volta");
  } finally {
    mock.timers.reset();
  }
});
