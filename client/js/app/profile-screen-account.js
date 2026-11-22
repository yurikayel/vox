/**
 * @file Submódulo de contas do cofre, exportação/importação de soberania e wipe local.
 * @module app/profile-screen-account
 */

import * as share from "../share.js";
import * as localAccount from "../identity/index.js";
import { KIND_WRAPPED, exportAccountBundle, importAccountBundle, peekBackupKind } from "../identity/index.js";
import { isInboxBackupText, restoreInboxBackup } from "../identity/index.js";
import * as profileDirectory from "../profile-directory.js";
import { describeWipeOutcome, wipeLocalDevice } from "./onboarding.js";
import { bindProfileVaultSync } from "./profile-vault-sync.js";
import { invalidateProfileCache } from "./profile-screen-data.js";
import { broadcastActiveIdentityChanges } from "./profile-screen-settings.js";

function bindCreateVaultAccount(isSelf, onReload) {
  const formCreateVault = document.getElementById("form-create-vault-account");
  if (!formCreateVault || !isSelf) return;
  formCreateVault.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("input-new-account-name")?.value.trim() || "";
    if (!name) return;
    try {
      const newAcc = await localAccount.createAdditionalAccount({ displayName: name });
      profileDirectory.setProfileCard(newAcc.routeId, { name, discoverable: true, updatedAt: Date.now() });
      broadcastActiveIdentityChanges();
      share.showToast(`Nova conta "${name}" criada e ativada!`);
      if (onReload) await onReload(newAcc.routeId, "about");
    } catch (err) {
      share.showToast(`Erro ao criar conta: ${err.message}`, "error");
    }
  });
}

function bindRemoveVaultAccount(address, onReload) {
  document.querySelectorAll(".btn-remove-vault-account").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const targetRoute = btn.dataset.route;
      if (!targetRoute) return;
      if (confirm("Remover esta conta do cofre local deste aparelho?")) {
        localAccount.removeVaultAccount(targetRoute);
        share.showToast("Conta removida do cofre.");
        if (onReload) onReload(address, "about");
      }
    });
  });
}

function bindSwitchAndRemoveVaultAccounts(address, onReload) {
  document.querySelectorAll(".btn-switch-vault-account").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const targetRoute = btn.dataset.route;
      if (!targetRoute) return;
      try {
        const ok = await localAccount.switchActiveAccount(targetRoute);
        if (ok) {
          invalidateProfileCache();
          broadcastActiveIdentityChanges();
          share.showToast("Identidade alternada com sucesso!");
          if (onReload) await onReload(targetRoute, "about");
        } else {
          share.showToast("Falha ao alternar conta.", "error");
        }
      } catch (err) {
        share.showToast(`Erro ao alternar: ${err.message}`, "error");
      }
    });
  });

  bindRemoveVaultAccount(address, onReload);
}

/**
 * Associa eventos de criação, alternância e remoção de contas do cofre local.
 *
 * @param {string} address Endereço ativo.
 * @param {boolean} isSelf Se é a própria conta.
 * @param {(addr?: string, tab?: string) => Promise<void>|void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindVaultAccountButtons(address, isSelf, onReload) {
  bindCreateVaultAccount(isSelf, onReload);
  bindSwitchAndRemoveVaultAccounts(address, onReload);
}

function readSovereigntyPassphrase() {
  return document.getElementById("input-sovereignty-passphrase")?.value || "";
}

function downloadSovereigntyFile(jsonStr, routeId) {
  share.downloadBlob(new Blob([jsonStr], { type: "application/json" }), `vox-soberania-${routeId || "identity"}.voxid`);
}

async function resolveImportPassphrase(text, fieldValue) {
  if (peekBackupKind(text) !== KIND_WRAPPED) return fieldValue;
  if (String(fieldValue || "").trim()) return fieldValue;
  return window.prompt("Este .voxid está cifrado. Senha:") || "";
}

function bindSovereigntyExport() {
  const btn = document.getElementById("btn-export-account");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    try {
      const jsonStr = await exportAccountBundle(readSovereigntyPassphrase(), { asFile: true });
      downloadSovereigntyFile(jsonStr, JSON.parse(jsonStr).routeId);
      share.showToast("Arquivo de soberania exportado — guarde offline.");
    } catch (err) {
      share.showToast(`Erro ao exportar backup: ${err.message}`, "error");
    }
  });
}

async function restoreSovereigntyFile(file, activeTab, onReload) {
  const text = await file.text();
  const secret = await resolveImportPassphrase(text, readSovereigntyPassphrase());
  const ok = await importAccountBundle(text, secret, { asFile: true });
  if (!ok) {
    share.showToast("Falha ao validar chaves do backup.", "error");
    return;
  }
  share.showToast("Identidade restaurada com sucesso!");
  if (onReload) onReload(null, activeTab);
}

async function restoreBackupFiles(files, activeTab, onReload) {
  const texts = await Promise.all(files.map((f) => f.text()));
  const backups = texts.filter(isInboxBackupText).length;
  if (backups === 0 && files.length === 1) return restoreSovereigntyFile(files[0], activeTab, onReload);
  if (backups !== files.length) throw new Error("Escolha um .voxid sozinho ou só backups do e-mail (.txt).");
  const secret = readSovereigntyPassphrase() || window.prompt("Senha Soberana dos backups:") || "";
  const ordered = texts.sort((a, b) => JSON.parse(a).to - JSON.parse(b).to);
  for (const text of ordered) await restoreInboxBackup(text, secret);
  share.showToast(`Conta restaurada de ${ordered.length} backup(s) do e-mail.`);
  if (onReload) onReload(null, activeTab);
}

function bindSovereigntyImport(activeTab, onReload) {
  const input = document.getElementById("file-import-account");
  if (!input) return;
  input.addEventListener("change", async () => {
    const files = [...(input.files || [])];
    if (!files.length) return;
    try {
      await restoreBackupFiles(files, activeTab, onReload);
    } catch (err) {
      share.showToast(`Erro ao importar: ${err.message}`, "error");
    }
  });
}

/**
 * Associa exportação e importação de arquivo de soberania e sincronização de cofre.
 *
 * @param {boolean} isSelf Se é a própria conta.
 * @param {string} activeTab Aba ativa.
 * @param {(addr?: string, tab?: string) => void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindSovereigntyBackup(isSelf, activeTab, onReload) {
  if (!isSelf) return;
  bindSovereigntyExport();
  bindSovereigntyImport(activeTab, onReload);
  bindProfileVaultSync();
}

function clearPassphraseField() {
  const el = document.getElementById("input-sovereignty-passphrase");
  if (el) el.value = "";
}

async function runLocalWipe(activeTab, onReload) {
  if (!localAccount.confirmLocalWipe()) return;
  clearPassphraseField();
  const outcome = await wipeLocalDevice();
  const { message, kind } = describeWipeOutcome(outcome);
  share.showToast(message, kind);
  if (onReload) await onReload(null, activeTab);
}

/**
 * Associa botão de limpeza/wipe dos dados locais do aparelho.
 *
 * @param {boolean} isSelf Se é a própria conta.
 * @param {string} activeTab Aba ativa.
 * @param {(addr?: string, tab?: string) => Promise<void>|void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindLocalWipe(isSelf, activeTab, onReload) {
  const btn = document.getElementById("btn-wipe-local-account");
  if (!isSelf || !btn) return;
  btn.addEventListener("click", () => {
    void runLocalWipe(activeTab, onReload);
  });
}
