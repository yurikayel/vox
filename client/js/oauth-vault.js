/**
 * @module oauth-vault
 * Cofre de recuperação da identidade (routeId + chave P-256 + nome, enriquecimento, Pix).
 *
 * PM-90 — formato v2 (`vault-crypto.js`): o cofre só abre com a Senha Soberana. Login com Google ou Meta
 * não é chave de nada: ele só enriquece o perfil e reencontra contas que já estão neste aparelho.
 * Cofres v1 são lidos uma última vez para não deixar ninguém sem a conta, cifrados de novo quando há
 * senha, e revogados (`vault-legacy.js`).
 */

import * as localAccount from "./local-account.js";
import * as profileDirectory from "./profile-directory.js";
import * as share from "./share.js";
import * as accountExit from "./account-exit.js";
import { getCentralMemoryUrls } from "./central-memory.js";
import {
  decryptLegacyRecord,
  decryptVaultRecord,
  deriveVaultAddress,
  deriveVaultOwnerToken,
  encryptVaultV2,
  isRevokedRecord,
  isV2Record,
  legacyLookupKey,
  normalizeVaultEmail,
} from "./vault-crypto.js";
import {
  LEGACY_VAULT_PREFIX,
  clearLegacyRevokedNotice,
  consumeLegacyRevokedNotice,
  markLegacyRevokedNotice,
  migrateLegacyVaults,
  revokeLegacyVaults,
} from "./vault-legacy.js";

export { encodeVaultBundleForUrl, decodeVaultBundleFromUrl } from "./vault-crypto.js";

const VAULT_STORAGE_PREFIX = "vox-vault-v2:";

