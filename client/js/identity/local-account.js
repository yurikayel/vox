/**
 * Conta Local & Identidade P2P-first (Fase 1 / Protocolo vox-local-v0)
 * Permite autoria, participação em comunidades e mensagens diretas
 * sem dependência obrigatória de carteira Arweave ou custos financeiros.
 */

import * as cryptoDm from "../crypto-dm.js";
import * as identitySeed from "./identity-seed.js";
import { HELD_STORAGE as GUARDIAN_SHARES_STORAGE } from "./guardians.js";
import { isLocked, openSealed, sealJson } from "./keystore.js";
import { dropSessionPassphrase, dropStorageKeys } from "./local-wipe.js";
import * as keyLock from "./key-lock.js";
import { canonicalString, withSigv } from "../sig-format.js";
import { bytesToB64Url, computeRouteId, verifyPayload } from "../signed-verify.js";
import { computeAccountSocialKey, detectSocialAvatarType, matchesOAuthEnrichment } from "../account-social-match.js";

export { computeRouteId, verifyPayload };
export { LOCAL_WIPE_NOTICE, confirmLocalWipe, dropAllPersonalStorage, dropDatabases } from "./local-wipe.js";

const ACCOUNT_STORAGE = "vox-local-account-v1";
const DISPLAY_NAME_STORAGE = "vox-display-name";
const PIX_STORAGE = "vox-pix-key-v1";
const ENRICHMENT_STORAGE = "vox-profile-enrichment-v1";
const DISCOVERABLE_STORAGE = "vox-discoverable-mesh-v1";
const DM_KEYPAIR_STORAGE = "vox-dm-keypair";
const VAULT_STORAGE = "vox-accounts-vault-v1";

const LOCAL_WIPE_KEYS = [
  ACCOUNT_STORAGE,
  DM_KEYPAIR_STORAGE,
  DISPLAY_NAME_STORAGE,
  PIX_STORAGE,
  ENRICHMENT_STORAGE,
  DISCOVERABLE_STORAGE,
  VAULT_STORAGE,
  identitySeed.SEED_STORAGE,
  GUARDIAN_SHARES_STORAGE,
];

let cachedAccount = null;
let ensureLocalAccountInflight = null;
// Sobe a cada `wipeLocalAccount`: criação em voo que começou numa época anterior não grava mais nada.
let wipeEpoch = 0;
let accountPersistIssue = null;

/**
 * Grava a conta ativa (chave privada já na forma guardada: cifrada ou travada).
 * @param {{ routeId: string, publicJwk: object, privateJwk: object, createdAt?: number }} acc conta
 * @returns {object} a mesma conta
 */
export function storeActiveAccount(acc) {
  cachedAccount = acc;
  localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify(acc));
  accountPersistIssue = null;
  return acc;
}

/** @returns {{ reason: string } | null} falha ao criar conta neste aparelho, ou `null` se ok. */
export function getAccountStorageIssue() {
  return accountPersistIssue;
}

async function loadStoredLocalAccount(epoch) {
  try {
    const stored = localStorage.getItem(ACCOUNT_STORAGE);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed?.routeId && parsed?.publicJwk && parsed?.privateJwk) {
      const dm = await cryptoDm.ensureDmKeys();
      if (epoch !== wipeEpoch) dropDmKeypairOf(dm.publicJwk);
      return parsed;
    }
  } catch {}
  return null;
}

/** Tira a chave de DM do armazenamento só se for a deste par; a de outra conta (mais nova) fica. */
function dropDmKeypairOf(publicJwk) {
  try {
    const stored = JSON.parse(localStorage.getItem(DM_KEYPAIR_STORAGE) || "null");
    if (JSON.stringify(stored?.publicJwk) === JSON.stringify(publicJwk)) localStorage.removeItem(DM_KEYPAIR_STORAGE);
  } catch {}
}

/**
 * Cria conta nova, mas só grava a chave de DM se o wipe não rodou no meio. Se rodou, desfaz o que já foi gravado
 * (semente e chave de DM) e devolve `null`: a conta apagada não pode voltar.
 */
