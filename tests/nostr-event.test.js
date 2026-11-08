import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as ne from "../client/js/nostr-event.js";

const Z32 = "00".repeat(32);

// Vetores oficiais BIP-340 (bip-0340/test-vectors.csv), índices 0 e 1.
const VECTORS = [
  {
    sk: "0000000000000000000000000000000000000000000000000000000000000003",
    pk: "F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9",
    aux: Z32,
    msg: Z32,
    sig: "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0",
  },
  {
    sk: "B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF",
    pk: "DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659",
    aux: "0000000000000000000000000000000000000000000000000000000000000001",
    msg: "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
    sig: "6896BD60EEAE296DB48A229FF71DFE071BDE413E6D43F917DC8DCF8C78DE33418906D11AC976ABCCB20B091292BFF4EA897EFCB639EA871CFA95F6DE339E4B0A",
  },
];

for (const [i, v] of VECTORS.entries()) {
  test(`nostr-event - BIP-340 vetor ${i}: chave pública, assinatura e verificação`, async () => {
    const sk = ne.hexToBytes(v.sk);
    assert.equal(ne.bytesToHex(ne.getPublicKey(sk)), v.pk.toLowerCase());
    const sig = await ne.schnorrSign(ne.hexToBytes(v.msg), sk, ne.hexToBytes(v.aux));
    assert.equal(ne.bytesToHex(sig), v.sig.toLowerCase());
    assert.equal(await ne.schnorrVerify(sig, ne.hexToBytes(v.msg), ne.hexToBytes(v.pk)), true);
  });
}

test("nostr-event - verificação rejeita assinatura adulterada e chave errada", async () => {
  const v = VECTORS[1];
  const sig = ne.hexToBytes(v.sig);
  sig[63] ^= 0x01;
  assert.equal(await ne.schnorrVerify(sig, ne.hexToBytes(v.msg), ne.hexToBytes(v.pk)), false);
  assert.equal(await ne.schnorrVerify(ne.hexToBytes(v.sig), ne.hexToBytes(v.msg), ne.hexToBytes(VECTORS[0].pk)), false);
  assert.equal(await ne.schnorrVerify(new Uint8Array(10), ne.hexToBytes(v.msg), ne.hexToBytes(v.pk)), false);
});

test("nostr-event - finalizeEvent gera evento NIP-01 efêmero válido e verifyEvent detecta adulteração", async () => {
  const sk = ne.generateSecretKey();
  const ev = await ne.finalizeEvent({ kind: 25050, tags: [["t", "vox-smoke"]], content: "ping", created_at: 1700000000 }, sk);
  assert.match(ev.id, /^[0-9a-f]{64}$/);
  assert.match(ev.sig, /^[0-9a-f]{128}$/);
  assert.equal(ev.pubkey, ne.bytesToHex(ne.getPublicKey(sk)));
  assert.equal(await ne.verifyEvent(ev), true);
  assert.equal(ne.isEphemeralKind(ev.kind), true);
  assert.equal(await ne.verifyEvent({ ...ev, content: "pong" }), false);
});

test("nostr-event - id segue a serialização canônica do NIP-01", async () => {
  const ev = { pubkey: "a".repeat(64), created_at: 1, kind: 1, tags: [], content: "" };
  const expected = ne.bytesToHex(await ne.sha256(new TextEncoder().encode(JSON.stringify([0, ev.pubkey, 1, 1, [], ""]))));
  assert.equal(await ne.computeEventId(ev), expected);
});

test("nostr-event - isEphemeralKind cobre só 20000–29999", () => {
  assert.equal(ne.isEphemeralKind(19999), false);
  assert.equal(ne.isEphemeralKind(20000), true);
  assert.equal(ne.isEphemeralKind(29999), true);
  assert.equal(ne.isEphemeralKind(30000), false);
});
