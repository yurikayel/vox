/**
 * @file Arquivo de soberania (`.voxid`): exportar e restaurar a identidade local.
 *
 * Saiu de `local-account.js`. O formato do envelope cifrado fica em `account-backup-wrap.js`.
 * PM-93 etapa 2: exportar com a Senha Soberana (12+ caracteres) conta como backup e trava as chaves do aparelho;
 * depois disso, exportar sem a senha certa lança `KeyLockedError`.
 */

import { KIND_PLAIN, KIND_WRAPPED, wrapBackup, unwrapBackup } from "./account-backup-wrap.js";
import {
  computeRouteId,
  ensureLocalAccount,
  getDisplayName,
  getMeshDiscoverable,
  getPixKey,
  importLocalAccountBundle,
  lockAfterPasswordBackup,
  openAccountKeys,
  setMeshDiscoverable,
} from "./local-account.js";
import { markAccountExit } from "./account-exit.js";
import { getLocalIdentityMeta, setLocalIdentityMeta } from "../profile-identity-meta.js";

export { KIND_PLAIN, KIND_WRAPPED, peekBackupKind } from "./account-backup-wrap.js";

/**
 * Monta o pacote de backup da conta (identidade, chaves de DM e semente), abrindo as chaves com a senha se estiverem travadas.
 *
 * @param {string} passphrase
 * @returns {Promise<object>}
 */
async function buildAccountBackup(passphrase) {
  const { acc, privateJwk, dmKeypair, seed } = await openAccountKeys(passphrase);
  return {
    voxVersion: 1,
    kind: KIND_PLAIN,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk,
    ...(seed ? { seed } : {}),
    dmKeypair,
    displayName: getDisplayName(),
    pixKey: getPixKey(),
    meshDiscoverable: getMeshDiscoverable(),
    identityMeta: getLocalIdentityMeta(acc.routeId),
    exportedAt: Date.now(),
  };
}

/**
 * Gera o `.voxid`. Com senha, sai cifrado e trava as chaves (PM-93).
 * @param {string} passphrase Senha Soberana (vazia: arquivo em claro).
 * @param {{ asFile?: boolean }} [opts] `asFile`: o arquivo sai do aparelho e, cifrado, conta como saída (ADR-032).
 * @returns {Promise<string>} JSON do arquivo.
 */
export async function exportAccountBundle(passphrase, { asFile = false } = {}) {
  const secret = String(passphrase || "").trim();
  const bundle = await buildAccountBackup(secret);
  if (!secret) return JSON.stringify(bundle, null, 2);
  const wrapped = JSON.stringify(await wrapBackup(bundle, secret), null, 2);
  await lockAfterPasswordBackup(secret);
  if (asFile) markAccountExit("arquivo", bundle.routeId);
  return wrapped;
}

/**
 * Aceita o backup como texto JSON ou objeto e devolve o objeto.
 *
 * @param {string|object} rawBundle
 * @returns {object}
 */
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

/**
 * Devolve o backup em claro, decifrando o envelope quando ele veio protegido por senha.
 *
 * @param {object} parsed
 * @param {string} passphrase
 * @returns {Promise<object>}
 */
async function unwrapIfNeeded(parsed, passphrase) {
  if (parsed?.kind === KIND_PLAIN) return parsed;
  if (parsed?.kind === KIND_WRAPPED) return unwrapBackup(parsed, passphrase);
  throw new Error("Backup incompatível ou corrompido");
}

/**
 * Valida identidade e chaves do backup; lança se algo não bater.
 *
 * @param {object} parsed
 * @returns {Promise<void>}
 */
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

/**
 * Importa uma chave ECDSA P-256 a partir de JWK.
 *
 * @param {JsonWebKey} jwk
 * @param {string[]} usages
 * @returns {Promise<CryptoKey>}
 */
async function importEcdsaKey(jwk, usages) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    usages
  );
}

/**
 * Prova que a chave privada assina o que a pública verifica, antes de aceitar o backup.
 *
 * @param {object} parsed
 * @returns {Promise<void>}
 */
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

// Pelo mesmo caminho da frase e do cofre: a conta que estava ativa vai para o cofre local e não deixa nome, Pix,
// enriquecimento nem chave de DM na restaurada.
/**
 * Grava a conta do backup no aparelho e restaura os metadados de identidade.
 *
 * @param {object} parsed
 * @returns {Promise<object>}
 */
async function persistAccountBackup(parsed) {
  if (!(await importLocalAccountBundle({ ...parsed, pix: parsed.pixKey }))) throw new Error("Backup sem chaves válidas");
  const acc = await ensureLocalAccount();
  if (parsed.identityMeta) setLocalIdentityMeta(parsed.routeId, parsed.identityMeta);
  if (typeof parsed.meshDiscoverable === "boolean") {
    setMeshDiscoverable(parsed.meshDiscoverable);
  }
  return acc;
}

/**
 * Restaura um `.voxid`. Arquivo cifrado com a Senha Soberana já é um backup: a conta volta travada.
 * @param {string|object} rawBundle Conteúdo do arquivo.
 * @param {string} [passphrase] Senha Soberana, se cifrado.
 * @param {{ asFile?: boolean }} [opts] `asFile`: veio de um arquivo da pessoa, que segue sendo saída (ADR-032).
 * @returns {Promise<object>} A conta restaurada.
 */
export async function importAccountBundle(rawBundle, passphrase, { asFile = false } = {}) {
  const parsed = parseBackupRaw(rawBundle);
  const inner = await unwrapIfNeeded(parsed, passphrase);
  await assertBackupIdentity(inner);
  await challengeSigningPair(inner);
  const acc = await persistAccountBackup(inner);
  if (parsed.kind === KIND_WRAPPED) await lockAfterPasswordBackup(passphrase);
  if (asFile && parsed.kind === KIND_WRAPPED) markAccountExit("arquivo", acc.routeId);
  return acc;
}