async function createAccountUnlessWiped(epoch) {
  const born = await identitySeed.createSeededAccount();
  let account = null;
  if (epoch === wipeEpoch) {
    await cryptoDm.setDmKeypair(born.dmKeypair);
    account = { routeId: born.routeId, publicJwk: born.publicJwk, privateJwk: await sealJson(born.privateJwk), createdAt: Date.now() };
  }
  if (account && epoch === wipeEpoch) return account;
  dropDmKeypairOf(born.dmKeypair.publicJwk);
  identitySeed.forgetSeed(born.routeId);
  return null;
}

/** ADR-032 §3.3: conta nova nasce de uma semente (assinatura e DM), que vira a frase de 12 palavras. */
async function generateNewAccountKeys() {
  const born = await identitySeed.createSeededAccount();
  await cryptoDm.setDmKeypair(born.dmKeypair);
  return { routeId: born.routeId, publicJwk: born.publicJwk, privateJwk: await sealJson(born.privateJwk), createdAt: Date.now() };
}

function buildVaultAccountEntry(acc, existing, extras = {}) {
  const enrich = getProfileEnrichment() || existing.enrichment || null;
  const now = Date.now();
  return {
    ...existing,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk || existing.publicJwk,
    privateJwk: acc.privateJwk || existing.privateJwk,
    displayName: getDisplayName() || enrich?.displayName || existing.displayName || "",
    enrichment: enrich,
    createdAt: acc.createdAt || existing.createdAt || now,
    lastUsedAt: existing.lastUsedAt || now,
    ...extras,
  };
}

function syncCurrentAccountMetadataToVault() {
  const acc = cachedAccount;
  if (!acc?.routeId) return;
  try {
    const raw = localStorage.getItem(VAULT_STORAGE);
    const vault = raw ? JSON.parse(raw) : {};
    const existing = vault[acc.routeId] || {};
    vault[acc.routeId] = buildVaultAccountEntry(acc, existing);
    localStorage.setItem(VAULT_STORAGE, JSON.stringify(vault));
  } catch {}
}

/** Uma tentativa de achar ou criar a conta; `null` se o wipe rodou no meio (nada foi gravado em nome da conta apagada). */
async function resolveLocalAccount(epoch) {
  const existing = await loadStoredLocalAccount(epoch);
  if (epoch !== wipeEpoch) return null;
  if (existing) {
    cachedAccount = existing;
    syncCurrentAccountMetadataToVault();
    return cachedAccount;
  }
  const fresh = await createAccountUnlessWiped(epoch);
  if (!fresh) return null;
  try {
    storeActiveAccount(fresh);
  } catch (err) {
    accountPersistIssue = { reason: err?.name || "storage_blocked" };
    cachedAccount = fresh;
  }
  syncCurrentAccountMetadataToVault();
  return cachedAccount;
}

/**
 * Conta ativa deste navegador; cria uma nova (chaves P-256) se ainda não houver. Chamadas concorrentes compartilham a mesma criação em voo (mesma conta para todos).
 * Se `wipeLocalAccount` rodar no meio, o que estava em voo é descartado sem gravar nada e quem esperava recebe a conta nova (nunca a apagada).
 * @returns {Promise<{ routeId: string, publicJwk: object, privateJwk: object, createdAt: number }>}
 */
export async function ensureLocalAccount() {
  if (ensureLocalAccountInflight) return ensureLocalAccountInflight;
  const run = resolveLocalAccount(wipeEpoch).then((acc) => acc || ensureLocalAccount());
  ensureLocalAccountInflight = run;
  try {
    return await run;
  } finally {
    if (ensureLocalAccountInflight === run) ensureLocalAccountInflight = null;
  }
}

/**
 * Identificador público da conta ativa (`vx_…`), criando a conta se preciso.
 * @returns {Promise<string>}
 */
export async function getRouteId() {
  const acc = await ensureLocalAccount();
  return acc?.routeId || "";
}

/**
 * Identificador da conta ativa sem esperar nada: memória ou `localStorage`.
 * @returns {string} `vx_…`, ou "" se ainda não há conta
 */
