import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as ans from "../client/js/ans104.js";
import * as wallet from "../client/js/wallet.js";

test("ans104 - parseBinaryDataItem disseca campos do data item", async () => {
  const jwk = await wallet.ensureWallet();
  const payload = JSON.stringify({ title: "Título de Prova", body: "Corpo auditado" });
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: "topic" },
  ];
  const item = await ans.createSignedDataItem(payload, tags, jwk);

  const parsed = ans.parseBinaryDataItem(item.bytes);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sigType, 1);
  assert.equal(parsed.signature.length, 512);
  assert.equal(parsed.owner.length, 512);
  assert.equal(parsed.tagCount, 2);
  assert.ok(parsed.tagBytesLen > 0);
  assert.equal(new TextDecoder().decode(parsed.data), payload);
});

test("ans104 - parseAndVerifyDataItem valida assinatura legítima", async () => {
  const jwk = await wallet.ensureWallet();
  const expectedAddr = await ans.jwkToAddress(jwk);
  const payload = "Post soberano permanente";
  const tags = [{ name: "App-Name", value: "vox-brasil" }];
  const item = await ans.createSignedDataItem(payload, tags, jwk);

  const res = await ans.parseAndVerifyDataItem(item.bytes);
  assert.equal(res.valid, true);
  assert.equal(res.id, item.id);
  assert.equal(res.ownerAddress, expectedAddr);
  assert.equal(new TextDecoder().decode(res.data), payload);
});

test("ans104 - parseAndVerifyDataItem rejeita payload adulterado", async () => {
  const jwk = await wallet.ensureWallet();
  const payload = "Conteúdo original";
  const tags = [{ name: "App-Name", value: "vox-brasil" }];
  const item = await ans.createSignedDataItem(payload, tags, jwk);

  const tamperedBytes = new Uint8Array(item.bytes);
  // Altera um byte do payload
  tamperedBytes[tamperedBytes.length - 1] ^= 0x01;

  const res = await ans.parseAndVerifyDataItem(tamperedBytes);
  assert.equal(res.valid, false);
});

test("ans104 - parseAndVerifyDataItem rejeita bytes insuficientes", async () => {
  const shortBytes = new Uint8Array(50);
  const res = await ans.parseAndVerifyDataItem(shortBytes);
  assert.equal(res.valid, false);
  assert.equal(res.reason, "tam-insuficiente");
});
