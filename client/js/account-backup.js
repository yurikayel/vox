/**
 * @file Arquivo de soberania (`.voxid`): exportar e restaurar a identidade local.
 *
 * Saiu de `local-account.js`. O formato do envelope cifrado fica em `account-backup-wrap.js`.
 * PM-93 etapa 2: exportar com a Senha Soberana (12+ caracteres) conta como backup e trava as chaves do aparelho;
 * depois disso, exportar sem a senha certa lança `KeyLockedError`.
 */

import * as cryptoDm from "./crypto-dm.js";
import { KIND_PLAIN, KIND_WRAPPED, wrapBackup, unwrapBackup } from "./account-backup-wrap.js";
import {
  computeRouteId,
  getDisplayName,
  getMeshDiscoverable,
  getPixKey,
  lockAfterPasswordBackup,
  openAccountKeys,
  setDisplayName,
  setMeshDiscoverable,
  setPixKey,
  storeActiveAccount,
} from "./local-account.js";
import { sealJson } from "./keystore.js";

export { KIND_WRAPPED, peekBackupKind } from "./account-backup-wrap.js";

async function buildAccountBackup(passphrase) {
  const { acc, privateJwk, dmKeypair } = await openAccountKeys(passphrase);
  return {
    voxVersion: 1,
    kind: KIND_PLAIN,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk,
    dmKeypair,
    displayName: getDisplayName(),
    pixKey: getPixKey(),
    meshDiscoverable: getMeshDiscoverable(),
    exportedAt: Date.now(),
  };
}

export async function exportAccountBundle(passphrase) {
  const secret = String(passphrase || "").trim();
  const bundle = await buildAccountBackup(secret);
  if (!secret) return JSON.stringify(bundle, null, 2);
  const wrapped = JSON.stringify(await wrapBackup(bundle, secret), null, 2);
  await lockAfterPasswordBackup(secret);
  return wrapped;
}

function parseBackupRaw(rawBundle) {
  if (typeof rawBundle === "string") {
    try {
      return JSON.parse(rawBundle);
    } catch {
      throw new Error("Formato de backup inválido (não é JSON)");
    }
  }
  if (rawBundle && typeof rawBundle === "object") return rawBundle;
  throw new Error("Formato de backup inválido (não é JSON)");
}

async function unwrapIfNeeded(parsed, passphrase) {
  if (parsed?.kind === KIND_PLAIN) return parsed;
  if (parsed?.kind === KIND_WRAPPED) return unwrapBackup(parsed, passphrase);
  throw new Error("Backup incompatível ou corrompido");
}

async function assertBackupIdentity(parsed) {
  if (!parsed?.routeId) throw new Error("Backup incompatível ou corrompido");
  if (!parsed.publicJwk || !parsed.privateJwk) {
    throw new Error("Chaves de assinatura ausentes no backup");
  }
  const expected = await computeRouteId(parsed.publicJwk);
  if (!expected || expected !== parsed.routeId) {
    throw new Error("Chave pública não corresponde ao routeId declarado");
  }
}

async function importEcdsaKey(jwk, usages) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    usages
  );
}

async function challengeSigningPair(parsed) {
  try {
    const privKey = await importEcdsaKey(parsed.privateJwk, ["sign"]);
    const pubKey = await importEcdsaKey(parsed.publicJwk, ["verify"]);
    const nonce = new TextEncoder().encode(`vox-verify-${Date.now()}`);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privKey, nonce);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sig, nonce);
    if (!valid) throw new Error("Assinatura de teste falhou");
  } catch (err) {
    throw new Error(`Validação das chaves falhou: ${err.message}`);
  }
}

async function persistAccountBackup(parsed) {
  const acc = storeActiveAccount({
    routeId: parsed.routeId,
    publicJwk: parsed.publicJwk,
    privateJwk: await sealJson(parsed.privateJwk),
    createdAt: parsed.createdAt || Date.now(),
    importedAt: Date.now(),
  });
  if (parsed.dmKeypair) await cryptoDm.setDmKeypair(parsed.dmKeypair);
  if (parsed.displayName) setDisplayName(parsed.displayName);
  if (parsed.pixKey) setPixKey(parsed.pixKey);
  if (typeof parsed.meshDiscoverable === "boolean") {
    setMeshDiscoverable(parsed.meshDiscoverable);
  }
  return acc;
}

/** Restaura um `.voxid`. Arquivo cifrado com a Senha Soberana já é um backup: a conta volta travada. */
export async function importAccountBundle(rawBundle, passphrase) {
  const parsed = parseBackupRaw(rawBundle);
  const inner = await unwrapIfNeeded(parsed, passphrase);
  await assertBackupIdentity(inner);
  await challengeSigningPair(inner);
  const acc = await persistAccountBackup(inner);
  if (parsed.kind === KIND_WRAPPED) await lockAfterPasswordBackup(passphrase);
  return acc;
}