export function getCachedRouteIdSync() {
  if (cachedAccount?.routeId) return cachedAccount.routeId;
  try {
    const stored = localStorage.getItem(ACCOUNT_STORAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.routeId) {
        cachedAccount = parsed;
        return parsed.routeId;
      }
    }
  } catch {}
  return "";
}

/**
 * Nome de exibição escolhido pela pessoa.
 * @returns {string}
 */
export function getDisplayName() {
  try {
    return localStorage.getItem(DISPLAY_NAME_STORAGE) || "";
  } catch {
    return "";
  }
}

/**
 * Grava o nome de exibição (até 30 caracteres) e copia para a conta guardada.
 * @param {string} name nome escolhido
 * @returns {string} o nome gravado, ou "" se não gravou
 */
export function setDisplayName(name) {
  try {
    const clean = String(name || "").trim().slice(0, 30);
    localStorage.setItem(DISPLAY_NAME_STORAGE, clean);
    syncCurrentAccountMetadataToVault();
    return clean;
  } catch {
    return "";
  }
}

/**
 * Perfil trazido de um login vinculado (nome, bio, foto, provedor).
 * @returns {object|null}
 */
export function getProfileEnrichment() {
  try {
    const raw = localStorage.getItem(ENRICHMENT_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Mescla campos no perfil vinculado; campos ausentes ficam como estavam.
 * @param {{ displayName?: string, bio?: string, avatarUrl?: string, oauthProvider?: string, oauthSub?: string, oauthEmail?: string }} [fields] campos novos
 * @returns {object|null} perfil gravado, ou null se não gravou
 */
export function setProfileEnrichment({ displayName, bio, avatarUrl, oauthProvider, oauthSub, oauthEmail } = {}) {
  try {
    const prev = getProfileEnrichment() || {};
    const next = {
      ...prev,
      displayName: displayName !== undefined ? String(displayName).trim().slice(0, 80) : prev.displayName,
      bio: bio !== undefined ? String(bio).trim().slice(0, 280) : prev.bio,
      avatarUrl: avatarUrl !== undefined ? String(avatarUrl).trim().slice(0, 512) : prev.avatarUrl,
      oauthProvider: oauthProvider !== undefined ? String(oauthProvider).trim() : prev.oauthProvider,
      oauthSub: oauthSub !== undefined ? String(oauthSub).trim() : prev.oauthSub,
      oauthEmail: oauthEmail !== undefined ? String(oauthEmail).trim() : prev.oauthEmail,
      linkedAt: Date.now(),
    };
    localStorage.setItem(ENRICHMENT_STORAGE, JSON.stringify(next));
    if (next.displayName) setDisplayName(next.displayName);
    syncCurrentAccountMetadataToVault();
    return next;
  } catch {
    return null;
  }
}

/**
 * Apaga o perfil vinculado deste navegador.
 * @returns {boolean} se apagou
 */
export function clearProfileEnrichment() {
  try {
    localStorage.removeItem(ENRICHMENT_STORAGE);
    return true;
  } catch {
    return false;
  }
}

async function openDmKeypair(dmAtRest) {
  if (!dmAtRest) return null;
  return { publicJwk: dmAtRest.publicJwk, privateJwk: await openSealed(dmAtRest.privateJwk) };
}

/**
 * Chaves privadas abertas, só para backup. Conta travada (PM-93 etapa 2): abre a cópia cifrada pela Senha
 * Soberana, e sem a senha certa lança `KeyLockedError`.
 * @param {string} [passphrase]
 * @returns {Promise<{ acc: object, privateJwk: JsonWebKey, dmKeypair: object, seed: string|null }>}
 */
export async function openAccountKeys(passphrase = "") {
  const acc = await ensureLocalAccount();
  const dmAtRest = await cryptoDm.getDmKeypairAtRest();
  const locked = isLocked(acc.privateJwk) || isLocked(dmAtRest?.privateJwk);
  const copy = locked ? await keyLock.openLockedCopy(acc.routeId, passphrase) : null;
  const seed = copy ? (copy.seed || null) : await identitySeed.seedForLock(acc.routeId);
  return {
    acc,
    privateJwk: copy ? copy.privateJwk : await openSealed(acc.privateJwk),
    dmKeypair: copy ? copy.dmKeypair : await openDmKeypair(dmAtRest),
    seed,
  };
}

/**
 * PM-93 etapa 2: depois de um backup com a Senha Soberana, assinatura e DM passam a usar chaves não exportáveis
 * e a única cópia exportável é a cifrada pela senha. Devolve se a conta ficou (ou já estava) travada.
 * @param {string} passphrase
 * @param {string} [prevPassphrase] Senha anterior, quando a Senha Soberana está sendo trocada.
 * @returns {Promise<boolean>}
 */
export async function lockActiveAccount(passphrase, prevPassphrase = "") {
  const current = await ensureLocalAccount();
  const changingPass = Boolean(prevPassphrase && prevPassphrase !== passphrase);
  if (isLocked(current.privateJwk) && !changingPass) return true;
  const { acc, privateJwk, dmKeypair, seed } = await openAccountKeys(prevPassphrase || passphrase);
  const finalSeed = seed || (await identitySeed.seedForLock(acc.routeId));
  const refs = await keyLock.lockKeys({ routeId: acc.routeId, publicJwk: acc.publicJwk, privateJwk, dmKeypair, seed: finalSeed }, passphrase);
  if (!refs || cachedAccount?.routeId !== acc.routeId) return false;
  storeActiveAccount({ ...cachedAccount, privateJwk: refs.privateJwk });
  identitySeed.markSeedLocked(acc.routeId);
  if (refs.dmPrivateJwk) await cryptoDm.setDmKeypair({ publicJwk: dmKeypair.publicJwk, privateJwk: refs.dmPrivateJwk });
  await syncActiveAccountToVault();
  return true;
}

/**
 * Tenta travar depois de um backup com senha; falha deixa a conta como estava (cifrada pelo aparelho).
 * @param {string} passphrase
 * @param {string} [prevPassphrase]
 * @returns {Promise<boolean>}
 */
export async function lockAfterPasswordBackup(passphrase, prevPassphrase = "") {
  try {
    return await lockActiveAccount(passphrase, prevPassphrase);
  } catch {
    return false;
  }
}

/**
 * Exporta o pacote da conta local para cofre ou arquivo, preservando a semente quando existir.
 * @param {string} [passphrase]
 * @returns {Promise<object>}
 */
export async function exportLocalAccountBundle(passphrase = "") {
  const { acc, privateJwk, seed } = await openAccountKeys(passphrase);
  return {
    type: "vox-local-account-bundle",
    schemaVersion: 1,
    routeId: acc.routeId,
    publicJwk: acc.publicJwk,
    privateJwk,
    ...(seed ? { seed } : {}),
    displayName: getDisplayName(),
    enrichment: getProfileEnrichment(),
    pix: getPixKey(),
    exportedAt: Date.now(),
  };
}

async function adoptImportedIdentity(bundle) {
  if (typeof bundle?.seed === "string") {
    const seeded = await identitySeed.restoreAccountFromSeedB64(bundle.seed, bundle.routeId);
    return seeded ? { routeId: seeded.routeId, publicJwk: seeded.publicJwk, privateJwk: seeded.privateJwk, dmKeypair: seeded.dmKeypair } : null;
  }
  if (!bundle?.routeId || !bundle?.publicJwk || !bundle?.privateJwk) return null;
  return { routeId: bundle.routeId, publicJwk: bundle.publicJwk, privateJwk: bundle.privateJwk, dmKeypair: bundle.dmKeypair || null };
}

function importedSettings(bundle, identity) {
  const known = readVaultMap()[identity.routeId] || {};
  const picked = { displayName: bundle.displayName, enrichment: bundle.enrichment, pixKey: bundle.pix, dmKeypair: identity.dmKeypair };
  return { ...known, ...Object.fromEntries(Object.entries(picked).filter(([, v]) => v)) };
}

/**
 * Importa um pacote de conta (com ou sem semente) para este aparelho. Se é outra conta, a atual vai antes para o
 * cofre local, e nome, enriquecimento, Pix e chave de DM passam a ser os da importada (do pacote ou, se ela já
 * esteve aqui, do cofre local), nunca os da anterior.
 * @param {object} bundle
 * @returns {Promise<boolean>}
 */
export async function importLocalAccountBundle(bundle) {
  const identity = await adoptImportedIdentity(bundle);
  if (!identity) return false;
  const previous = getCachedRouteIdSync();
  if (previous && previous !== identity.routeId) await syncActiveAccountToVault();
  const settings = importedSettings(bundle, identity);
  const privateJwk = await sealJson(identity.privateJwk);
  storeActiveAccount({ routeId: identity.routeId, publicJwk: identity.publicJwk, privateJwk, createdAt: bundle.createdAt || Date.now() });
  if (previous !== identity.routeId) return restoreTargetAccountSettings(settings).then(() => true);
  if (bundle.displayName) setDisplayName(bundle.displayName);
  writeOrRemove(ENRICHMENT_STORAGE, settings.enrichment);
  writeOrRemove(PIX_STORAGE, settings.pixKey);
  if (identity.dmKeypair) await cryptoDm.setDmKeypair(identity.dmKeypair);
  else await cryptoDm.ensureDmKeys();
  return true;
}

/**
 * Chave Pix da conta ativa (normalizada, tipo e versão mascarada).
 * @returns {{ normalized: string, type: string, masked: string, updatedAt: number }|null}
 */
export function getPixKey() {
  try {
    const raw = localStorage.getItem(PIX_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Grava a chave Pix da conta ativa.
 * @param {{ normalized: string, type: string, masked?: string }} pix chave já validada
 * @returns {{ normalized: string, type: string, masked: string, updatedAt: number }|null} o que foi gravado, ou null
 */
export function setPixKey({ normalized, type, masked = "" }) {
  try {
    const data = {
      normalized: String(normalized || ""),
      type: String(type || "unknown"),
      masked: String(masked || ""),
      updatedAt: Date.now(),
    };
    localStorage.setItem(PIX_STORAGE, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

/**
 * Apaga a chave Pix da conta ativa.
 * @returns {boolean} se apagou
 */
export function clearPixKey() {
  try {
    localStorage.removeItem(PIX_STORAGE);
    return true;
  } catch {
    return false;
  }
}

function buildEnrichedPayloadForSigning(payload, routeId) {
  const enrich = getProfileEnrichment();
  const fallbackDisplay = getDisplayName() || enrich?.displayName || "";
  const fallbackAvatar = enrich?.avatarUrl || "";
  return {
    ...payload,
    id: payload.id || "p_" + bytesToB64Url(crypto.getRandomValues(new Uint8Array(12))),
    author: routeId,
    ...(payload.authorDisplay !== undefined
      ? { authorDisplay: payload.authorDisplay }
      : (fallbackDisplay ? { authorDisplay: fallbackDisplay } : {})),
    ...(payload.authorAvatar !== undefined
      ? { authorAvatar: payload.authorAvatar }
      : (fallbackAvatar ? { authorAvatar: fallbackAvatar } : {})),
    ts: payload.ts || Date.now(),
  };
}

/**
 * Assina um payload com a chave da conta ativa (ECDSA P-256 / SHA-256, sobre o JSON canônico).
 * @param {object} payload conteúdo a assinar
 * @returns {Promise<object>} payload com `routeId`, `sigv`, `pubKey` e `sig`
 */
export async function signPayload(payload) {
  const acc = await ensureLocalAccount();
  const privateKey = await keyLock.signingKey(acc.privateJwk);

  const enriched = withSigv(buildEnrichedPayloadForSigning(payload, acc.routeId));
  const rawData = new TextEncoder().encode(canonicalString(enriched));
  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    rawData
  );

  return {
    ...enriched,
    pubKey: acc.publicJwk,
    sig: bytesToB64Url(sigBuffer),
  };
}


/**
 * A conta aparece para quem está na mesma rede local? (padrão: sim)
 * @returns {boolean}
 */
export function getMeshDiscoverable() {
  try {
    return localStorage.getItem(DISCOVERABLE_STORAGE) !== "0";
  } catch {
    return true;
  }
}

/**
 * Liga ou desliga a descoberta na rede local.
 * @param {boolean} on aparecer ou não
 * @returns {boolean} se gravou
 */
export function setMeshDiscoverable(on) {
  try {
    localStorage.setItem(DISCOVERABLE_STORAGE, on ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpa a conta deste navegador; a promessa termina quando as chaves travadas saem do IndexedDB.
 * @returns {Promise<void>}
 */
export function wipeLocalAccount() {
  wipeEpoch += 1;
  ensureLocalAccountInflight = null;
  cachedAccount = null;
  accountPersistIssue = null;
  dropStorageKeys(localStorage, LOCAL_WIPE_KEYS);
  dropSessionPassphrase();
  return keyLock.forgetAllLockedAccounts().catch(() => {});
}


function readVaultMap() {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeVaultMap(map) {
  try {
    localStorage.setItem(VAULT_STORAGE, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * Copia a conta ativa (chaves, nome, Pix, perfil) para a lista de contas deste aparelho.
 * @returns {Promise<object|null>} a entrada gravada, ou null sem conta
 */
export async function syncActiveAccountToVault() {
  const acc = await ensureLocalAccount();
  if (!acc?.routeId) return null;
  const vault = readVaultMap();
  const existing = vault[acc.routeId] || {};
  const dmKeys = await cryptoDm.getDmKeypairAtRest();
  vault[acc.routeId] = buildVaultAccountEntry(acc, existing, {
    dmKeypair: dmKeys || existing.dmKeypair || null,
    pixKey: getPixKey() || existing.pixKey || null,
    meshDiscoverable: getMeshDiscoverable(),
    lastUsedAt: Date.now(),
  });
  writeVaultMap(vault);
  return vault[acc.routeId];
}

/**
 * Remove da lista de contas as duplicadas pelo mesmo login social, mantendo a ativa.
 * @returns {void}
 */
export function deduplicateVaultAccounts() {
  const vault = readVaultMap();
  const seenSocial = new Map();
  let changed = false;
  const currentId = getCachedRouteIdSync();

  for (const [id, acc] of Object.entries(vault)) {
    const socialKey = computeAccountSocialKey(acc);
    if (!socialKey) continue;

    if (seenSocial.has(socialKey)) {
      const canonicalId = seenSocial.get(socialKey);
      const toRemove = id === currentId ? canonicalId : id;
      delete vault[toRemove];
      changed = true;
      if (toRemove === canonicalId) seenSocial.set(socialKey, id);
    } else {
      seenSocial.set(socialKey, id);
    }
  }
  if (changed) writeVaultMap(vault);
}

/**
 * Conta guardada que já foi vinculada a este login (por `sub`, e-mail ou foto do Google).
 * @param {{ oauthProvider?: string, oauthSub?: string, oauthEmail?: string, avatarUrl?: string }} [login] dados do login
 * @returns {object|null} a entrada da lista, ou null
 */
export function findVaultAccountByOAuth({ oauthProvider = "", oauthSub, oauthEmail, avatarUrl } = {}) {
  const vault = readVaultMap();
  const cleanSub = String(oauthSub || "").trim();
  const cleanEmail = String(oauthEmail || "").trim().toLowerCase();
  const cleanAv = String(avatarUrl || "").trim();
  const isGoogleAv = detectSocialAvatarType(cleanAv) === "google";

  for (const item of Object.values(vault)) {
    if (matchesOAuthEnrichment({ enrich: item.enrichment || {}, cleanSub, cleanEmail, isGoogleAv, cleanAv, provider: oauthProvider })) {
      return item;
    }
  }
  return null;
}

/**
 * Conta descartável: sem nome escolhido, sem Pix e sem perfil vinculado.
 * @param {string} routeId conta (`vx_…`)
 * @returns {boolean}
 */
export function isAccountDisposable(routeId) {
  if (!routeId) return false;
  const vault = readVaultMap();
  const item = vault[routeId];
  if (!item) return false;
  const isNamed = item.displayName && !item.displayName.startsWith("vx_");
  const hasPix = Boolean(item.pixKey);
  const hasEnrich = Boolean(item.enrichment?.oauthProvider);
  return !isNamed && !hasPix && !hasEnrich;
}

/**
 * Contas guardadas neste aparelho, a mais usada primeiro, sem sincronizar a ativa antes.
 * @returns {Array<object>} resumo de cada conta (`routeId`, nome, foto, se é a ativa…)
 */
export function listVaultAccountsSync() {
  deduplicateVaultAccounts();
  const vault = readVaultMap();
  const currentId = getCachedRouteIdSync();
  return Object.values(vault).map((item) => ({
    routeId: item.routeId,
    displayName: item.displayName || item.enrichment?.displayName || "",
    avatarUrl: item.enrichment?.avatarUrl || "",
    bio: item.enrichment?.bio || "",
    createdAt: item.createdAt || 0,
    lastUsedAt: item.lastUsedAt || 0,
    isCurrent: item.routeId === currentId,
  })).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

/**
 * Contas guardadas neste aparelho, depois de copiar a ativa para a lista.
 * @returns {Promise<Array<object>>}
 */
export async function listVaultAccounts() {
  await syncActiveAccountToVault();
  return listVaultAccountsSync();
}

function writeOrRemove(key, value) {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  else localStorage.removeItem(key);
}

// Sem chave de DM guardada, gera uma nova: a da conta que estava ativa nunca passa para outra.
async function restoreTargetAccountSettings(target) {
  await cryptoDm.setDmKeypair(target.dmKeypair || (await cryptoDm.generateDmKeypair()));
  setDisplayName(target.displayName || target.enrichment?.displayName || "");
  writeOrRemove(ENRICHMENT_STORAGE, target.enrichment);
  writeOrRemove(PIX_STORAGE, target.pixKey);
  setMeshDiscoverable(target.meshDiscoverable !== false);
}

/**
 * Troca a conta ativa por outra guardada neste aparelho.
 * @param {string} targetRouteId conta de destino (`vx_…`)
 * @returns {Promise<boolean>} se trocou
 */
export async function switchActiveAccount(targetRouteId) {
  if (!targetRouteId) return false;
  await syncActiveAccountToVault();
  const vault = readVaultMap();
  const target = vault[targetRouteId];
  if (!target?.routeId || !target?.publicJwk || !target?.privateJwk) return false;

  storeActiveAccount({
    routeId: target.routeId,
    publicJwk: target.publicJwk,
    privateJwk: await sealJson(target.privateJwk),
    createdAt: target.createdAt || Date.now(),
  });
  await restoreTargetAccountSettings(target);
  target.lastUsedAt = Date.now();
  vault[targetRouteId] = target;
  writeVaultMap(vault);
  return true;
}

/**
 * Cria mais uma conta neste aparelho e a torna ativa (a anterior fica na lista).
 * @param {{ displayName?: string }} [opts] nome inicial
 * @returns {Promise<{ routeId: string, publicJwk: object, privateJwk: object, createdAt: number }>}
 */
export async function createAdditionalAccount({ displayName = "" } = {}) {
  await syncActiveAccountToVault();
  storeActiveAccount(await generateNewAccountKeys());
  setDisplayName(displayName);
  localStorage.removeItem(ENRICHMENT_STORAGE);
  localStorage.removeItem(PIX_STORAGE);

  await syncActiveAccountToVault();
  return cachedAccount;
}

/**
 * Tira uma conta (que não seja a ativa) deste aparelho, com chaves travadas e semente.
 * @param {string} targetRouteId conta (`vx_…`)
 * @returns {boolean} se removeu
 */
export function removeVaultAccount(targetRouteId) {
  const currentId = getCachedRouteIdSync();
  if (!targetRouteId || targetRouteId === currentId) return false;
  const vault = readVaultMap();
  if (!vault[targetRouteId]) return false;
  delete vault[targetRouteId];
  writeVaultMap(vault);
  void keyLock.forgetLockedAccount(targetRouteId).catch(() => {});
  identitySeed.forgetSeed(targetRouteId);
  return true;
}
