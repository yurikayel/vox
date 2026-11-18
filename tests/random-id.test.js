/**
 * Identificadores locais sorteados com `crypto.getRandomValues` (e não com `Math.random`).
 * - o helper `randomBase36` usa o `crypto` e nunca chama `Math.random`;
 * - o formato e o tamanho de cada id se mantêm (dado guardado e validação de quem lê);
 * O teste-guarda de `Math.random` novo fica em `random-id-guard.test.js`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBase36 } from "../client/js/shared/html.js";
import { newTopicId } from "../client/js/repost-draft.js";
import { buildReport } from "../client/js/report.js";
import { slicePayloadIntoChunks } from "../client/js/labs/parado/chunked-transfer.js";

/** Roda `fn` espiando `Math.random`; devolve o resultado e quantas vezes ele foi chamado. */
function spyMathRandom(fn) {
  const original = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    return original();
  };
  try {
    return { result: fn(), calls };
  } finally {
    Math.random = original;
  }
}

test("randomBase36: sorteia pelo crypto e não chama Math.random", () => {
  const calls = [];
  const fill = (bytes) => {
    calls.push(bytes.length);
    return globalThis.crypto.getRandomValues(bytes);
  };
  const { result: id, calls: mathCalls } = spyMathRandom(() => randomBase36(8, fill));
  assert.match(id, /^[0-9a-z]{8}$/);
  assert.equal(mathCalls, 0, "Math.random não pode gerar identificador");
  assert.ok(calls.length >= 1, "a fonte de bytes foi usada");
});

test("randomBase36: usa o getRandomValues global quando não há fonte injetada", () => {
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let used = 0;
  Object.defineProperty(globalThis.crypto, "getRandomValues", {
    configurable: true,
    value: (bytes) => {
      used += 1;
      return real(bytes);
    },
  });
  try {
    assert.equal(spyMathRandom(() => randomBase36(6)).calls, 0, "Math.random não pode gerar identificador");
  } finally {
    delete globalThis.crypto.getRandomValues;
  }
  assert.ok(used >= 1, "crypto.getRandomValues foi chamado");
});

test("randomBase36: mapeia bytes para base 36 e descarta os que dariam viés", () => {
  const stream = [0, 9, 10, 35, 36, 251, 252, 255, 71, 72];
  const fill = (bytes) => {
    bytes.set(stream.slice(0, bytes.length));
    return bytes;
  };
  // 252 e 255 são descartados; 36 → "0", 251 → "z" (251 % 36 = 35), 71 → "z", 72 → "0".
  assert.equal(randomBase36(8, fill), "09az0zz0");
});

test("randomBase36: refaz o sorteio quando a primeira leva é toda descartada", () => {
  let round = 0;
  const fill = (bytes) => {
    round += 1;
    bytes.fill(round === 1 ? 255 : 1);
    return bytes;
  };
  assert.equal(randomBase36(4, fill), "1111");
  assert.equal(round, 2);
});

test("randomBase36: recusa tamanho inválido", () => {
  for (const bad of [0, -1, 65, 1.5, NaN, "8", undefined]) {
    assert.throws(() => randomBase36(bad), RangeError, String(bad));
  }
});

test("randomBase36: ids diferentes entre si e alfabeto só de minúsculas e dígitos", () => {
  const ids = new Set(Array.from({ length: 500 }, () => randomBase36(10)));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[0-9a-z]{10}$/);
});

test("formatos dos ids se mantêm sem Math.random: top_, rep_ e xfer_", () => {
  const { result: ids, calls } = spyMathRandom(() => ({
    topic: newTopicId(),
    report: buildReport({ postId: "p1", reason: "spam" }, 1700000000000).id,
    transfer: slicePayloadIntoChunks("oi")[0].transferId,
  }));
  assert.equal(calls, 0, "Math.random não pode gerar identificador");
  assert.match(ids.topic, /^top_[0-9a-z]{8}$/);
  assert.match(ids.report, /^rep_[0-9a-z]+_[0-9a-z]{6}$/);
  assert.match(ids.transfer, /^xfer_\d+_[0-9a-z]{7}$/);
});
