/**
 * @module oauth-vault
 * Zero-Knowledge Vault Backup & Recovery via OAuth Subject (Google).
 * Permite restaurar o mesmo perfil canônico (routeId + chaves P-256 + DMs)
 * em qualquer navegador, sessão anônima ou após desconectar,
 * sem que o servidor tenha acesso às chaves privadas (cifrado via PBKDF2 + AES-GCM).
 */

import * as localAccount from "./local-account.js";
import * as profileDirectory from "./profile-directory.js";
import { getCentralMemoryUrls } from "./central-memory.js";

const VAULT_STORAGE_PREFIX = "vox-oauth-vault-v1:";
const ITERATIONS = 50000;

function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function computeVaultLookupKey(sub, provider = "google") {
  const raw = new TextEncoder().encode(`vox-vault-v1:${provider}:${sub}`);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return bufferToHex(digest);
}

export async function deriveVaultEncryptionKey(sub, provider = "google") {
  const enc = new TextEncoder().encode(sub);
  const salt = new TextEncoder().encode(`vox-sovereign-vault:${provider}:${sub}`);
  const baseKey = await crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVaultBundle(bundle, encKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encKey, plaintext);
  return {
    iv: bufferToHex(iv),
    ciphertext: bufferToHex(ciphertext),
    updatedAt: Date.now(),
  };
}

