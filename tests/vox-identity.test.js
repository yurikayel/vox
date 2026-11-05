import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as voxIdentity from "../client/js/vox-identity.js";
import * as idbStore from "../client/js/idb-store.js";

test("vox-identity - constrói e decodifica cabeçalho binário canônico de exatamente 152 bytes", async () => {
  const sender = new Uint8Array(32).fill(0x01);
  const audience = new Uint8Array(32).fill(0x02);
  const timestamp = 1793866800123;
  const nonce = new Uint8Array(16).fill(0x03);
  const capsHash = new Uint8Array(32).fill(0x04);
  const payloadHash = new Uint8Array(32).fill(0x05);

  const header = voxIdentity.buildCanonicalBinaryHeader({
    sender,
    audience,
    timestamp,
    nonce,
    capsHash,
    payloadHash,
  });

  assert.equal(header.byteLength, 152);

  const parsed = voxIdentity.parseCanonicalBinaryHeader(header);
  assert.deepEqual(parsed.sender, sender);
  assert.deepEqual(parsed.audience, audience);
  assert.equal(parsed.timestamp, timestamp);
  assert.deepEqual(parsed.nonce, nonce);
  assert.deepEqual(parsed.capsHash, capsHash);
  assert.deepEqual(parsed.payloadHash, payloadHash);
});

test("vox-identity - valida deriva de timestamp com limite de +-10 minutos", () => {
  const now = 1700000000000;
  const headerOk = voxIdentity.buildCanonicalBinaryHeader({
    sender: new Uint8Array(32),
    audience: new Uint8Array(32),
    timestamp: now + 5 * 60 * 1000, // +5 min
    nonce: new Uint8Array(16),
    capsHash: new Uint8Array(32),
    payloadHash: new Uint8Array(32),
  });

  const resOk = voxIdentity.validateHeaderTimestamp(headerOk, now);
  assert.equal(resOk.valid, true);
  assert.equal(resOk.driftMs, 5 * 60 * 1000);

  const headerDrift = voxIdentity.buildCanonicalBinaryHeader({
    sender: new Uint8Array(32),
    audience: new Uint8Array(32),
    timestamp: now - 11 * 60 * 1000, // -11 min
    nonce: new Uint8Array(16),
    capsHash: new Uint8Array(32),
    payloadHash: new Uint8Array(32),
  });

  const resDrift = voxIdentity.validateHeaderTimestamp(headerDrift, now);
  assert.equal(resDrift.valid, false);
  assert.equal(resDrift.driftMs, 11 * 60 * 1000);
});

test("vox-identity - gera identidade com chave privada não-extraível (extractable: false)", async () => {
  const identity = await voxIdentity.generateIdentity({ persist: false });

  assert.ok(identity.routeId.startsWith("vx_ed25519_"));
  assert.equal(identity.rawPublicKey.byteLength, 32);
  assert.equal(identity.rawAgreementPublicKey.byteLength, 32);
  assert.equal(identity.isExtractable, false);
  assert.equal(identity.privateKey.extractable, false);

  // Tentativa de exportar chave privada protegida DEVE falhar
  await assert.rejects(
    async () => {
      await crypto.subtle.exportKey("pkcs8", identity.privateKey);
    },
    (err) => err.name === "InvalidAccessException" || err.message.includes("extractable")
  );
});

test("vox-identity - assina e valida cabeçalho de 152 bytes com Ed25519", async () => {
  const identity = await voxIdentity.generateIdentity({ persist: false });
  const header = voxIdentity.buildCanonicalBinaryHeader({
    sender: identity.rawPublicKey,
    audience: new Uint8Array(32).fill(0xaa),
    timestamp: Date.now(),
    nonce: new Uint8Array(16).fill(0xbb),
    capsHash: new Uint8Array(32).fill(0xcc),
    payloadHash: new Uint8Array(32).fill(0xdd),
  });

  const sig = await voxIdentity.signCanonicalHeader(identity.privateKey, header);
  assert.equal(sig.byteLength, 64);

  const valid = await voxIdentity.verifyCanonicalHeader(identity.publicKey, sig, header);
  assert.equal(valid, true);

  // Adulteração de 1 bit invalida a verificação
  const tampered = new Uint8Array(header);
  tampered[151] ^= 0x01;
  const tamperedValid = await voxIdentity.verifyCanonicalHeader(identity.publicKey, sig, tampered);
  assert.equal(tamperedValid, false);
});

