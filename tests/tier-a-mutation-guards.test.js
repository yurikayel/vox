/**
 * Guardas de mutação e bordas críticas Tier A:
 * - `client/js/signed-verify.js`
 * - `client/js/shamir-gf256.js`
 * - `client/js/vault/vault-crypto.js`
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { b64UrlToBytes, bytesToB64Url, computeRouteId, verifyPayload } from "../client/js/signed-verify.js";
import { canonicalString } from "../client/js/sig-format.js";
import { combineShares, gfDiv, gfMul, MAX_N, MIN_M, SPLIT_ID_BYTES, splitSecret } from "../client/js/shamir-gf256.js";
import * as vc from "../client/js/vault/vault-crypto.js";

const PASS = "frase longa de teste soberana";

async function createSigner() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const routeId = await computeRouteId(pubKey);
  const signRaw = async (body) => {
    const data = new TextEncoder().encode(canonicalString(body));
    const sig = bytesToB64Url(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, data));
    return { ...body, pubKey, sig };
  };
  return { pubKey, routeId, signRaw, sign: (payload) => signRaw({ ...payload, author: routeId }) };
}

function flipBit(b64url, byteIndex, mask = 1) {
  const bytes = b64UrlToBytes(b64url);
  bytes[byteIndex] ^= mask;
  return bytesToB64Url(bytes);
}

function buildCompactV2({ version = 2, iter = 100_000, saltLen = 16, ivLen = 12, ctLen = 16, totalLen } = {}) {
  const len = totalLen ?? 7 + saltLen + ivLen + ctLen;
  const buf = new Uint8Array(len);
  buf[0] = version;
  if (len >= 5) new DataView(buf.buffer).setUint32(1, iter);
  if (len >= 6) buf[5] = saltLen;
  if (len > 6 + saltLen) buf[6 + saltLen] = ivLen;
  for (let i = 6; i < len; i++) if (i !== 6 + saltLen) buf[i] = (i * 17 + 3) & 0xff;
  return `v2.${bytesToB64Url(buf)}`;
}

// ---------------------------------------------------------------- signed-verify.js

test("signed-verify - base64url trata múltiplos '+', '/', padding '='/'==' e ArrayBuffer", () => {
  const plusBytes = new Uint8Array([0xfb, 0xef, 0xbe, 0xfb, 0xef, 0xbe]);
  const slashBytes = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  assert.equal(bytesToB64Url(plusBytes), "--------");
  assert.equal(bytesToB64Url(slashBytes), "________");
  assert.deepEqual([...b64UrlToBytes("--------")], [...plusBytes]);
  assert.deepEqual([...b64UrlToBytes("________")], [...slashBytes]);
  assert.equal(bytesToB64Url([0x00]), "AA");
  assert.equal(bytesToB64Url([0x00, 0x00]), "AAA");
  assert.deepEqual([...b64UrlToBytes("AA")], [0x00]);
  assert.deepEqual([...b64UrlToBytes("AA==")], [0x00]);
  assert.deepEqual([...b64UrlToBytes("AAA=")], [0x00, 0x00]);
  assert.equal(bytesToB64Url(new Uint8Array([1, 2, 3]).buffer), bytesToB64Url([1, 2, 3]));
  assert.throws(() => b64UrlToBytes("%%%"));
});

test("signed-verify - computeRouteId fixa vetor SHA-256, ordem x/y e recusa entradas sem x ou y", async () => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("P-256:xval:yval"));
  const expected = "vx_" + bytesToB64Url(digest).slice(0, 20);
  const actual = await computeRouteId({ x: "xval", y: "yval" });
  assert.equal(actual, expected);
  assert.equal(actual.length, 23);
  assert.notEqual(await computeRouteId({ x: "a", y: "b" }), await computeRouteId({ x: "b", y: "a" }));
  for (const bad of [null, undefined, {}, [], 42, { x: "a" }, { y: "b" }, { x: "", y: "b" }, { x: "a", y: "" }]) {
    assert.equal(await computeRouteId(bad), "", JSON.stringify(bad));
  }
});

test("signed-verify - verifyPayload recusa campos ausentes, payload não-objeto e sigv desconhecido", async () => {
  const alice = await createSigner();
  const valid = await alice.sign({ id: "p1", body: "oi", ts: 1, sigv: 2 });
  assert.equal(await verifyPayload(valid), true);
  assert.equal(await verifyPayload(await alice.sign({ id: "p1", body: "oi", ts: 1 })), true);
  for (const field of ["sig", "pubKey", "author"]) {
    const { [field]: _drop, ...rest } = valid;
    assert.equal(await verifyPayload(rest), false, `sem ${field}`);
  }
  assert.equal(await verifyPayload({ ...valid, author: "", pubKey: {} }), false);
  for (const bad of [null, undefined, [], ["sig"], "texto", 0, 42, true]) {
    assert.equal(await verifyPayload(bad), false, String(bad));
  }
  for (const sigv of [1, 3, "2", null, 0, NaN, {}]) {
    assert.equal(await verifyPayload(await alice.sign({ id: "p1", sigv })), false, `sigv=${String(sigv)}`);
  }
});

test("signed-verify - verifyPayload recusa assinatura adulterada em 1 bit (início, meio e fim)", async () => {
  const alice = await createSigner();
  for (const base of [{ id: "v1", body: "oi", ts: 1 }, { id: "v2", body: "oi", ts: 1, sigv: 2 }]) {
    const signed = await alice.sign(base);
    const len = b64UrlToBytes(signed.sig).length;
    assert.equal(await verifyPayload({ ...signed, sig: flipBit(signed.sig, 0, 1) }), false);
    assert.equal(await verifyPayload({ ...signed, sig: flipBit(signed.sig, 0, 0x80) }), false);
    assert.equal(await verifyPayload({ ...signed, sig: flipBit(signed.sig, Math.floor(len / 2), 1) }), false);
    assert.equal(await verifyPayload({ ...signed, sig: flipBit(signed.sig, len - 1, 1) }), false);
  }
});

test("signed-verify - verifyPayload barra falsificação de author mesmo com assinatura válida da pubKey anexada", async () => {
  const alice = await createSigner();
  const mallory = await createSigner();
  const forged = await mallory.signRaw({ id: "p1", body: "impersonado", ts: 1, sigv: 2, author: alice.routeId });
  const legit = await mallory.signRaw({ id: "p1", body: "impersonado", ts: 1, sigv: 2, author: mallory.routeId });
  assert.equal(await verifyPayload(legit), true);
  assert.equal(await verifyPayload(forged), false);
});

test("signed-verify - sigv 2 cobre campos aninhados, aceita reordenação e rejeita campos locais/efêmeros", async () => {
  const alice = await createSigner();
  const signed = await alice.sign({ id: "p2", sigv: 2, ts: 10, meta: { b: 2, a: [1, { y: "ok", x: 0 }] } });
  const reordered = { sig: signed.sig, pubKey: signed.pubKey, meta: { a: [1, { x: 0, y: "ok" }], b: 2 }, ts: 10, sigv: 2, id: "p2", author: signed.author };
  assert.equal(await verifyPayload(reordered), true);
  const tampered = [
    { ...signed, meta: { b: 2, a: [1, { y: "ok", x: 1 }] } },
    { ...signed, meta: { b: 2, a: [1, { y: "ok", x: 0, z: 1 }] } },
    { ...signed, meta: { b: 2, a: [1, { y: "ok", x: 0 }, 2] } },
    { ...signed, _local: true },
    { ...signed, receivedAt: 123456 },
    { ...signed, synced: false },
  ];
  for (const item of tampered) assert.equal(await verifyPayload(item), false);
});

// ---------------------------------------------------------------- shamir-gf256.js

test("shamir-gf256 - aritmética GF(256) cobre identidades e bytes extremos 0x00, 0x01, 0xfe, 0xff", () => {
  for (const x of [0x00, 0x01, 0x02, 0x7f, 0x80, 0xfe, 0xff]) {
    assert.equal(gfMul(0, x), 0);
    assert.equal(gfMul(x, 0), 0);
    assert.equal(gfMul(1, x), x);
    assert.equal(gfMul(x, 1), x);
  }
  for (const x of [0x01, 0x02, 0x80, 0xfe, 0xff]) {
    assert.equal(gfDiv(0, x), 0);
    assert.equal(gfDiv(x, x), 1);
    assert.equal(gfDiv(x, 1), x);
    assert.equal(gfMul(gfDiv(0xff, x), x), 0xff);
  }
  assert.equal(gfDiv(gfMul(0xff, 0xff), 0xff), 0xff);
  assert.throws(() => gfDiv(0, 0), RangeError);
  assert.throws(() => gfDiv(0xff, 0), RangeError);
});

test("shamir-gf256 - splitSecret valida limites exatos de MIN_M, MAX_N, inteiros e m <= n", () => {
  const secret = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  for (const [m, n] of [[MIN_M, MIN_M], [MIN_M, MAX_N], [MAX_N, MAX_N], [3, 3]]) {
    const out = splitSecret(secret, { m, n });
    assert.equal(out.shares.length, n);
    assert.deepEqual(out.shares.map((s) => s.x), Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(b64UrlToBytes(out.splitId).length, SPLIT_ID_BYTES);
    assert.deepEqual(combineShares(out.shares.slice(0, m), m), secret);
  }
  const invalid = [
    [MIN_M - 1, MIN_M], [0, 2], [-1, 2], [MIN_M, MAX_N + 1], [4, 3],
    [2.5, 3], [2, 3.5], [NaN, 3], [2, NaN], ["2", 3], [2, "3"], [2, Infinity],
  ];
  for (const [m, n] of invalid) assert.throws(() => splitSecret(secret, { m, n }), RangeError, `${m}/${n}`);
});

test("shamir-gf256 - splitSecret recusa segredo inválido/vazio e preserva bytes extremos 0x00/0xff", () => {
  for (const bad of [new Uint8Array(0), null, undefined, "abc", [1, 2], new Uint16Array([1]), new ArrayBuffer(4)]) {
    assert.throws(() => splitSecret(bad, { m: 2, n: 3 }), TypeError);
  }
  const extremes = [
    new Uint8Array([0x00]),
    new Uint8Array([0xff]),
    new Uint8Array(16).fill(0x00),
    new Uint8Array(16).fill(0xff),
    Uint8Array.from([0x00, 0xff, 0x01, 0xfe, 0x80, 0x7f]),
  ];
  for (const secret of extremes) {
    const out = splitSecret(secret, { m: 2, n: 3 });
    assert.deepEqual(combineShares([out.shares[0], out.shares[2]], 2), secret);
  }
  const b64Check = splitSecret(new Uint8Array([0xff]), { m: 2, n: 2, random: (b) => b.fill(0xff) });
  assert.match(b64Check.splitId, /^[A-Za-z0-9_-]+$/);
});

test("shamir-gf256 - combineShares valida faixa exata de m, tipo de shares e contagem mínima", () => {
  const secret = new Uint8Array([1, 2, 3, 4]);
  const out = splitSecret(secret, { m: MAX_N, n: MAX_N });
  assert.deepEqual(combineShares(out.shares, MAX_N), secret);
  for (const badM of [MIN_M - 1, MAX_N + 1, 0, -2, 2.5, NaN, "2", null]) {
    assert.throws(() => combineShares(out.shares, badM), RangeError, `m=${String(badM)}`);
  }
  for (const badShares of [null, undefined, "ab", {}, [], out.shares.slice(0, MAX_N - 1)]) {
    assert.throws(() => combineShares(badShares, MAX_N), RangeError);
  }
});

test("shamir-gf256 - combineShares aceita x em [1, 255] e recusa 0, 256, não-inteiros e x repetido", () => {
  const s0 = 0x5a;
  const c1 = 0xa7;
  const shareAt = (x) => ({ splitId: "lim", x, y: new Uint8Array([s0 ^ gfMul(c1, x)]) });
  assert.deepEqual(combineShares([shareAt(1), shareAt(255)], 2), new Uint8Array([s0]));
  for (const badX of [0, -1, 256, 1.5, NaN, "1", Infinity]) {
    assert.throws(() => combineShares([shareAt(1), { splitId: "lim", x: badX, y: new Uint8Array([1]) }], 2), RangeError, `x=${String(badX)}`);
  }
  const dup = { splitId: "lim", x: 1, y: new Uint8Array([0x99]) };
  assert.throws(() => combineShares([shareAt(1), dup], 2), /repetidos/);
});

test("shamir-gf256 - combineShares recusa splitId divergente, y não-Uint8Array, y vazio e tamanhos diferentes", () => {
  const base = splitSecret(new Uint8Array([10, 20, 30]), { m: 2, n: 3 }).shares;
  assert.throws(() => combineShares([base[0], { ...base[1], splitId: "outro" }], 2), /divisões diferentes/);
  for (const badY of [[10, 20, 30], "abc", null, new ArrayBuffer(3)]) {
    assert.throws(() => combineShares([base[0], { ...base[1], y: badY }], 2), /tamanhos/);
  }
  assert.throws(() => combineShares([{ ...base[0], y: new Uint8Array(0) }, { ...base[1], y: new Uint8Array(0) }], 2), /tamanhos/);
  assert.throws(() => combineShares([base[0], { ...base[1], y: new Uint8Array([1, 2]) }], 2), /tamanhos/);
  assert.throws(() => combineShares([{ ...base[0], y: new Uint8Array([1, 2]) }, base[1]], 2), /tamanhos/);
});

// ---------------------------------------------------------------- vault-crypto.js

test("vault-crypto - encryptVaultV2 aplica limites exatos 100_000 e 5_000_000 e recusa fora da faixa/float/NaN", async () => {
  for (const bad of [99_999, 5_000_001, 100_000.5, NaN, Infinity, -100_000, 0, "100000", null]) {
    await assert.rejects(() => vc.encryptVaultV2({ ok: 1 }, PASS, bad), RangeError, `iter=${String(bad)}`);
  }
  const minRec = await vc.encryptVaultV2({ bound: "min" }, PASS, 100_000);
  assert.equal(minRec.iter, 100_000);
  assert.deepEqual(await vc.decryptVaultRecord(minRec, PASS), { bound: "min" });
  const maxRec = await vc.encryptVaultV2({ bound: "max" }, PASS, 5_000_000);
  assert.equal(maxRec.iter, 5_000_000);
  assert.equal(vc.isV2Record(maxRec), true);
});

test("vault-crypto - isV2Record valida limites exatos e recusa float, NaN, salt inválido, array e primitivos", () => {
  assert.equal(vc.isV2Record({ v: 2, salt: "aabb", iter: 100_000 }), true);
  assert.equal(vc.isV2Record({ v: 2, salt: "aabb", iter: 5_000_000 }), true);
  assert.equal(vc.isV2Record({ v: 2, salt: "aabb", iter: 100_000.5 }), true);
  const invalid = [
    null, undefined, [], "v2", 2, true, {},
    { v: 1, salt: "aabb", iter: 100_000 },
    { v: "2", salt: "aabb", iter: 100_000 },
    { v: 2, salt: "", iter: 100_000 },
    { v: 2, salt: "aabb", iter: 99_999 },
    { v: 2, salt: "aabb", iter: 5_000_001 },
    { v: 2, salt: "aabb", iter: NaN },
    { v: 2, salt: "aabb", iter: Infinity },
    { v: 2, salt: "aabb" },
  ];
  for (const rec of invalid) assert.equal(vc.isV2Record(rec), false, JSON.stringify(rec));
});

test("vault-crypto - isRevokedRecord trata null, array, primitivos e campos ausentes", () => {
  for (const notRevoked of [null, undefined, [], "", 0, 42, false, true, {}, { revoked: false }, { revoked: 0 }, { revoked: "" }, { revoked: null }]) {
    assert.equal(vc.isRevokedRecord(notRevoked), false, String(notRevoked));
  }
  assert.equal(vc.isRevokedRecord({ revoked: true }), true);
  assert.equal(vc.isRevokedRecord({ v: 2, revoked: true }), true);
});

test("vault-crypto - normalizeVaultEmail e buildVaultSecret normalizam espaços, maiúsculas, Unicode NFC e vazios", () => {
  assert.equal(vc.normalizeVaultEmail(), "");
  assert.equal(vc.normalizeVaultEmail(null), "");
  assert.equal(vc.normalizeVaultEmail("  \t\n  "), "");
  assert.equal(vc.normalizeVaultEmail("  \tANA.SILVA@EXEMPLO.BR\r\n "), "ana.silva@exemplo.br");
  assert.equal(vc.normalizeVaultEmail("Cafe\u0301@EXEMPLO.BR"), "caf\u00e9@exemplo.br");
  assert.equal(vc.normalizeVaultEmail("ÁÉÍÓÚÇ@DOMÍNIO.BR"), "áéíóúç@domínio.br");
  assert.equal(vc.buildVaultSecret("  minha senha  ", "   "), "minha senha");
  assert.equal(vc.buildVaultSecret("  minha senha  ", "  E\u0301@EX.BR "), "\u00e9@ex.br:minha senha");
  assert.equal(vc.buildVaultSecret(null, ""), "");
});

test("vault-crypto - deriveVaultAddress e deriveVaultOwnerToken são determinísticos e distintos entre si", async () => {
  const [addr1, addr2, tok1, tok2, addrNoEmail, tokNoEmail] = await Promise.all([
    vc.deriveVaultAddress("  " + PASS + " ", "  Cafe\u0301@EX.BR "),
    vc.deriveVaultAddress(PASS, "caf\u00e9@ex.br"),
    vc.deriveVaultOwnerToken(PASS, "caf\u00e9@ex.br"),
    vc.deriveVaultOwnerToken(" " + PASS + "\t", "CAFE\u0301@ex.br"),
    vc.deriveVaultAddress(PASS),
    vc.deriveVaultOwnerToken(PASS),
  ]);
  assert.equal(addr1, addr2);
  assert.equal(tok1, tok2);
  assert.match(addr1, /^[0-9a-f]{64}$/);
  assert.match(tok1, /^[0-9a-f]{64}$/);
  assert.equal(new Set([addr1, tok1, addrNoEmail, tokNoEmail]).size, 4);
});

test("vault-crypto - bufferToHex e hexToBytes preservam zeros à esquerda, bytes extremos e entradas vazias", () => {
  const raw = new Uint8Array([0x00, 0x05, 0x0f, 0x10, 0x7f, 0x80, 0xfe, 0xff]);
  assert.equal(vc.bufferToHex(raw), "00050f107f80feff");
  assert.equal(vc.bufferToHex(new Uint8Array([0x0a, 0xbc]).buffer), "0abc");
  assert.deepEqual([...vc.hexToBytes("00050f107f80feff")], [...raw]);
  assert.equal(vc.bufferToHex(new Uint8Array(0)), "");
  assert.equal(vc.hexToBytes("").length, 0);
  assert.equal(vc.hexToBytes(null).length, 0);
  assert.equal(vc.hexToBytes(undefined).length, 0);
});

test("vault-crypto - compactV2PlainBudget e encode/decode URL aplicam bordas exatas de tamanho, versão e iteração", () => {
  assert.equal(vc.compactV2PlainBudget(71), 0);
  assert.equal(vc.compactV2PlainBudget(72), 0);
  assert.equal(vc.compactV2PlainBudget(73), 1);
  assert.equal(vc.compactV2PlainBudget(75), 3);
  for (const bad of [null, undefined, {}, { iv: "aa" }, { ciphertext: "bb" }]) {
    assert.equal(vc.encodeVaultBundleForUrl(bad), "");
  }
  assert.equal(vc.decodeVaultBundleFromUrl(buildCompactV2({ iter: 100_000, saltLen: 4, ivLen: 4, ctLen: 5 }))?.iter, 100_000);
  assert.equal(vc.decodeVaultBundleFromUrl(buildCompactV2({ iter: 5_000_000, saltLen: 6, ivLen: 6, ctLen: 1 }))?.ciphertext.length, 2);
  const badLinks = [
    buildCompactV2({ totalLen: 19, saltLen: 4, ivLen: 4 }),
    buildCompactV2({ version: 1 }),
    buildCompactV2({ version: 3 }),
    buildCompactV2({ saltLen: 14, totalLen: 20 }),
    buildCompactV2({ saltLen: 6, ivLen: 7, ctLen: 0, totalLen: 20 }),
    buildCompactV2({ iter: 99_999 }),
    buildCompactV2({ iter: 5_000_001 }),
    btoa("2:99999:aabb:ccdd:eeff"),
    btoa("2:5000001:aabb:ccdd:eeff"),
    btoa("3:100000:aabb:ccdd:eeff"),
    btoa("2:100000::ccdd:eeff"),
    btoa("2:100000:aabb::eeff"),
    btoa("2:100000:aabb:ccdd:"),
    btoa(":ccdd"),
    btoa("aabb:"),
  ];
  for (const link of badLinks) assert.equal(vc.decodeVaultBundleFromUrl(link), null, link.slice(0, 24));
  assert.equal(vc.decodeVaultBundleFromUrl(btoa("2:5000000:aabb:ccdd:eeff"))?.iter, 5_000_000);
});

test("vault-crypto - decryptVaultRecord e decryptLegacyRecord falham fechados com null para entradas inválidas", async () => {
  const base = { v: 2, salt: "00".repeat(16), iv: "00".repeat(12), ciphertext: "00".repeat(32), iter: 100_000 };
  const nullV2 = [
    null, undefined, [], { ...base, iv: "" }, { ...base, ciphertext: "" }, { ...base, revoked: true },
    { ...base, iter: 99_999 }, { ...base, iter: 5_000_001 }, { ...base, salt: "" },
  ];
  for (const rec of nullV2) assert.equal(await vc.decryptVaultRecord(rec, PASS), null);
  for (const rec of [{ ...base, salt: 123 }, { ...base, iter: 100_000.5 }]) {
    await assert.rejects(() => vc.decryptVaultRecord(rec, PASS));
  }
  const badLegacy = [null, undefined, {}, { iv: "aa" }, { ciphertext: "bb" }, { iv: "aa", ciphertext: "bb", revoked: true }, { iv: "aa", ciphertext: "bb", v: 2 }];
  for (const rec of badLegacy) assert.equal(await vc.decryptLegacyRecord(rec, PASS, "passphrase"), null);
});
