import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  leadingZeroBits,
  mintPow,
  hasValidPow,
  createKeyAgeBook,
  heldByQuarantine,
  attachPowIfWanted,
  revealHeld,
  isHeldRevealed,
  NEW_KEY_AGE_MS,
  POW_BITS,
  FIRST_SEEN_STORAGE_KEY,
} from "../client/js/new-key-guard.js";

const HOUR = 60 * 60 * 1000;

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    raw: m,
  };
}

function clock(start = 1_000_000_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms) => (c.t += ms) };
  return c;
}

test("LAN-14: leadingZeroBits conta bits zero do começo", () => {
  assert.equal(leadingZeroBits(new Uint8Array([0xff])), 0);
  assert.equal(leadingZeroBits(new Uint8Array([0x01])), 7);
  assert.equal(leadingZeroBits(new Uint8Array([0x00, 0x10])), 11);
  assert.equal(leadingZeroBits(new Uint8Array([0x00, 0x00])), 16);
});

test("LAN-14: PoW leve preso a autor e id; não confia no bits declarado", async () => {
  const item = { id: "top_abc", author: "vx_autor" };
  item.pow = await mintPow({ author: item.author, id: item.id, bits: 10 });
  assert.equal(item.pow.bits, 10);
  assert.equal(await hasValidPow(item, 10), true);
  assert.equal(await hasValidPow({ ...item, pow: { ...item.pow, bits: 30 } }, 10), true, "bits declarado não muda a conta");
  assert.equal(await hasValidPow({ ...item, id: "top_outro" }, 10), false, "PoW não serve para outro post");
  assert.equal(await hasValidPow({ ...item, author: "vx_outro" }, 10), false, "PoW não serve para outro autor");
  assert.equal(await hasValidPow({ ...item, pow: { nonce: -1 } }, 10), false);
  assert.equal(await hasValidPow({ ...item, pow: { nonce: "x" } }, 10), false);
  assert.equal(await hasValidPow({ id: "a", author: "b" }, 1), false, "sem pow");
});

test("LAN-14: PoW no padrão (POW_BITS) sai em tempo de celular", async () => {
  const t0 = Date.now();
  const pow = await mintPow({ author: "vx_padrao", id: "top_padrao" });
  assert.equal(pow.bits, POW_BITS);
  assert.equal(await hasValidPow({ id: "top_padrao", author: "vx_padrao", pow }), true);
  assert.ok(Date.now() - t0 < 30000);
});

test("LAN-14: chave nova só depois do período de aprendizado do aparelho", () => {
  const storage = memoryStorage();
  const c = clock();
  const book = createKeyAgeBook({ storage, now: c.now });

  assert.equal(book.isNewKey("vx_antigo"), false, "visto no aprendizado conta como conhecido");
  c.advance(NEW_KEY_AGE_MS + HOUR);
  assert.equal(book.isNewKey("vx_antigo"), false, "continua conhecido depois");

  assert.equal(book.isNewKey("vx_novo"), true, "primeira vez depois do aprendizado é chave nova");
  c.advance(NEW_KEY_AGE_MS - 1);
  assert.equal(book.isNewKey("vx_novo"), true);
  c.advance(1);
  assert.equal(book.isNewKey("vx_novo"), false, "após 24 h deixa de ser nova");

  const again = createKeyAgeBook({ storage, now: c.now });
  assert.equal(again.isNewKey("vx_antigo"), false, "o caderno persiste no aparelho");
  assert.ok(JSON.parse(storage.getItem(FIRST_SEEN_STORAGE_KEY)).keys.vx_novo);
});

test("LAN-14: quarentena só em comunidade que pediu; dono, quem vê e PoW passam", async () => {
  const c = clock();
  const book = createKeyAgeBook({ storage: memoryStorage(), now: c.now });
  book.noteSeen("vx_veterano"); // aparelho começa a aprender aqui
  c.advance(NEW_KEY_AGE_MS + HOUR);
  const topics = [
    { id: "t1", author: "vx_spam" },
    { id: "t2", author: "vx_dono" },
    { id: "t3", author: "vx_eu" },
    { id: "t4", author: "vx_trabalhou", pow: await mintPow({ author: "vx_trabalhou", id: "t4", bits: 6 }) },
    { id: "t5", author: "" },
  ];
  const opts = { viewer: "vx_eu", book, minBits: 6 };

  assert.equal((await heldByQuarantine(topics, { owner: "vx_dono" }, opts)).size, 0, "comunidade sem quarentena");
  const held = await heldByQuarantine(topics, { owner: "vx_dono", newKeyQuarantine: true }, opts);
  assert.deepEqual([...held], ["t1"]);

  c.advance(NEW_KEY_AGE_MS);
  const later = await heldByQuarantine(topics, { owner: "vx_dono", newKeyQuarantine: true }, opts);
  assert.equal(later.size, 0, "chave envelhece e sai da quarentena");
});

test("LAN-14: PoW só é anexado quando a comunidade pede", async () => {
  const plain = await attachPowIfWanted({ id: "p1" }, { newKeyQuarantine: false }, "vx_a");
  assert.equal(plain.pow, undefined);
  const none = await attachPowIfWanted({ id: "p1" }, undefined, "vx_a");
  assert.equal(none.pow, undefined);
  const withPow = await attachPowIfWanted({ id: "p2" }, { newKeyQuarantine: true }, "vx_a");
  assert.equal(await hasValidPow({ ...withPow, author: "vx_a" }), true);
});

test("LAN-14: ver mesmo assim vale por comunidade", () => {
  assert.equal(isHeldRevealed("bairro-x"), false);
  revealHeld("bairro-x");
  assert.equal(isHeldRevealed("bairro-x"), true);
  assert.equal(isHeldRevealed("bairro-y"), false);
});
