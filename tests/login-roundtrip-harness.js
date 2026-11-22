/**
 * @file Arnês LT-10 — matriz (como criou × como volta): mesmo `routeId` e assinatura fixa verificável.
 *
 * Não suportados (sem API de volta hoje):
 * - oauth_enrich × * — login social só enriquece perfil; não é chave nem cofre (vault-v2 §PM-90).
 * - local × vault_local | vault_sync | vault_kit | mesh — conta sem cofre salvo não abre por senha.
 * - local × guardians — pedaços não foram distribuídos na criação.
 * - vault_pass | vault_email | email_kit | vault_mesh × backup_plain — após cofre, chaves travadas; export simples exige senha (use wrapped).
 * - vault_pass | vault_email × guardians — pedaços Shamir não fazem parte do cofre por senha.
 *
 * Coberto em outro arquivo (não repetido neste harness):
 * - vault_mesh × mesh (espera 24 h ou aprovação) — `mesh-vault-flow.test.js`.
 */
import assert from "node:assert/strict";
import * as localAccount from "../client/js/identity/local-account.js";
import * as accountPhrase from "../client/js/identity/account-phrase.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import { exportAccountBundle, importAccountBundle } from "../client/js/identity/account-backup.js";
import * as vaultCrypto from "../client/js/vault/vault-crypto.js";
import * as emailKit from "../client/js/email-kit.js";
import { savePassphraseVault, restoreFromPassphraseVault } from "../client/js/vault/passphrase-vault.js";
import {
  extendMeshGuardCreators,
  guardiansTwoReturn,
  switchMeshDevice,
} from "./login-roundtrip-mesh-guard.js";

export const PASS = "minha senha bem longa soberana";
export const EMAIL = "ana@exemplo.com";
export const FIXED_PAYLOAD = {
  type: "topic",
  communityId: "lt10",
  title: "LT-10 matriz",
  body: "payload fixo de ida e volta",
};

