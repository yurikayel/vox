/**
 * @file SUB-07 (ADR-040 §2.3a): o compromisso `sha256-bound-v1` amarra a semente ao `rollId` e ao `peerId`;
 * reaproveitar em outra rolagem ou por outro par é recusado, e `alg` ausente ou desconhecido também.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { boundCommitHex, FAIRPLAY_COMMIT_ALG, sha256Hex } from "../client/js/rpg-crypto-table.js";
import { createFairplayRollOffer, resolveFairplayRoll } from "../client/js/dungeon/vtt-fairplay-roll.js";

const SEED = new Uint8Array(32).fill(7);

async function offer(peerId, rollId, seedBytes = SEED) {
  return createFairplayRollOffer({ peerId, rollId, seedBytes, threshold: 2, totalPeers: 3 });
}

async function resolveWith(commits, reveals, rollId = "r1") {
  return resolveFairplayRoll({ rollId, sides: 20, commits, reveals });
}

test("o compromisso novo declara o alg e difere do SHA-256 simples", async () => {
  const { commit } = await offer("vx_a", "r1");
  assert.equal(commit.alg, FAIRPLAY_COMMIT_ALG);
  assert.equal(FAIRPLAY_COMMIT_ALG, "sha256-bound-v1");
  assert.notEqual(commit.commitO, await sha256Hex(SEED));
});

test("entrada sem ambiguidade: rollId 'ab' + peerId 'c' difere de 'a' + 'bc'", async () => {
  const x = await boundCommitHex({ rollId: "ab", peerId: "c" }, SEED);
  const y = await boundCommitHex({ rollId: "a", peerId: "bc" }, SEED);
  assert.notEqual(x, y);
});

test("rolagem normal com o alg novo fecha verificada", async () => {
  const [a, b] = [await offer("vx_a", "r1"), await offer("vx_b", "r1", new Uint8Array(32).fill(9))];
  const res = await resolveWith([a.commit, b.commit], [a.secret, b.secret]);
  assert.equal(res.ok, true);
  assert.equal(res.verified, true);
});

test("compromisso reaproveitado em outra rolagem é recusado", async () => {
  const [a, b] = [await offer("vx_a", "r1"), await offer("vx_b", "r2")];
  const copia = { ...a.commit, rollId: "r2" };
  const res = await resolveWith([copia, b.commit], [{ ...a.secret, rollId: "r2" }, b.secret], "r2");
  assert.equal(res.ok, false);
  assert.match(res.error, /Revelação inválida do par vx_a/, "a semente de r1 não abre o compromisso de r2");
});

test("compromisso de um par copiado por outro par é recusado", async () => {
  const [a, b] = [await offer("vx_a", "r1"), await offer("vx_b", "r1", new Uint8Array(32).fill(3))];
  const roubado = { ...a.commit, peerId: "vx_b" };
  const res = await resolveWith([a.commit, roubado], [a.secret, { ...a.secret, peerId: "vx_b" }]);
  assert.equal(res.ok, false, "a semente de A não abre o compromisso amarrado a B");
  assert.match(res.error, /Revelação inválida do par vx_b/);
  assert.ok(b);
});

test("alg ausente ou desconhecido é recusado", async () => {
  const [a, b] = [await offer("vx_a", "r1"), await offer("vx_b", "r1", new Uint8Array(32).fill(9))];
  const { alg, ...semAlg } = a.commit;
  assert.ok(alg);
  for (const ruim of [semAlg, { ...a.commit, alg: "sha256" }]) {
    const res = await resolveWith([ruim, b.commit], [a.secret, b.secret]);
    assert.equal(res.ok, false);
    assert.match(res.error, /vx_a.*alg/);
  }
});

test("commitO malformado é recusado dizendo qual par", async () => {
  const [a, b] = [await offer("vx_a", "r1"), await offer("vx_b", "r1")];
  const res = await resolveWith([{ ...a.commit, commitO: "xyz" }, b.commit], [a.secret, b.secret]);
  assert.equal(res.ok, false);
  assert.match(res.error, /inválido do par vx_a/);
});
