/**
 * LT-04 (§3.3–3.4, §5) — propriedades com semente fixa: frase, link `#/sync?b=` e código `VOX1:`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { BIP39_PT } from "../client/js/data/bip39-pt.js";
import * as phrase from "../client/js/identity/recovery-phrase.js";
import * as vaultCrypto from "../client/js/vault/vault-crypto.js";
import * as emailKit from "../client/js/email-kit.js";

const LT04_SEED = 0x4c543034;
const PASS = "frase longa de teste soberana";

/** PRNG determinístico (mulberry32); não usar `Math.random`. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInts(rng, count, max) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(Math.floor(rng() * max));
  return out;
}

test("LT-04 frase — trocar uma palavra por outra da lista recusa (12 palavras válidas)", async () => {
  const rng = mulberry32(LT04_SEED);
  const seed = Uint8Array.from({ length: 16 }, () => (rng() * 256) | 0);
  const words = await phrase.entropyToWords(seed);
  assert.equal(words.length, 12);
  for (let pos = 0; pos < 12; pos++) {
    const swapped = [...words];
    const idx = BIP39_PT.indexOf(swapped[pos]);
    swapped[pos] = BIP39_PT[(idx + 1 + (rng() * 50) | 0) % BIP39_PT.length];
    await assert.rejects(phrase.wordsToEntropy(swapped.join(" ")), /errada ou fora de ordem|não é uma palavra/);
  }
});

test("LT-04 link — `#/sync?b=` truncado recusa sem exceção não tratada", async () => {
  const rec = await vaultCrypto.encryptVaultV2({ routeId: "vx_lt04", seed: "AAAAAAAAAAAAAAAAAAAAAA" }, PASS);
  const encoded = vaultCrypto.encodeVaultBundleForUrl(rec);
  const rng = mulberry32(LT04_SEED ^ 0x5a494e43);
  const cuts = [...new Set([1, 3, 7, ...pickInts(rng, 5, encoded.length), encoded.length - 1])].filter(
    (n) => n > 0 && n < encoded.length
  );
  for (const n of cuts) {
    const frag = encoded.slice(0, n);
    const dec = vaultCrypto.decodeVaultBundleFromUrl(frag);
    const url = `https://vox.local/#/sync?b=${encodeURIComponent(frag)}`;
    const res = await emailKit.restoreAccountFromInputs({ pass: PASS, kitText: url });
    assert.equal(res.ok, false, `truncado em ${n}/${encoded.length}`);
    if (!dec) assert.equal(dec, null);
  }
});

test("LT-04 kit — `VOX1:` truncado recusa sem exceção não tratada", async () => {
  const rec = await vaultCrypto.encryptVaultV2({ routeId: "vx_lt04b", seed: "BBBBBBBBBBBBBBBBBBBBBB" }, PASS);
  const encoded = vaultCrypto.encodeVaultBundleForUrl(rec);
  const code = `VOX1:${encoded}`;
  const rng = mulberry32(LT04_SEED ^ 0x564f5831);
  const cuts = [...new Set([6, 10, ...pickInts(rng, 4, code.length)])].filter((n) => n > 5 && n < code.length);
  for (const n of cuts) {
    const frag = code.slice(0, n);
    const res = await emailKit.restoreAccountFromInputs({ pass: PASS, kitText: frag });
    assert.equal(res.ok, false, `VOX1 truncado em ${n}/${code.length}`);
    if (!emailKit.extractVaultRecordFromEmailKit(frag)) {
      assert.equal(emailKit.extractVaultRecordFromEmailKit(frag), null);
    }
  }
});

test("LT-04 kit — espaço literal no token não é prometido; recusa sem lançar", async () => {
  const rec = await vaultCrypto.encryptVaultV2({ routeId: "vx_lt04c", seed: "CCCCCCCCCCCCCCCCCCCCCC" }, PASS);
  const encoded = vaultCrypto.encodeVaultBundleForUrl(rec);
  const mid = Math.max(4, Math.floor(encoded.length / 2));
  const broken = `https://vox.app/#/sync?b=${encoded.slice(0, mid)} ${encoded.slice(mid)}`;
  const res = await emailKit.restoreAccountFromInputs({ pass: PASS, kitText: broken });
  assert.equal(res.ok, false, "espaço no meio impede abrir o cofre completo");
});