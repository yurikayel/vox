/**
 * Spec dos guardiões v0 §3 (ADR-032 passo 3a) — Shamir em GF(256): aritmética do corpo do AES, vetores fixos,
 * todo subconjunto de M pedaços devolve o segredo, M−1 não, e misturas são recusadas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { combineShares, gfDiv, gfMul, MAX_N, MIN_M, splitSecret } from "../client/js/shamir-gf256.js";

/** Multiplicação lenta (bit a bit), independente das tabelas do módulo. */
function slowMul(a, b) {
  let out = 0;
  let x = a;
  for (let y = b; y; y >>= 1) {
    if (y & 1) out ^= x;
    x = (x << 1) ^ (x & 0x80 ? 0x11b : 0);
  }
  return out;
}

function counterRandom() {
  let c = 0;
  return (buf) => {
    for (let i = 0; i < buf.length; i++) buf[i] = (c++ * 37 + 11) & 0xff;
    return buf;
  };
}

function subsets(list, size) {
  if (size === 0) return [[]];
  if (list.length < size) return [];
  const [head, ...rest] = list;
  return [...subsets(rest, size - 1).map((s) => [head, ...s]), ...subsets(rest, size)];
}

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const SECRET = Uint8Array.from({ length: 16 }, (_, i) => i);

test("shamir - corpo do AES: exemplos do FIPS-197 e tabelas iguais à conta bit a bit", () => {
  assert.equal(gfMul(0x57, 0x83), 0xc1);
  assert.equal(gfMul(0x53, 0xca), 0x01);
  for (let a = 0; a < 256; a += 7) {
    for (let b = 1; b < 256; b += 5) {
      assert.equal(gfMul(a, b), slowMul(a, b));
      assert.equal(gfMul(gfDiv(a, b), b), a);
    }
  }
  assert.throws(() => gfDiv(1, 0), RangeError);
});

test("shamir - vetor fixo 3 de 5 com sorteio determinístico", () => {
  const out = splitSecret(SECRET, { m: 3, n: 5, random: counterRandom() });
  assert.equal(out.splitId, "CzBVep_E6Q4zWH2ix-wRNg");
  assert.deepEqual(out.shares.map((s) => [s.x, hex(s.y)]), [
    [1, "db6ef9642f3a2de073e6512c2752e568"],
    [2, "805597128f61d8eb2890ff8c7c24c603"],
    [3, "5b3a6c75a45ef30c537fa4ab577b2d64"],
    [4, "afb7c87050a5b7203d4bec1774359132"],
    [5, "74d833177b9a9cc746a4b7305f6a7a55"],
  ]);
  assert.ok(out.shares.every((s) => s.splitId === out.splitId));
});

test("shamir - todo subconjunto de M pedaços devolve o segredo (16 e 32 bytes, de 2 de 2 a 7 de 7)", () => {
  for (const size of [16, 32]) {
    const secret = crypto.getRandomValues(new Uint8Array(size));
    for (let n = MIN_M; n <= MAX_N; n++) {
      for (let m = MIN_M; m <= n; m++) {
        const { shares } = splitSecret(secret, { m, n });
        for (const group of subsets(shares, m)) assert.equal(hex(combineShares(group, m)), hex(secret), `${m} de ${n}`);
      }
    }
  }
});

test("shamir - M−1 pedaços não devolvem o segredo, nem fingindo que M é menor", () => {
  const secret = crypto.getRandomValues(new Uint8Array(16));
  const { shares } = splitSecret(secret, { m: 3, n: 5 });
  assert.throws(() => combineShares(shares.slice(0, 2), 3), /São precisos 3 pedaços/);
  for (const pair of subsets(shares, 2)) assert.notEqual(hex(combineShares(pair, 2)), hex(secret));
});

test("shamir - ordem dos pedaços não importa e pedaços a mais são ignorados", () => {
  const { shares } = splitSecret(SECRET, { m: 3, n: 5 });
  assert.deepEqual(combineShares([shares[4], shares[0], shares[2]], 3), SECRET);
  assert.deepEqual(combineShares([...shares].reverse(), 3), SECRET);
});

test("shamir - recusa misturas, repetidos, tamanhos e faixas erradas", () => {
  const a = splitSecret(SECRET, { m: 2, n: 3 });
  const b = splitSecret(SECRET, { m: 2, n: 3 });
  assert.notEqual(a.splitId, b.splitId);
  assert.throws(() => combineShares([a.shares[0], b.shares[1]], 2), /divisões diferentes/);
  assert.throws(() => combineShares([a.shares[0], a.shares[0]], 2), /repetidos/);
  assert.throws(() => combineShares([a.shares[0], { ...a.shares[1], y: a.shares[1].y.slice(1) }], 2), /tamanhos/);
  assert.throws(() => combineShares([a.shares[0], { ...a.shares[1], x: 0 }], 2), /x fora da faixa/);
  assert.throws(() => combineShares(a.shares, 1), /fora da faixa/);
});

test("shamir - parâmetros: M ≥ 2, N ≤ 7, M ≤ N, segredo em bytes", () => {
  for (const [m, n] of [[1, 3], [4, 3], [2, 8], [2.5, 3]]) {
    assert.throws(() => splitSecret(SECRET, { m, n }), RangeError, `${m} de ${n}`);
  }
  assert.throws(() => splitSecret("segredo", { m: 2, n: 3 }), TypeError);
  assert.throws(() => splitSecret(new Uint8Array(0), { m: 2, n: 3 }), TypeError);
});