async function probeVaultUrl(baseUrl, lookupKey) {
  try {
    const res = await fetch(`${baseUrl}/memory/vault/${lookupKey}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res) return { reachable: false, record: null };
    if (!res.ok) return { reachable: true, record: null };
    const data = await res.json();
    return { reachable: true, record: data?.record || null };
  } catch {
    return { reachable: false, record: null };
  }
}

async function fetchRemoteVaultStatus(lookupKey) {
  const settled = await Promise.all(getCentralMemoryUrls().map((u) => probeVaultUrl(u, lookupKey)));
  const reachable = settled.filter((r) => r.reachable).length;
  const records = settled.map((r) => r.record).filter(Boolean);
  if (records.some((r) => isRevokedRecord(r))) return { record: null, revoked: true, reachable };
  records.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  return { record: records[0] || null, revoked: false, reachable };
}

/**
 * Busca o cofre remoto em todos os servidores configurados em paralelo (anti-rollback).
 * @param {string} lookupKey
 * @returns {Promise<object|null>}
 */
export async function fetchRemoteVaultRecord(lookupKey) {
  return (await fetchRemoteVaultStatus(lookupKey)).record;
}

const REMOTE_SAVE_TIMEOUT_MS = 4000;

async function postVaultRecord(baseUrl, lookupKey, body) {
  try {
    const res = await fetch(`${baseUrl}/memory/vault/${lookupKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout?.(REMOTE_SAVE_TIMEOUT_MS),
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

/**
 * Grava o cofre nos servidores de memória escolhidos. Cofre v2 vai com a prova do dono (PM-94).
 * @returns {Promise<number>} quantos servidores aceitaram (ADR-032: só assim o cofre conta como saída)
 */
export async function saveRemoteVaultRecord(lookupKey, record, ownerToken = null) {
  const body = JSON.stringify(ownerToken ? { lookupKey, record, ownerToken } : { lookupKey, record });
  const results = await Promise.all(getCentralMemoryUrls().map((url) => postVaultRecord(url, lookupKey, body)));
  return results.filter(Boolean).length;
}

/** Revoga os cofres v1 que este aparelho conhece. Roda na abertura do app. */
export function runLegacyVaultMigration() {
  return migrateLegacyVaults({
    enrichment: localAccount.getProfileEnrichment(),
    saveRemote: saveRemoteVaultRecord,
    serverMarker: getCentralMemoryUrls().join(" "),
  });
}

export const LEGACY_VAULT_NOTICE =
  "Atualizamos a proteção do cofre de recuperação e o cofre antigo foi desativado. Para recuperar a conta em outro aparelho, crie a Senha Soberana de novo em Perfil → Backup.";

/** Abertura do app: migra e avisa a pessoa uma vez, se um cofre antigo foi desativado. */
export async function startVaultMigration(toast = share.showToast) {
  await runLegacyVaultMigration();
  if (consumeLegacyRevokedNotice()) toast(LEGACY_VAULT_NOTICE, "info");
}

function resolveCanonicalLocalBundle(matched) {
  if (matched?.routeId && matched?.publicJwk && matched?.privateJwk) {
    return {
      type: "vox-local-account-bundle",
      schemaVersion: 1,
      routeId: matched.routeId,
      publicJwk: matched.publicJwk,
      privateJwk: matched.privateJwk,
      displayName: matched.displayName || "",
      enrichment: matched.enrichment || null,
      pix: matched.pixKey || null,
    };
  }
  return null;
}

function readLocalVaultRecord(lookupKey, prefix) {
  try {
    const rawLocal = localStorage.getItem(prefix + lookupKey);
    if (!rawLocal) return { record: null, revoked: false };
    const parsed = JSON.parse(rawLocal);
    return isRevokedRecord(parsed) ? { record: null, revoked: true } : { record: parsed, revoked: false };
  } catch {
    return { record: null, revoked: false };
  }
}

async function findVaultRecordWithStatus(lookupKey, prefix) {
  const local = readLocalVaultRecord(lookupKey, prefix);
  if (local.revoked) return { record: null, revoked: true, reachable: 1 };
  if (local.record) return { record: local.record, revoked: false, reachable: 1 };
  return fetchRemoteVaultStatus(lookupKey);
}

async function findEncryptedVaultRecord(lookupKey, prefix) {
  return (await findVaultRecordWithStatus(lookupKey, prefix)).record;
}

function cleanupSupersededIdentity(prevId, canonicalId, displayName, avatarUrl) {
  if (prevId && prevId !== canonicalId && localAccount.isAccountDisposable(prevId)) {
    localAccount.removeVaultAccount(prevId);
    profileDirectory.removeProfileCard(prevId);
  }
  profileDirectory.pruneCardsMatchingSocialIdentity({
    canonicalRouteId: canonicalId,
    displayName,
    avatarUrl,
  });
  if (canonicalId && displayName) {
    profileDirectory.setProfileCard(canonicalId, {
      name: displayName,
      avatarUrl: avatarUrl || "",
      discoverable: true,
    });
  }
}

function enrichAccountFromProfile(provider, { name, picture, sub, email }) {
  if (provider === "passphrase") return;
  localAccount.setProfileEnrichment({
    displayName: name,
    avatarUrl: picture,
    oauthProvider: provider,
    oauthSub: sub,
    oauthEmail: email,
  });
}

function isValidAccountBundle(bundle) {
  const hasSeed = typeof bundle?.seed === "string" && bundle.seed.length > 0;
  return Boolean(bundle?.routeId && (hasSeed || (bundle?.publicJwk && bundle?.privateJwk)));
}

/** Último uso de um cofre v1 de login social: abre, troca a conta e revoga o endereço antigo. */
async function tryLegacyOAuthRestore(profile, provider) {
  const lookupKey = await legacyLookupKey(profile.sub, provider);
  const record = await findEncryptedVaultRecord(lookupKey, LEGACY_VAULT_PREFIX);
  if (!record) return null;
  let bundle = null;
  try {
    bundle = await decryptLegacyRecord(record, profile.sub, provider);
  } catch (err) {
    console.warn(`Falha ao abrir cofre antigo ${provider}:`, err);
  }
  if (!isValidAccountBundle(bundle)) return null;
  const prevId = localAccount.getCachedRouteIdSync();
  await localAccount.importLocalAccountBundle(bundle);
  const name = profile.name || bundle.displayName;
  enrichAccountFromProfile(provider, { ...profile, name, picture: profile.picture || bundle.avatarUrl });
  cleanupSupersededIdentity(prevId, bundle.routeId, name, profile.picture || bundle.avatarUrl);
  revokeLegacyVaults([lookupKey], { saveRemote: saveRemoteVaultRecord });
  markLegacyRevokedNotice();
  return { restored: true, routeId: bundle.routeId, displayName: name, legacyVault: true };
}

/** Login social sem cofre: vincula o login à conta deste aparelho (ou à conta já vinculada a ele aqui). */
async function bindLocalAccountToLogin(profile, provider) {
  const { sub, email, name, picture } = profile;
  const matched = localAccount.findVaultAccountByOAuth({
    oauthProvider: provider,
    oauthSub: sub,
    oauthEmail: email,
    avatarUrl: picture,
  });
  const localBundle = resolveCanonicalLocalBundle(matched);
  const prevId = localAccount.getCachedRouteIdSync();
  if (localBundle && localBundle.routeId !== prevId) {
    await localAccount.importLocalAccountBundle(localBundle);
  }
  const routeId = localBundle?.routeId || (await localAccount.ensureLocalAccount()).routeId;
  enrichAccountFromProfile(provider, profile);
  cleanupSupersededIdentity(prevId, routeId, name, picture);
  return { restored: Boolean(localBundle), routeId, displayName: name };
}

export async function restoreOrBindOAuthIdentity({ provider = "google", sub, email, name, picture }) {
  if (!sub) return { restored: false };
  const profile = { sub, email, name, picture };
  const legacy = await tryLegacyOAuthRestore(profile, provider);
  return legacy || bindLocalAccountToLogin(profile, provider);
}

export async function restoreOrBindGoogleIdentity({ sub, email, name, picture }) {
  return restoreOrBindOAuthIdentity({ provider: "google", sub, email, name, picture });
}

export async function restoreOrBindMetaIdentity({ sub, email, name, picture }) {
  return restoreOrBindOAuthIdentity({ provider: "meta", sub, email, name, picture });
}

/** PM-92: o cofre por senha fica guardado fora do aparelho; senha curta cai por tentativa. */
export const VAULT_PASSPHRASE_MIN = 12;

function persistVaultRecord(address, record, ownerToken) {
  try {
    localStorage.setItem(VAULT_STORAGE_PREFIX + address, JSON.stringify(record));
  } catch {
    /* ignore */
  }
  return saveRemoteVaultRecord(address, record, ownerToken);
}

function buildCompactVaultBundle(bundle) {
  if (typeof bundle?.seed !== "string") return bundle;
  const compact = { routeId: bundle.routeId, seed: bundle.seed };
  if (bundle.displayName) compact.displayName = bundle.displayName;
  if (bundle.enrichment && Object.keys(bundle.enrichment).length > 0) compact.enrichment = bundle.enrichment;
  if (bundle.pix) compact.pix = bundle.pix;
  if (bundle.createdAt) compact.createdAt = bundle.createdAt;
  return compact;
}

function parseSaveVaultOpts(emailOrOpts) {
  if (typeof emailOrOpts === "string") {
    return { email: normalizeVaultEmail(emailOrOpts), hasPrev: false, prevEmail: "", prevPassphrase: "" };
  }
  const opts = emailOrOpts || {};
  const email = normalizeVaultEmail(opts.email || "");
  const prevPassphrase = String(opts.prevPassphrase || "").trim();
  const hasPrev = Boolean(prevPassphrase || "prevEmail" in opts);
  const prevEmail = "prevEmail" in opts ? normalizeVaultEmail(opts.prevEmail || "") : email;
  return { email, hasPrev, prevEmail, prevPassphrase };
}

function revokeVaultAddress(address, ownerToken) {
  try { localStorage.removeItem(VAULT_STORAGE_PREFIX + address); } catch { /* ignore */ }
  return saveRemoteVaultRecord(address, { v: 2, revoked: true, updatedAt: Date.now() }, ownerToken);
}

async function maybeRevokePreviousVault(opts, cleanPass, newAddress) {
  if (!opts.hasPrev) return;
  const prevPass = opts.prevPassphrase || cleanPass;
  const [oldAddress, oldToken] = await Promise.all([deriveVaultAddress(prevPass, opts.prevEmail), deriveVaultOwnerToken(prevPass, opts.prevEmail)]);
  if (oldAddress !== newAddress) await revokeVaultAddress(oldAddress, oldToken);
}

/**
 * Salva o cofre cifrado v2 (local e memória central) usando e-mail (quando houver) e senha.
 * @param {string} passphrase
 * @param {string|{ email?: string, prevEmail?: string, prevPassphrase?: string }} [emailOrOpts]
 * @returns {Promise<object>}
 */
export async function savePassphraseVault(passphrase, emailOrOpts = "") {
  const clean = String(passphrase || "").trim();
  if (clean.length < VAULT_PASSPHRASE_MIN) {
    return { ok: false, reason: `A Senha Soberana precisa de pelo menos ${VAULT_PASSPHRASE_MIN} caracteres. Uma frase de 4 palavras serve.` };
  }
  const opts = parseSaveVaultOpts(emailOrOpts);
  const opened = await openBundleForVault(opts.prevPassphrase || clean);
  if (!opened.ok) return opened;
  const [address, ownerToken] = await Promise.all([deriveVaultAddress(clean, opts.email), deriveVaultOwnerToken(clean, opts.email)]);
  const compact = buildCompactVaultBundle(opened.bundle);
  const encrypted = await encryptVaultV2(compact, clean, undefined, opts.email);
  const syncBundle = opts.email ? await encryptVaultV2(compact, clean) : encrypted;
  const remote = await persistVaultRecord(address, encrypted, ownerToken);
  await maybeRevokePreviousVault(opts, clean, address);
  if (remote > 0) accountExit.markAccountExit("cofre", opened.bundle.routeId);
  clearLegacyRevokedNotice();
  return {
    ok: true,
    remote,
    lookupKey: address,
    routeId: opened.bundle.routeId,
    displayName: opened.bundle.displayName,
    bundle: encrypted,
    syncBundle,
    locked: await localAccount.lockAfterPasswordBackup(clean, opts.prevPassphrase),
  };
}

/** Conta travada (PM-93 etapa 2) só abre com a mesma Senha Soberana. */
async function openBundleForVault(clean) {
  try {
    return { ok: true, bundle: await localAccount.exportLocalAccountBundle(clean) };
  } catch (err) {
    return { ok: false, reason: err?.message || "Não foi possível abrir as chaves desta conta." };
  }
}

async function tryDecryptPassphraseRecord(record, cleanPassphrase, email = "") {
  try {
    const bundle = await decryptVaultRecord(record, cleanPassphrase, email);
    return isValidAccountBundle(bundle)
      ? { ok: true, bundle }
      : { ok: false, reason: "Dados do cofre inválidos ou corrompidos." };
  } catch {
    return { ok: false, reason: "Senha incorreta." };
  }
}

/** Procura o cofre da senha: e-mail+senha v2, v2 só-senha (para migrar) ou v1 antigo. */
async function locatePassphraseRecord(clean, addressOverride, normEmail = "") {
  const primaryAddr = addressOverride || (await deriveVaultAddress(clean, normEmail));
  const primary = await findVaultRecordWithStatus(primaryAddr, VAULT_STORAGE_PREFIX);
  if (primary.record) return { record: primary.record, legacyKey: null, legacyV2: null, reachable: primary.reachable };
  if (primary.revoked) return { record: null, legacyKey: null, legacyV2: null, reachable: primary.reachable };
  let reachable = primary.reachable;
  if (normEmail && !addressOverride) {
    const passOnlyAddr = await deriveVaultAddress(clean, "");
    const passOnly = await findVaultRecordWithStatus(passOnlyAddr, VAULT_STORAGE_PREFIX);
    reachable = Math.max(reachable, passOnly.reachable);
    if (passOnly.record) return { record: passOnly.record, legacyKey: null, legacyV2: { address: passOnlyAddr }, reachable };
    if (passOnly.revoked) return { record: null, legacyKey: null, legacyV2: null, reachable };
  }
  const legacyKey = await legacyLookupKey(clean, "passphrase");
  const legacy = await findVaultRecordWithStatus(legacyKey, LEGACY_VAULT_PREFIX);
  return { record: legacy.record, legacyKey: legacy.record ? legacyKey : null, legacyV2: null, reachable: Math.max(reachable, legacy.reachable) };
}

/** Cofre aberto em formato antigo: cifra de novo em v2 (se a senha deixa) e revoga o endereço v1. */
async function upgradeLegacyPassphraseVault(clean, legacyKey, normEmail = "") {
  if (legacyKey) revokeLegacyVaults([legacyKey], { saveRemote: saveRemoteVaultRecord });
  const saved = await savePassphraseVault(clean, normEmail);
  if (!saved.ok) markLegacyRevokedNotice();
  return saved.ok;
}

async function upgradePassphraseOnlyVault(clean, normEmail, legacyV2) {
  const saved = await savePassphraseVault(clean, normEmail);
  if (!saved.ok) return false;
  await revokeVaultAddress(legacyV2.address, await deriveVaultOwnerToken(clean, ""));
  return true;
}

function parseRestoreArgs(lookupKeyOverride, directRecord, email) {
  if (lookupKeyOverride && typeof lookupKeyOverride === "object") {
    return {
      lookupKey: lookupKeyOverride.lookupKey || null,
      directRecord: lookupKeyOverride.directRecord || directRecord || null,
      email: normalizeVaultEmail(lookupKeyOverride.email || email || ""),
    };
  }
  return { lookupKey: lookupKeyOverride || null, directRecord: directRecord || null, email: normalizeVaultEmail(email || "") };
}

async function finalizeVaultUpgrade(clean, located, normEmail) {
  if (!isV2Record(located.record)) return upgradeLegacyPassphraseVault(clean, located.legacyKey, normEmail);
  if (located.legacyV2 && normEmail) return upgradePassphraseOnlyVault(clean, normEmail, located.legacyV2);
  return false;
}

/**
 * Restaura a conta a partir do cofre por senha (e e-mail, se informado).
 * @param {string} passphrase
 * @param {string|{ lookupKey?: string, directRecord?: object, email?: string }|null} [lookupKeyOverride]
 * @param {object|null} [directRecord]
 * @param {string} [email]
 * @returns {Promise<object>}
 */
export async function restoreFromPassphraseVault(passphrase, lookupKeyOverride = null, directRecord = null, email = "") {
  const clean = String(passphrase || "").trim();
  if (!clean) return { ok: false, reason: "Senha soberana não informada." };
  const args = parseRestoreArgs(lookupKeyOverride, directRecord, email);
  const located = args.directRecord
    ? { record: args.directRecord, legacyKey: null, legacyV2: null, reachable: 1 }
    : await locatePassphraseRecord(clean, args.lookupKey, args.email);
  if (!located.record) return { ok: false, noServer: located.reachable === 0, reason: "Nenhum cofre encontrado para esta senha ou chave." };
  const decryptResult = await tryDecryptPassphraseRecord(located.record, clean, args.email);
  if (!decryptResult.ok) return decryptResult;
  const bundle = decryptResult.bundle;
  const prevId = localAccount.getCachedRouteIdSync();
  if (!(await localAccount.importLocalAccountBundle(bundle))) {
    return { ok: false, reason: "Dados do cofre inválidos ou corrompidos." };
  }
  cleanupSupersededIdentity(prevId, bundle.routeId, bundle.displayName, bundle.avatarUrl || bundle.enrichment?.avatarUrl);
  await localAccount.lockAfterPasswordBackup(clean);
  const upgraded = await finalizeVaultUpgrade(clean, located, args.email);
  return { ok: true, routeId: bundle.routeId, displayName: bundle.displayName || "", upgraded };
}