export async function decryptVaultBundle(record, encKey) {
  if (!record?.iv || !record?.ciphertext) return null;
  const iv = hexToBytes(record.iv);
  const ciphertext = hexToBytes(record.ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, encKey, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export async function fetchRemoteVaultRecord(lookupKey) {
  const urls = getCentralMemoryUrls();
  for (const baseUrl of urls) {
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
  const urls = getCentralMemoryUrls();
  for (const baseUrl of urls) {
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

async function findEncryptedVaultRecord(lookupKey) {
  try {
    const rawLocal = localStorage.getItem(VAULT_STORAGE_PREFIX + lookupKey);
    if (rawLocal) return JSON.parse(rawLocal);
  } catch {
    /* ignore */
  }
  const remote = await fetchRemoteVaultRecord(lookupKey);
  if (remote) {
    try {
      localStorage.setItem(VAULT_STORAGE_PREFIX + lookupKey, JSON.stringify(remote));
    } catch {
      /* ignore */
    }
  }
  return remote;
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

async function tryRestoreFromEncryptedRecord(record, encKey, profile, provider = "google") {
  if (!record) return null;
  try {
    const bundle = await decryptVaultBundle(record, encKey);
    if (bundle?.routeId && bundle?.publicJwk && bundle?.privateJwk) {
      const prevId = localAccount.getCachedRouteIdSync();
      await localAccount.importLocalAccountBundle(bundle);
      const name = profile.name || bundle.displayName;
      const avatarUrl = profile.picture || bundle.avatarUrl;
      if (provider !== "passphrase") {
        localAccount.setProfileEnrichment({
          displayName: name,
          avatarUrl,
          oauthProvider: provider,
          oauthSub: profile.sub,
          oauthEmail: profile.email,
        });
      }
      cleanupSupersededIdentity(prevId, bundle.routeId, name, avatarUrl);
      return { restored: true, routeId: bundle.routeId, displayName: name };
    }
  } catch (err) {
    console.warn(`Falha ao decifrar cofre ${provider}:`, err);
  }
  return null;
}

function persistEncryptedVaultRecord(lookupKey, encrypted) {
  try {
    localStorage.setItem(VAULT_STORAGE_PREFIX + lookupKey, JSON.stringify(encrypted));
  } catch {}
  saveRemoteVaultRecord(lookupKey, encrypted);
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

async function bindAndPersistNewVault(profile, lookupKey, encKey, provider = "google") {
  const { sub, email, name, picture } = profile;
  const matched = localAccount.findVaultAccountByOAuth({
    oauthProvider: provider,
    oauthSub: sub,
    oauthEmail: email,
    avatarUrl: picture,
  });
  const localBundle = resolveCanonicalLocalBundle(matched);
  const prevId = localAccount.getCachedRouteIdSync();
  const bundleToPersist = localBundle || (await localAccount.exportLocalAccountBundle());

  if (localBundle && localBundle.routeId !== prevId) {
    await localAccount.importLocalAccountBundle(localBundle);
  }

  const encrypted = await encryptVaultBundle(bundleToPersist, encKey);
  persistEncryptedVaultRecord(lookupKey, encrypted);
  enrichAccountFromProfile(provider, profile);
  cleanupSupersededIdentity(prevId, bundleToPersist.routeId, name, picture);
  return { restored: Boolean(localBundle), routeId: bundleToPersist.routeId, displayName: name };
}

export async function restoreOrBindOAuthIdentity({ provider = "google", sub, email, name, picture }) {
  if (!sub) return { restored: false };
  const lookupKey = await computeVaultLookupKey(sub, provider);
  const encKey = await deriveVaultEncryptionKey(sub, provider);

  const record = await findEncryptedVaultRecord(lookupKey);
  const restored = await tryRestoreFromEncryptedRecord(record, encKey, { sub, email, name, picture }, provider);
  if (restored) return restored;

  return bindAndPersistNewVault({ sub, email, name, picture }, lookupKey, encKey, provider);
}

export async function restoreOrBindGoogleIdentity({ sub, email, name, picture }) {
  return restoreOrBindOAuthIdentity({ provider: "google", sub, email, name, picture });
}

export async function restoreOrBindMetaIdentity({ sub, email, name, picture }) {
  return restoreOrBindOAuthIdentity({ provider: "meta", sub, email, name, picture });
}

export function encodeVaultBundleForUrl(record) {
  if (!record?.iv || !record?.ciphertext) return "";
  const compact = `${record.iv}:${record.ciphertext}`;
  return btoa(compact).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeVaultBundleFromUrl(encoded) {
  if (!encoded) return null;
  try {
    const raw = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const [iv, ciphertext] = raw.split(":");
    if (!iv || !ciphertext) return null;
    return { iv, ciphertext, updatedAt: Date.now() };
  } catch {
    return null;
  }
}

export async function savePassphraseVault(passphrase) {
  const clean = String(passphrase || "").trim();
  if (clean.length < 4) {
    return { ok: false, reason: "A senha soberana deve ter pelo menos 4 caracteres." };
  }
  const lookupKey = await computeVaultLookupKey(clean, "passphrase");
  const encKey = await deriveVaultEncryptionKey(clean, "passphrase");
  const bundle = await localAccount.exportLocalAccountBundle();
  const encrypted = await encryptVaultBundle(bundle, encKey);
  persistEncryptedVaultRecord(lookupKey, encrypted);
  return {
    ok: true,
    lookupKey,
    routeId: bundle.routeId,
    displayName: bundle.displayName,
    bundle: encrypted,
  };
}

function isValidAccountBundle(bundle) {
  return Boolean(bundle?.routeId && bundle?.publicJwk && bundle?.privateJwk);
}

async function tryDecryptPassphraseRecord(record, cleanPassphrase) {
  const encKey = await deriveVaultEncryptionKey(cleanPassphrase, "passphrase");
  try {
    const bundle = await decryptVaultBundle(record, encKey);
    return isValidAccountBundle(bundle)
      ? { ok: true, bundle }
      : { ok: false, reason: "Dados do cofre inválidos ou corrompidos." };
  } catch {
    return { ok: false, reason: "Senha incorreta." };
  }
}

export async function restoreFromPassphraseVault(passphrase, lookupKeyOverride = null, directRecord = null) {
  const clean = String(passphrase || "").trim();
  if (!clean) return { ok: false, reason: "Senha soberana não informada." };

  const lookupKey = lookupKeyOverride || (await computeVaultLookupKey(clean, "passphrase"));
  const record = directRecord || (await findEncryptedVaultRecord(lookupKey));
  if (!record) return { ok: false, reason: "Nenhum cofre encontrado para esta senha ou chave." };

  const decryptResult = await tryDecryptPassphraseRecord(record, clean);
  if (!decryptResult.ok) return decryptResult;

  const bundle = decryptResult.bundle;
  const prevId = localAccount.getCachedRouteIdSync();
  await localAccount.importLocalAccountBundle(bundle);
  cleanupSupersededIdentity(prevId, bundle.routeId, bundle.displayName, bundle.avatarUrl || bundle.enrichment?.avatarUrl);
  return { ok: true, routeId: bundle.routeId, displayName: bundle.displayName || "" };
}
