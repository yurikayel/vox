import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { gfMul, rsDivisor, rsRemainder } from "../client/js/qr-url-gf.js";

test("qr-url-gf - gfMul: zero absorve, 1 é identidade, comutativo", () => {
  assert.equal(gfMul(0, 77), 0);
  assert.equal(gfMul(77, 0), 0);
  assert.equal(gfMul(1, 200), 200);
  assert.equal(gfMul(37, 91), gfMul(91, 37));
});

test("qr-url-gf - gfMul reduz pelo polinômio 0x11d", () => {
  assert.equal(gfMul(2, 128), 0x1d);
  assert.equal(gfMul(2, 2), 4);
  assert.equal(gfMul(0x80, 0x80), 0x13);
});

test("qr-url-gf - todo elemento não nulo tem inverso (campo)", () => {
  for (let a = 1; a < 256; a++) {
    let found = false;
    for (let b = 1; b < 256 && !found; b++) found = gfMul(a, b) === 1;
    assert.ok(found, `sem inverso para ${a}`);
  }
});

test("qr-url-gf - rsDivisor(7) bate com o polinômio gerador da especificação QR", () => {
  assert.deepEqual([...rsDivisor(7)], [127, 122, 154, 164, 11, 68, 117]);
});

test("qr-url-gf - rsDivisor(1) é [1] (x + 1)", () => {
  assert.deepEqual([...rsDivisor(1)], [1]);
});

test("qr-url-gf - dado seguido do resto tem resto zero (código válido)", () => {
  const div = rsDivisor(10);
  const data = Uint8Array.from([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
  const rem = rsRemainder(data, div);
  assert.equal(rem.length, 10);
  const full = Uint8Array.from([...data, ...rem]);
  assert.ok(rsRemainder(full, div).every((b) => b === 0));
});

test("qr-url-gf - dado vazio ou só zeros dá resto zero", () => {
  const div = rsDivisor(5);
  assert.ok(rsRemainder(new Uint8Array(0), div).every((b) => b === 0));
  assert.ok(rsRemainder(new Uint8Array(8), div).every((b) => b === 0));
});

test("qr-url-gf - erro de 1 byte no código é detectado (resto ≠ 0)", () => {
  const div = rsDivisor(7);
  const data = Uint8Array.from([1, 2, 3, 4, 5]);
  const full = Uint8Array.from([...data, ...rsRemainder(data, div)]);
  full[2] ^= 0x55;
  assert.ok(rsRemainder(full, div).some((b) => b !== 0));
});
