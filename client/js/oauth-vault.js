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
import * as share from "./share.js";
import { getCentralMemoryUrls } from "./central-memory.js";
import { cleanupSupersededIdentity, isValidAccountBundle } from "./passphrase-vault.js";
import {
  findEncryptedVaultRecord,
  saveRemoteVaultRecord,
} from "./vault-store.js";
import {
  decryptLegacyRecord,
  legacyLookupKey,
} from "./vault-crypto.js";
import {
  LEGACY_VAULT_PREFIX,
  consumeLegacyRevokedNotice,
  markLegacyRevokedNotice,
  migrateLegacyVaults,
  revokeLegacyVaults,
} from "./vault-legacy.js";

export { encodeVaultBundleForUrl, decodeVaultBundleFromUrl } from "./vault-crypto.js";
export { fetchRemoteVaultRecord, saveRemoteVaultRecord } from "./vault-store.js";
export { VAULT_PASSPHRASE_MIN, restoreFromPassphraseVault, savePassphraseVault } from "./passphrase-vault.js";

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
