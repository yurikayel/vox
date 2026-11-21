/**
 * PM-114 — Teste de contrato de vetores criptográficos e integridade contra mutação.
 * Valida formatos congelados: assinatura v1/v2, cofre v2 e DM v1 com token de apagar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import "./setup.js";
import { verifyPayload, computeRouteId } from "../client/js/signed-verify.js";
import { canonicalString } from "../client/js/sig-format.js";
import { decryptVaultRecord } from "../client/js/vault/envelope.js";
import { isV2Record, deriveVaultAddress, deriveVaultOwnerToken } from "../client/js/vault/vault-crypto.js";
import { open, openDeleteToken } from "../client/js/crypto-dm.js";

const VECTORS_DIR = path.resolve("tests/helpers/vectors");

async function readVectorFile(filename) {
  const filepath = path.join(VECTORS_DIR, filename);
  const content = await fs.readFile(filepath, "utf-8");
  return { content, parsed: JSON.parse(content) };
}

test("manifesto - integridade sha256 dos vetores contra mutacao acidental", async () => {
  const { parsed: manifest } = await readVectorFile("manifest.json");
  assert.equal(manifest.version, 1);
  assert.equal(manifest.algorithm, "sha256");

  for (const [filename, expectedHash] of Object.entries(manifest.files)) {
    const { content } = await readVectorFile(filename);
    const actualHash = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `Hash SHA-256 divergente em ${filename}`);
  }
});

test("sig-vectors - contrato canonicalString e rota para v1 e v2", async () => {
  const { parsed } = await readVectorFile("sig-vectors.json");
  const calculatedRoute = await computeRouteId(parsed.keypair.pub);
  assert.equal(calculatedRoute, parsed.routeId, "RouteId deve ser derivado da pubKey");

  const [v1, v2] = parsed.vectors;
  assert.equal(canonicalString(v1.input), v1.canonicalString, "Canonical v1 invalido");
  assert.equal(canonicalString(v2.input), v2.canonicalString, "Canonical v2 invalido");
  assert.ok(v2.canonicalString.includes('"nested":{"a":1'), "v2 deve ordenar chaves profundas");
});

test("sig-vectors - verificacao de assinatura criptografica v1 e v2", async () => {
  const { parsed } = await readVectorFile("sig-vectors.json");
  for (const vec of parsed.vectors) {
    const ok = await verifyPayload(vec.signedPayload);
    assert.equal(ok, true, `Assinatura de ${vec.name} deve verificar`);
  }
});

test("sig-vectors - deteccao de adulteracao em campos ou assinatura", async () => {
  const { parsed } = await readVectorFile("sig-vectors.json");
  const v1 = parsed.vectors[0].signedPayload;
  const v2 = parsed.vectors[1].signedPayload;

  assert.equal(await verifyPayload({ ...v1, text: "adulterado" }), false);
  assert.equal(await verifyPayload({ ...v1, id: "post_outro" }), false);
  assert.equal(await verifyPayload({ ...v1, sig: "ZmFrZXNpZ25hdHVyZQ" }), false);
  assert.equal(await verifyPayload({ ...v2, author: "vx_outro_autor" }), false);

  const { sigv: _s, ...v2WithoutSigv } = v2;
  assert.equal(await verifyPayload(v2WithoutSigv), false, "Remover sigv: 2 nao pode passar como v1");
});

test("vault-vectors - contrato do envelope v2, endereco e token do dono", async () => {
  const { parsed } = await readVectorFile("vault-vectors.json");
  assert.equal(isV2Record(parsed.record), true, "Record deve ser v2 valido");
  assert.equal(parsed.record.v, 2);
  assert.equal(parsed.record.kdf, "pbkdf2-sha256");

  const addr = await deriveVaultAddress(parsed.passphrase);
  assert.equal(addr, parsed.derivedAddress, "Endereco derivado deve bater com vetor");

  const token = await deriveVaultOwnerToken(parsed.passphrase);
  assert.equal(token, parsed.derivedOwnerToken, "Token do dono deve bater com vetor");

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  assert.equal(hash, parsed.ownerHash, "OwnerHash deve ser SHA-256 do ownerToken");
});

test("vault-vectors - decifragem e deteccao de adulteracao no cofre v2", async () => {
  const { parsed } = await readVectorFile("vault-vectors.json");
  const bundle = await decryptVaultRecord(parsed.record, parsed.passphrase);
  assert.deepEqual(bundle, parsed.bundle, "Pacote decifrado deve ser identico");

  await assert.rejects(() => decryptVaultRecord(parsed.record, "senha-errada-qualquer"));
  await assert.rejects(() => decryptVaultRecord({ ...parsed.record, ciphertext: "bad" + parsed.record.ciphertext.slice(3) }, parsed.passphrase));

  assert.equal(isV2Record({ ...parsed.record, iter: 50000 }), false);
  assert.equal(await decryptVaultRecord({ ...parsed.record, iter: 50000 }, parsed.passphrase), null);
});

test("dm-vectors - contrato de abertura e token de apagar do envelope DM", async () => {
  const { parsed } = await readVectorFile("dm-vectors.json");
  const env = parsed.envelope;
  assert.equal(env.v, 1);
  assert.ok(env.del && env.del.iv && env.del.ct && env.del.hash);

  const plain = await open(env, parsed.recipient.priv);
  assert.equal(plain, parsed.plaintext, "Texto claro decifrado da DM deve bater");

  const token = await openDeleteToken(env, parsed.recipient.priv);
  assert.equal(token, parsed.rawDeleteTokenHex, "Token de apagar deve bater com o vetor");

  const tokenHash = crypto.createHash("sha256").update(Buffer.from(token, "hex")).digest("hex");
  assert.equal(tokenHash, env.del.hash, "Hash do token de apagar deve bater com envelope.del.hash");
});

test("dm-vectors - deteccao de adulteracao em AAD, ciphertext e del", async () => {
  const { parsed } = await readVectorFile("dm-vectors.json");
  const env = parsed.envelope;
  const priv = parsed.recipient.priv;

  await assert.rejects(() => open({ ...env, from: "vx_impostor" }, priv));
  await assert.rejects(() => open({ ...env, to: "vx_outro_destinatario" }, priv));
  await assert.rejects(() => open({ ...env, ct: "bad" + env.ct.slice(3) }, priv));

  const badDel = { ...env.del, ct: "bad" + env.del.ct.slice(3) };
  await assert.rejects(() => openDeleteToken({ ...env, del: badDel }, priv));
});
