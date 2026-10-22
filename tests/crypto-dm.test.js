import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as cryptoDm from "../client/js/crypto-dm.js";

test("crypto-dm - gera e persiste par ECDH P-256 local", async () => {
  localStorage.clear();
  const keys1 = await cryptoDm.ensureDmKeys();
  assert.equal(keys1.publicJwk.kty, "EC");
  assert.equal(keys1.publicJwk.crv, "P-256");
  assert.ok(keys1.privateJwk.d);

  const pub2 = await cryptoDm.getPublicJwk();
  assert.equal(pub2.x, keys1.publicJwk.x);
});

test("crypto-dm - roundtrip seal e open entre Alice e Bob", async () => {
  localStorage.clear();
  const aliceKeys = await cryptoDm.ensureDmKeys();

  localStorage.clear();
  const bobKeys = await cryptoDm.ensureDmKeys();

  const secretText = "Olá Bob! Conversa efêmera fora do permaweb 🔒";
  const envelope = await cryptoDm.seal(bobKeys.publicJwk, secretText, {
    from: "alice_addr_43_chars",
    to: "bob_addr_43_chars",
  });

  assert.equal(envelope.v, 1);
  assert.equal(envelope.from, "alice_addr_43_chars");
  assert.equal(envelope.to, "bob_addr_43_chars");
  assert.ok(envelope.ct);
  assert.ok(!envelope.ct.includes("Olá Bob"));

  const decrypted = await cryptoDm.open(envelope, bobKeys.privateJwk);
  assert.equal(decrypted, secretText);

  // Alice não consegue abrir com a chave privada estática dela (pois foi selado para Bob com chave efêmera)
  await assert.rejects(async () => {
    await cryptoDm.open(envelope, aliceKeys.privateJwk);
  });
});

test("crypto-dm - rejeita adulteração de ciphertext ou metadados (AAD)", async () => {
  localStorage.clear();
  const bobKeys = await cryptoDm.ensureDmKeys();
  const env = await cryptoDm.seal(bobKeys.publicJwk, "Mensagem íntegra", {
    from: "alice",
    to: "bob",
  });

  // Adultera remetente (protegido via AAD)
  const tamperedFrom = { ...env, from: "mallory" };
  await assert.rejects(async () => {
    await cryptoDm.open(tamperedFrom, bobKeys.privateJwk);
  });

  // Adultera ciphertext
  const badCt = env.ct.slice(0, -2) + (env.ct.endsWith("AA") ? "BB" : "AA");
  const tamperedCt = { ...env, ct: badCt };
  await assert.rejects(async () => {
    await cryptoDm.open(tamperedCt, bobKeys.privateJwk);
  });
});
