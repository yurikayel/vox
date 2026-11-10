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
import { getCentralMemoryUrls } from "./central-memory.js";
import {
  decryptLegacyRecord,
  decryptVaultRecord,
  deriveVaultAddress,
  encryptVaultV2,
  isRevokedRecord,
  isV2Record,
  legacyLookupKey,
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

export async function fetchRemoteVaultRecord(lookupKey) {
  for (const baseUrl of getCentralMemoryUrls()) {
    try {
      const res = await fetch(`${baseUrl}/memory/vault/${lookupKey}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.record) return data.record;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function saveRemoteVaultRecord(lookupKey, record) {
  for (const baseUrl of getCentralMemoryUrls()) {
    try {
      void fetch(`${baseUrl}/memory/vault/${lookupKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupKey, record }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
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

async function findEncryptedVaultRecord(lookupKey, prefix) {
  try {
    const rawLocal = localStorage.getItem(prefix + lookupKey);
    if (rawLocal) return JSON.parse(rawLocal);
  } catch {
    /* ignore */
  }
  const remote = await fetchRemoteVaultRecord(lookupKey);
  return remote && !isRevokedRecord(remote) ? remote : null;
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
  return Boolean(bundle?.routeId && bundle?.publicJwk && bundle?.privateJwk);
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

function persistVaultRecord(address, record) {
  try {
    localStorage.setItem(VAULT_STORAGE_PREFIX + address, JSON.stringify(record));
  } catch {
    /* ignore */
  }
  saveRemoteVaultRecord(address, record);
}

export async function savePassphraseVault(passphrase) {
  const clean = String(passphrase || "").trim();
  if (clean.length < VAULT_PASSPHRASE_MIN) {
    return { ok: false, reason: `A Senha Soberana precisa de pelo menos ${VAULT_PASSPHRASE_MIN} caracteres. Uma frase de 4 palavras serve.` };
  }
  const address = await deriveVaultAddress(clean);
  const bundle = await localAccount.exportLocalAccountBundle();
  const encrypted = await encryptVaultV2(bundle, clean);
  persistVaultRecord(address, encrypted);
  clearLegacyRevokedNotice();
  return {
    ok: true,
    lookupKey: address,
    routeId: bundle.routeId,
    displayName: bundle.displayName,
    bundle: encrypted,
  };
}

async function tryDecryptPassphraseRecord(record, cleanPassphrase) {
  try {
    const bundle = await decryptVaultRecord(record, cleanPassphrase);
    return isValidAccountBundle(bundle)
      ? { ok: true, bundle }
      : { ok: false, reason: "Dados do cofre inválidos ou corrompidos." };
  } catch {
    return { ok: false, reason: "Senha incorreta." };
  }
}

/** Procura o cofre da senha: primeiro o v2; se não houver, um v1 antigo (que será migrado). */
async function locatePassphraseRecord(clean, addressOverride) {
  const address = addressOverride || (await deriveVaultAddress(clean));
  const current = await findEncryptedVaultRecord(address, VAULT_STORAGE_PREFIX);
  if (current) return { record: current, legacyKey: null };
  const legacyKey = await legacyLookupKey(clean, "passphrase");
  const legacy = await findEncryptedVaultRecord(legacyKey, LEGACY_VAULT_PREFIX);
  return { record: legacy, legacyKey: legacy ? legacyKey : null };
}

/** Cofre aberto em formato antigo: cifra de novo em v2 (se a senha deixa) e revoga o endereço v1. */
async function upgradeLegacyPassphraseVault(clean, legacyKey) {
  if (legacyKey) revokeLegacyVaults([legacyKey], { saveRemote: saveRemoteVaultRecord });
  const saved = await savePassphraseVault(clean);
  if (!saved.ok) markLegacyRevokedNotice();
  return saved.ok;
}

export async function restoreFromPassphraseVault(passphrase, lookupKeyOverride = null, directRecord = null) {
  const clean = String(passphrase || "").trim();
  if (!clean) return { ok: false, reason: "Senha soberana não informada." };

  const located = directRecord ? { record: directRecord, legacyKey: null } : await locatePassphraseRecord(clean, lookupKeyOverride);
  if (!located.record) return { ok: false, reason: "Nenhum cofre encontrado para esta senha ou chave." };

  const decryptResult = await tryDecryptPassphraseRecord(located.record, clean);
  if (!decryptResult.ok) return decryptResult;

  const bundle = decryptResult.bundle;
  const prevId = localAccount.getCachedRouteIdSync();
  await localAccount.importLocalAccountBundle(bundle);
  cleanupSupersededIdentity(prevId, bundle.routeId, bundle.displayName, bundle.avatarUrl || bundle.enrichment?.avatarUrl);
  const upgraded = isV2Record(located.record) ? false : await upgradeLegacyPassphraseVault(clean, located.legacyKey);
  return { ok: true, routeId: bundle.routeId, displayName: bundle.displayName || "", upgraded };
}
