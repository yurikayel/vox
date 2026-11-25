/**
 * @module passphrase-vault
 * Cofre por Senha Soberana (PM-92, ADR-014, ADR-032 Emenda 1): salva e restaura a conta com senha e,
 * quando a pessoa quer, e-mail. Cofres antigos (v1, ou v2 só-senha quando agora há e-mail) são cifrados
 * de novo e o endereço antigo é revogado. `oauth-vault.js` reexporta a API pública deste módulo.
 */

import * as localAccount from "../identity/index.js";
import * as profileDirectory from "../profile-directory.js";
import {
  VAULT_STORAGE_PREFIX,
  findVaultRecordWithStatus,
  forgetLocalVaultRecord,
  locatePassphraseRecord,
  persistVaultRecord,
  revokeVaultAddress,
  saveRemoteVaultRecord,
} from "./vault-store.js";
import {
  compactV2PlainBudget,
  decryptVaultRecord,
  deriveVaultAddress,
  deriveVaultOwnerToken,
  encryptVaultV2,
  isV2Record,
  normalizeVaultEmail,
} from "./vault-crypto.js";
import { clearLegacyRevokedNotice, markLegacyRevokedNotice, revokeLegacyVaults } from "./vault-legacy.js";
import { rememberMine } from "./mesh-vault.js";

/** Alias do namespace de identidade (substitui o import duplicado `accountExit`). */
const accountExit = localAccount;

/**
 * Depois de trocar de conta: apaga a conta descartável anterior e deixa um só cartão de perfil para a conta aberta.
 * @param {string|null} prevId routeId da conta que estava aberta
 * @param {string} canonicalId routeId da conta que ficou
 * @param {string} [displayName]
 * @param {string} [avatarUrl]
 */
