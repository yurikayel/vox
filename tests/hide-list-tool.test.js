import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  validateHideList,
  signHideList,
  verifyHideList,
  exportArioBlocklist,
} from "../scripts/hide-list-tool.mjs";

const TOOL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hide-list-tool.mjs");

function makeKeyPair() {
  return crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function makeManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    listVersion: 3,
    updatedAt: "2026-11-22T06:00:00Z",
    issuer: "vox-official-pwa",
    entries: [
      {
        id: "hl-001",
        targetType: "tx",
        target: "txid_active_csam_0001",
        category: "csam",
        reasonCode: "dec-12976-art4-urgent",
        issuedAt: "2026-11-22T05:30:00Z",
        status: "active",
      },
      {
        id: "hl-002",
        targetType: "tx",
        target: "txid_retracted_0002",
        category: "judicial-order",
        reasonCode: "stf-order-retracted",
        issuedAt: "2026-11-21T12:00:00Z",
        status: "retracted",
        appealRef: "appeal-2026-09",
      },
      {
        id: "hl-003",
        targetType: "post",
        target: "post_non_tx_0003",
        category: "doxxing-lgpd",
        reasonCode: "lgpd-takedown-03",
        issuedAt: "2026-11-22T04:00:00Z",
        status: "active",
      },
    ],
    ...overrides,
  };
}

function runCli(args) {
  return execFileSync(process.execPath, [TOOL_PATH, ...args], { encoding: "utf8", stdio: "pipe" });
}

test("canonicalJson sorts nested object keys deterministically", () => {
  const a = { z: 1, a: { d: 4, b: [{ y: 2, x: 1 }] } };
  const b = { a: { b: [{ x: 1, y: 2 }], d: 4 }, z: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(canonicalJson(a), '{"a":{"b":[{"x":1,"y":2}],"d":4},"z":1}');
});

test("signHideList and verifyHideList succeed in roundtrip with pinned key", () => {
  const { publicKey, privateKey } = makeKeyPair();
  const manifest = makeManifest();
  const signed = signHideList(manifest, privateKey);

  assert.equal(signed.signature.alg, "Ed25519");
  assert.ok(signed.signature.sigBase64.length > 0);
  assert.deepEqual(verifyHideList(signed), { ok: true });
  assert.deepEqual(verifyHideList(signed, publicKey), { ok: true });
});

test("verifyHideList fails closed on tampering or wrong pinned public key", () => {
  const kp1 = makeKeyPair();
  const kp2 = makeKeyPair();
  const signed = signHideList(makeManifest(), kp1.privateKey);

  const tamperedTarget = structuredClone(signed);
  tamperedTarget.entries[0].target = "txid_mutated";
  assert.equal(verifyHideList(tamperedTarget, kp1.publicKey).ok, false);

  const tamperedCategory = structuredClone(signed);
  tamperedCategory.entries[0].category = "other";
  assert.equal(verifyHideList(tamperedCategory, kp1.publicKey).ok, false);

  const tamperedVersion = { ...signed, listVersion: 4 };
  assert.equal(verifyHideList(tamperedVersion, kp1.publicKey).ok, false);

  const wrongPin = verifyHideList(signed, kp2.publicKey);
  assert.equal(wrongPin.ok, false);
  assert.match(wrongPin.reason, /mismatch/i);

  assert.equal(verifyHideList({ ...signed, signature: { ...signed.signature, alg: "RSA" } }).ok, false);
});

test("validateHideList rejects invalid enums, timestamps, missing fields, and PII", () => {
  assert.equal(validateHideList(makeManifest()).ok, true);
  assert.equal(validateHideList(makeManifest({ schemaVersion: 2 })).ok, false);
  assert.equal(validateHideList(makeManifest({ updatedAt: "2026-11-22" })).ok, false);

  const badEnum = makeManifest();
  badEnum.entries[0].targetType = "wallet";
  assert.equal(validateHideList(badEnum).ok, false);

  const badCat = makeManifest();
  badCat.entries[0].category = "spam";
  assert.equal(validateHideList(badCat).ok, false);

  const badStatus = makeManifest();
  badStatus.entries[0].status = "pending";
  assert.equal(validateHideList(badStatus).ok, false);

  const emailPii = makeManifest();
  emailPii.entries[0].reasonCode = "reported-by-alice@example.com";
  assert.equal(validateHideList(emailPii).ok, false);

  const cpfPii = makeManifest();
  cpfPii.entries[0].reasonCode = "cpf-123.456.789-00";
  assert.equal(validateHideList(cpfPii).ok, false);

  const oversize = makeManifest();
  oversize.entries[0].reasonCode = "x".repeat(81);
  assert.equal(validateHideList(oversize).ok, false);

  const { privateKey } = makeKeyPair();
  assert.throws(() => signHideList(emailPii, privateKey), /Invalid hide-list manifest/);
});

test("exportArioBlocklist exports only active tx entries in json and txt formats", () => {
  const { privateKey } = makeKeyPair();
  const signed = signHideList(makeManifest(), privateKey);

  const jsonExport = exportArioBlocklist(signed);
  assert.deepEqual(jsonExport, {
    version: 3,
    generatedAt: "2026-11-22T06:00:00Z",
    issuer: "vox-official-pwa",
    blockedIds: ["txid_active_csam_0001"],
    entries: [
      {
        id: "txid_active_csam_0001",
        notes: "csam",
        source: "vox-official-pwa",
        created: "2026-11-22T05:30:00Z",
      },
    ],
  });

  const txtExport = exportArioBlocklist(signed, { format: "txt" });
  assert.equal(txtExport, "txid_active_csam_0001\n");
});

test("CLI roundtrip signs, verifies, exports AR.IO, and rejects tampered input", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-lan13-"));
  try {
    const { publicKey, privateKey } = makeKeyPair();
    const manifestPath = path.join(tmpDir, "manifest.json");
    const privPath = path.join(tmpDir, "priv.pem");
    const pubPath = path.join(tmpDir, "pub.pem");
    const signedPath = path.join(tmpDir, "signed.json");
    const arioJsonPath = path.join(tmpDir, "ario.json");
    const arioTxtPath = path.join(tmpDir, "ario.txt");

    fs.writeFileSync(manifestPath, JSON.stringify(makeManifest()), "utf8");
    fs.writeFileSync(privPath, privateKey, "utf8");
    fs.writeFileSync(pubPath, publicKey, "utf8");

    runCli(["sign", "--input", manifestPath, "--key", privPath, "--out", signedPath]);
    const verifyOut = runCli(["verify", "--input", signedPath, "--pubkey", pubPath]);
    assert.match(verifyOut, /Verified hide-list v3/);

    runCli(["export-ario", "--input", signedPath, "--format", "json", "--out", arioJsonPath]);
    runCli(["export-ario", "--input", signedPath, "--format", "txt", "--out", arioTxtPath]);
    assert.deepEqual(JSON.parse(fs.readFileSync(arioJsonPath, "utf8")).blockedIds, ["txid_active_csam_0001"]);
    assert.equal(fs.readFileSync(arioTxtPath, "utf8"), "txid_active_csam_0001\n");

    const tampered = JSON.parse(fs.readFileSync(signedPath, "utf8"));
    tampered.entries[0].target = "txid_tampered_cli";
    fs.writeFileSync(signedPath, JSON.stringify(tampered), "utf8");
    assert.throws(() => runCli(["verify", "--input", signedPath, "--pubkey", pubPath]), (err) => err.status === 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