test("vox-identity - padrão Wrap/Unwrap: cifra e decifra semente de backup com senha", async () => {
  const seed = new Uint8Array(32).fill(0x42);
  const passphrase = "senha-forte-soberania-vox-2026";

  const bundle = await voxIdentity.encryptSeedBackup(seed, passphrase);
  assert.equal(bundle.algo, voxIdentity.BACKUP_ALGO);
  assert.equal(bundle.iterations, voxIdentity.BACKUP_ITERATIONS);
  assert.ok(bundle.ciphertext.length > 0);

  // Decifra com a senha correta
  const restored = await voxIdentity.decryptSeedBackup(bundle, passphrase);
  assert.deepEqual(restored, seed);

  // Decifra com senha incorreta falha
  await assert.rejects(async () => {
    await voxIdentity.decryptSeedBackup(bundle, "senha-errada");
  });
});

test("vox-identity - constrói e verifica envelope assinado de ponta a ponta", async () => {
  const identity = await voxIdentity.generateIdentity({ persist: false });
  const audience = new Uint8Array(32).fill(0x77);
  const payload = { acao: "abrir_corrida", valor: 25.5, moeda: "BRL" };
  const documentId = "comunidade_bairro_centro";

  const now = 1793866800000;
  const envelope = await voxIdentity.buildSignedEnvelope({
    identity,
    audience,
    documentId,
    capabilityChain: ["cap_write_catalog_v1"],
    payload,
    timestamp: now,
  });

  assert.equal(envelope.version, 1);
  assert.equal(envelope.sender, voxIdentity.bytesToHex(identity.rawPublicKey));
  assert.equal(envelope.audience, voxIdentity.bytesToHex(audience));
  assert.equal(envelope.documentId, documentId);
  assert.equal(envelope.timestamp, now);
  assert.ok(envelope.sig.length === 128); // 64 bytes em hex

  // Verificação com timestamp dentro da janela
  const res = await voxIdentity.verifySignedEnvelope(envelope, identity.publicKey, { now });
  assert.equal(res.valid, true);
  assert.equal(res.error, null);
  assert.equal(res.header.timestamp, now);

  // Verificação com deriva de tempo excedida rejeita
  const resExpired = await voxIdentity.verifySignedEnvelope(envelope, identity.publicKey, {
    now: now + 15 * 60 * 1000, // +15 min
  });
  assert.equal(resExpired.valid, false);
  assert.ok(resExpired.error.includes("Deriva de timestamp excedida"));

  // Adulteração do payload deve falhar
  const tamperedPayload = { ...envelope, payload: JSON.stringify({ acao: "abrir_corrida_fraude" }) };
  const resTamperedPayload = await voxIdentity.verifySignedEnvelope(tamperedPayload, identity.publicKey, { now });
  assert.equal(resTamperedPayload.valid, false);

  // Adulteração de audience deve falhar
  const tamperedAudience = { ...envelope, audience: voxIdentity.bytesToHex(new Uint8Array(32).fill(0x99)) };
  const resTamperedAudience = await voxIdentity.verifySignedEnvelope(tamperedAudience, identity.publicKey, { now });
  assert.equal(resTamperedAudience.valid, false);

  // Adulteração de capabilityChain deve falhar
  const tamperedCaps = { ...envelope, capabilityChain: ["cap_admin_injetada"] };
  const resTamperedCaps = await voxIdentity.verifySignedEnvelope(tamperedCaps, identity.publicKey, { now });
  assert.equal(resTamperedCaps.valid, false);
});

test("vox-identity - suporta payload binário puro (Uint8Array) em envelopes", async () => {
  const identity = await voxIdentity.generateIdentity({ persist: false });
  const binPayload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]);
  const now = 1793866800000;

  const envelope = await voxIdentity.buildSignedEnvelope({
    identity,
    audience: new Uint8Array(32).fill(0x33),
    documentId: "topico_binario",
    payload: binPayload,
    timestamp: now,
  });

  assert.equal(envelope.isBinary, true);
  const res = await voxIdentity.verifySignedEnvelope(envelope, identity.publicKey, { now });
  assert.equal(res.valid, true);
});

test("vox-identity - persiste metadados de identidade no idbStore", async () => {
  await idbStore.clearStore(idbStore.STORES.KV);
  const identity = await voxIdentity.generateIdentity({
    passphrase: "backup-pass-test",
    persist: true,
  });

  const stored = await idbStore.getKeyValue(voxIdentity.IDENTITY_STORAGE_KEY);
  assert.ok(stored);
  assert.equal(stored.routeId, identity.routeId);
  assert.equal(stored.rawPublicKey, voxIdentity.bytesToHex(identity.rawPublicKey));
  assert.ok(stored.backupBundle);
});