export function cleanupSupersededIdentity(prevId, canonicalId, displayName, avatarUrl) {
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

/**
 * Pacote de conta utilizável: tem routeId e a semente (ou o par de chaves antigo).
 * @param {object|null} bundle
 * @returns {boolean}
 */
export function isValidAccountBundle(bundle) {
  const hasSeed = typeof bundle?.seed === "string" && bundle.seed.length > 0;
  return Boolean(bundle?.routeId && (hasSeed || (bundle?.publicJwk && bundle?.privateJwk)));
}

const QR_NEEDS_SEED = "Esta conta é de antes da frase de 12 palavras e não cabe num QR. Use \"Sincronizar em outro aparelho\" e mande o link.";

/**
 * Escolhe o maior conteúdo opcional que cabe no orçamento de bytes do QR.
 *
 * @param {object} bundle
 * @param {number} budget
 * @returns {object}
 */
function pickQrPlain(bundle, budget) {
  const base = { routeId: bundle.routeId, seed: bundle.seed };
  /**
   * Diz se o objeto serializado cabe no orçamento de bytes.
   *
   * @param {object} obj
   * @returns {boolean}
   */
  const fits = (obj) => new TextEncoder().encode(JSON.stringify(obj)).length <= budget;
  if (bundle.displayName && fits({ ...base, displayName: bundle.displayName })) return { ...base, displayName: bundle.displayName };
  return fits(base) ? base : null;
}

/**
 * Cofre mínimo para o QR: a conta e a semente, mais o nome se couber em `maxEncodedChars`. O resto (Pix,
 * enriquecimento) vem pelo link ou pelo cofre guardado; conta sem semente não cabe num QR.
 * @param {string} passphrase Senha Soberana
 * @param {number} maxEncodedChars espaço do cofre codificado no link do QR
 * @returns {Promise<{ ok: true, record: object, withName: boolean }|{ ok: false, reason: string }>}
 */
export async function buildQrSyncRecord(passphrase, maxEncodedChars) {
  const clean = String(passphrase || "").trim();
  const opened = await openBundleForVault(clean);
  if (!opened.ok) return opened;
  if (typeof opened.bundle.seed !== "string") return { ok: false, reason: QR_NEEDS_SEED };
  const plain = pickQrPlain(opened.bundle, compactV2PlainBudget(maxEncodedChars));
  if (!plain) return { ok: false, reason: "O endereço deste app é longo demais para o QR. Use o link." };
  return { ok: true, record: await encryptVaultV2(plain, clean), withName: Boolean(plain.displayName) };
}

/** PM-92: o cofre por senha fica guardado fora do aparelho; senha curta cai por tentativa. */
export const VAULT_PASSPHRASE_MIN = 12;

/**
 * Reduz o pacote ao mínimo (rota, semente e nome) para caber em QR ou link.
 *
 * @param {object} bundle
 * @returns {object}
 */
function buildCompactVaultBundle(bundle) {
  if (typeof bundle?.seed !== "string") return bundle;
  const compact = { routeId: bundle.routeId, seed: bundle.seed };
  if (bundle.displayName) compact.displayName = bundle.displayName;
  if (bundle.enrichment && Object.keys(bundle.enrichment).length > 0) compact.enrichment = bundle.enrichment;
  if (bundle.pix) compact.pix = bundle.pix;
  if (bundle.createdAt) compact.createdAt = bundle.createdAt;
  return compact;
}

/**
 * Normaliza o argumento de salvar (e-mail ou opções) em opções.
 *
 * @param {string|object} emailOrOpts
 * @returns {object}
 */
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

/**
 * Deriva endereço e token de dono do cofre a partir da frase e do e-mail.
 *
 * @param {string} pass
 * @param {string} email
 * @returns {Promise<object>}
 */
async function vaultKeys(pass, email) {
  const [address, token] = await Promise.all([deriveVaultAddress(pass, email), deriveVaultOwnerToken(pass, email)]);
  return { address, token };
}

// Cofres que esta gravação substitui: o anterior informado e, quando o novo leva e-mail, o só-senha da senha
// anterior (ADR-032 §6.3). O só-senha entra só se existe, para não marcar endereço que nunca teve cofre.
/**
 * Lista os cofres antigos (frase ou e-mail anteriores) que o novo substitui.
 *
 * @param {object} opts
 * @param {string} cleanPass
 * @param {string} newAddress
 * @returns {Promise<object[]>}
 */
async function supersededVaults(opts, cleanPass, newAddress) {
  const prevPass = opts.prevPassphrase || cleanPass;
  const out = opts.hasPrev ? [await vaultKeys(prevPass, opts.prevEmail)] : [];
  if (opts.email) {
    const passOnly = await vaultKeys(prevPass, "");
    const known = out.some((v) => v.address === passOnly.address);
    if (!known && (await findVaultRecordWithStatus(passOnly.address, VAULT_STORAGE_PREFIX)).record) out.push(passOnly);
  }
  return out.filter((v) => v.address !== newAddress);
}

// Sem servidor que aceitou o cofre novo, o antigo lá fora continua sendo o único: sai só a cópia deste aparelho.
/**
 * Revoga no remoto (ou esquece no local) os cofres substituídos.
 *
 * @param {object} opts
 * @param {string} cleanPass
 * @param {string} newAddress
 * @param {number} remote
 * @returns {Promise<void>}
 */
async function retireSupersededVaults(opts, cleanPass, newAddress, remote) {
  for (const old of await supersededVaults(opts, cleanPass, newAddress)) {
    if (remote > 0) await revokeVaultAddress(old.address, old.token);
    else forgetLocalVaultRecord(old.address);
  }
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
  await retireSupersededVaults(opts, clean, address, remote);
  if (opts.email) rememberMine({ routeId: opened.bundle.routeId, address, record: encrypted });
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

/**
 * Tenta decifrar o registro com a frase; `null` se a frase não serve.
 *
 * @param {object} record
 * @param {string} cleanPassphrase
 * @param {string} [email=""]
 * @returns {Promise<object|null>}
 */
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

/** Cofre aberto em formato antigo: cifra de novo em v2 (se a senha deixa) e revoga o endereço v1. */
async function upgradeLegacyPassphraseVault(clean, legacyKey, normEmail = "") {
  if (legacyKey) revokeLegacyVaults([legacyKey], { saveRemote: saveRemoteVaultRecord });
  const saved = await savePassphraseVault(clean, normEmail);
  if (!saved.ok) markLegacyRevokedNotice();
  return saved.ok;
}

// Gravar com e-mail já revoga o cofre só-senha encontrado (`supersededVaults`).
/**
 * Regrava o cofre só-frase com o e-mail e diz se deu certo.
 *
 * @param {string} clean
 * @param {string} normEmail
 * @returns {Promise<boolean>}
 */
async function upgradePassphraseOnlyVault(clean, normEmail) {
  return (await savePassphraseVault(clean, normEmail)).ok;
}

/**
 * Normaliza os argumentos de restauração (chave, registro direto, e-mail).
 *
 * @param {object|string|null} lookupKeyOverride
 * @param {object|null} directRecord
 * @param {string} email
 * @returns {object}
 */
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

/**
 * Conclui a migração do cofre para o formato atual; `false` se não há o que migrar.
 *
 * @param {string} clean
 * @param {object} located
 * @param {string} normEmail
 * @returns {Promise<boolean>}
 */
async function finalizeVaultUpgrade(clean, located, normEmail) {
  if (!isV2Record(located.record)) return upgradeLegacyPassphraseVault(clean, located.legacyKey, normEmail);
  if (located.legacyV2 && normEmail) return upgradePassphraseOnlyVault(clean, normEmail);
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
  if (!located.record) return { ok: false, notFound: true, noServer: located.reachable === 0, reason: "Nenhum cofre encontrado para esta senha ou chave." };
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