/** Garante `sessionStorage` para fluxos de guardiões (o setup de testes só mocka `localStorage`). */
export function ensureSessionStorage() {
  if (globalThis.sessionStorage) return;
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

function stubOfflineFetch() {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  return () => {
    globalThis.fetch = orig;
  };
}

async function wipeAccountKeys() {
  await localAccount.wipeLocalAccount();
  keyLock.__resetKeyLockForTests();
}

async function wipeAll() {
  await wipeAccountKeys();
  localStorage.clear();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

/** Captura `routeId` e assinatura canônica do payload fixo LT-10. */
export async function captureSignature() {
  const routeId = await localAccount.getRouteId();
  const signed = await localAccount.signPayload(FIXED_PAYLOAD);
  return { routeId, signed };
}

/** Após volta, confere `routeId`, assinatura antiga e nova sobre o mesmo payload. */
export async function assertRoundTrip(routeId, signed) {
  assert.equal(await localAccount.getRouteId(), routeId);
  assert.equal(await localAccount.verifyPayload(signed), true, "assinatura capturada antes do wipe");
  const resigned = await localAccount.signPayload(FIXED_PAYLOAD);
  assert.equal(resigned.author, routeId);
  assert.equal(await localAccount.verifyPayload(resigned), true, "nova assinatura com a chave restaurada");
}

function buildKeyBackupReturns() {
  return {
    phrase: async () => {
      const needs = await accountPhrase.phraseNeedsPassphrase();
      const { words } = await accountPhrase.getAccountPhrase(needs ? PASS : undefined);
      await wipeAll();
      assert.equal((await accountPhrase.restoreFromPhrase(words.join(" "))).ok, true);
    },
    backup_plain: async () => {
      const bundle = await exportAccountBundle();
      await wipeAll();
      await importAccountBundle(bundle);
    },
    backup_wrapped: async () => {
      const bundle = await exportAccountBundle(PASS);
      await wipeAll();
      await importAccountBundle(bundle, PASS);
    },
  };
}

function buildPassphraseVaultReturns() {
  return {
    vault_local_pass: async () => {
      await wipeAccountKeys();
      const res = await restoreFromPassphraseVault(PASS);
      assert.equal(res.ok, true);
      return res.routeId;
    },
    vault_local_email: async (art) => {
      await wipeAccountKeys();
      const res = await restoreFromPassphraseVault(PASS, { email: art.email || EMAIL });
      assert.equal(res.ok, true);
      return res.routeId;
    },
    vault_sync: async (art) => {
      await wipeAll();
      const res = await restoreFromPassphraseVault(
        PASS,
        null,
        vaultCrypto.decodeVaultBundleFromUrl(art.encoded),
        art.email || "",
      );
      assert.equal(res.ok, true);
      return res.routeId;
    },
  };
}

function buildEmailKitReturns() {
  return {
    vault_kit_url: async (art) => {
      await wipeAll();
      const res = await emailKit.restoreAccountFromInputs({
        email: art.email || EMAIL,
        pass: PASS,
        kitText: art.syncUrl,
      });
      assert.equal(res.ok, true);
      return res.routeId;
    },
    vault_kit_code: async (art) => {
      await wipeAll();
      const res = await emailKit.restoreAccountFromInputs({
        email: art.email || EMAIL,
        pass: PASS,
        kitText: art.kitCode,
      });
      assert.equal(res.ok, true);
      return res.routeId;
    },
  };
}

function buildReturns() {
  const returns = {
    ...buildKeyBackupReturns(),
    ...buildPassphraseVaultReturns(),
    ...buildEmailKitReturns(),
  };
  return guardiansTwoReturn(returns);
}

async function createVaultPassAccount() {
  await wipeAll();
  const restoreFetch = stubOfflineFetch();
  try {
    await localAccount.ensureLocalAccount();
    const saved = await savePassphraseVault(PASS);
    assert.equal(saved.ok, true);
    return { encoded: vaultCrypto.encodeVaultBundleForUrl(saved.bundle), saved };
  } finally {
    restoreFetch();
  }
}

async function createVaultEmailAccount() {
  await wipeAll();
  const restoreFetch = stubOfflineFetch();
  try {
    await localAccount.ensureLocalAccount();
    const saved = await savePassphraseVault(PASS, EMAIL);
    assert.equal(saved.ok, true);
    return {
      encoded: vaultCrypto.encodeVaultBundleForUrl(saved.syncBundle || saved.bundle),
      email: EMAIL,
    };
  } finally {
    restoreFetch();
  }
}

async function createEmailKitAccount() {
  await wipeAll();
  const restoreFetch = stubOfflineFetch();
  try {
    const created = await emailKit.createEmailAccountKit({
      rawName: "Bia",
      email: EMAIL,
      pass: PASS,
      includePhrase: false,
      draftState: { email: "", pass: "" },
    });
    assert.equal(created.ok, true);
    const b = decodeURIComponent(created.kit.syncUrl.split("#/sync?b=")[1]);
    return {
      email: EMAIL,
      syncUrl: created.kit.syncUrl,
      kitCode: created.kit.kitCode,
      encoded: vaultCrypto.encodeVaultBundleForUrl(vaultCrypto.decodeVaultBundleFromUrl(b)),
    };
  } finally {
    restoreFetch();
  }
}

async function setupCreators() {
  const creators = {
    local_name: async () => {
      await wipeAll();
      await localAccount.ensureLocalAccount();
      return {};
    },
    vault_pass: createVaultPassAccount,
    vault_email: createVaultEmailAccount,
    email_kit: createEmailKitAccount,
  };
  return extendMeshGuardCreators(creators, { wipeAll, ensureSessionStorage, PASS, EMAIL });
}

export const COVERED_KEYS = [
  ["local_name", "phrase"],
  ["local_name", "backup_plain"],
  ["local_name", "backup_wrapped"],
  ["vault_pass", "phrase"],
  ["vault_pass", "backup_wrapped"],
  ["vault_email", "phrase"],
  ["vault_email", "backup_wrapped"],
  ["email_kit", "phrase"],
  ["vault_mesh", "phrase"],
  ["guardians", "guardians_two"],
  ["guardians", "phrase"],
  ["guardians", "backup_plain"],
];

export const COVERED_VAULT = [
  ["vault_pass", "vault_local_pass"],
  ["vault_pass", "vault_sync"],
  ["vault_email", "vault_local_email"],
  ["vault_email", "vault_sync"],
  ["email_kit", "vault_kit_url"],
  ["email_kit", "vault_kit_code"],
  ["email_kit", "vault_sync"],
  ["vault_mesh", "vault_sync"],
];

const returns = buildReturns();
const creatorsCache = setupCreators();

async function captureForArt(createId, art) {
  if (art.owner && (createId === "vault_mesh" || createId === "guardians")) {
    if (art.w) return switchMeshDevice(art.w, art.owner, captureSignature);
    await localAccount.switchActiveAccount(art.owner);
    return captureSignature();
  }
  return captureSignature();
}

/**
 * Registra testes LT-10 para a lista de pares `(criar × voltar)`.
 * @param {typeof import("node:test")["test"]} t `test` do `node:test`
 * @param {Array<[string, string]>} covered Pares cobertos
 */
export function registerLt10Tests(t, covered) {
  for (const [createId, returnId] of covered) {
    t(`LT-10: ${createId} → ${returnId}`, async () => {
      const creators = await creatorsCache;
      const art = await creators[createId]();
      const cap = await captureForArt(createId, art);
      await returns[returnId](art);
      await assertRoundTrip(cap.routeId, cap.signed);
    });
  }
}