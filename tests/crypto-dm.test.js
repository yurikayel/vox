import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as cryptoDm from "../client/js/crypto-dm.js";

test("crypto-dm - gera e persiste par ECDH P-256 local", async () => {
  localStorage.clear();
  const keys1 = await cryptoDm.ensureDmKeys();
  assert.equal(keys1.publicJwk.kty, "EC");
  assert.equal(keys1.publicJwk.crv, "P-256");
  const stored = JSON.parse(localStorage.getItem("vox-dm-keypair"));
  assert.equal(stored.privateJwk.d, undefined, "PM-93: a chave privada não fica em claro no armazenamento");
  const opened = await cryptoDm.getDmKeypair();
  assert.ok(opened.privateJwk.d);

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

const sha256Hex = async (hex) => {
  const bytes = Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

test("PM-94 - só quem abre a mensagem tira a chave de apagar do relay", async () => {
  localStorage.clear();
  const bob = await cryptoDm.ensureDmKeys();
  const env = await cryptoDm.seal(bob.publicJwk, "apaga depois de ler", { from: "a", to: "b" });
  assert.match(env.del.hash, /^[0-9a-f]{64}$/);
  const token = await cryptoDm.openDeleteToken(env);
  assert.equal(await sha256Hex(token), env.del.hash, "o relay confere a chave pelo hash");
  assert.equal(JSON.stringify(env).includes(token), false, "a chave não vai em claro no envelope");

  await assert.rejects(() => cryptoDm.openDeleteToken({ ...env, id: "dm_outro" }, bob.privateJwk), "presa ao id da mensagem");
  localStorage.clear();
  await cryptoDm.ensureDmKeys();
  await assert.rejects(() => cryptoDm.openDeleteToken(env), "outra pessoa não abre");
  assert.equal(await cryptoDm.openDeleteToken({ ...env, del: undefined }), null, "envelope antigo não tem chave");
});
