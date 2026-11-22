/**
 * @file Submódulo de configurações e ações sociais do perfil (Pix, GitHub, README, moderação, OAuth).
 * @module app/profile-screen-settings
 */

import * as mod from "../moderation.js";
import * as share from "../share.js";
import { openQrUrlSheet } from "../qr-url.js";
import * as localAccount from "../identity/index.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as meshProfile from "../mesh-profile.js";
import * as centralMemory from "../central-memory.js";
import { openOAuthEnrichModal } from "./onboarding.js";
import { syncIdentity } from "./screens-network.js";
import * as voxels from "../voxels.js";
import { invalidateProfileCache } from "./profile-screen-data.js";

/**
 * Propaga alterações da identidade ativa na rede e malha local.
 *
 * @returns {void}
 */
export function broadcastActiveIdentityChanges() {
  void syncIdentity();
  void meshProfile.syncMeshProfileCard();
  void centralMemory.syncWithCentralMemory();
}

function handlePixFormSubmit(rawVal, feedback, address, activeTab, onReload) {
  if (!rawVal) {
    invalidateProfileCache();
    localAccount.clearPixKey();
    share.showToast("Chave Pix removida do perfil.");
    if (onReload) onReload(address, activeTab);
    return;
  }
  const validation = pixKeyHelper.validatePixKey(rawVal);
  if (!validation.valid) {
    if (feedback) feedback.innerHTML = `<span style="color:var(--danger);">${validation.error}</span>`;
    return;
  }
  invalidateProfileCache();
  localAccount.setPixKey(validation.normalized);
  share.showToast("Chave Pix salva no seu perfil local!");
  if (onReload) onReload(address, activeTab);
}

/**
 * Associa eventos de formulário e exclusão de chave Pix.
 *
 * @param {string} address Endereço alvo.
 * @param {string} activeTab Aba ativa.
 * @param {boolean} isSelf Se é a própria conta.
 * @param {(addr?: string, tab?: string) => void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindPixButtons(address, activeTab, isSelf, onReload) {
  const formPixKey = document.getElementById("form-pix-key");
  if (formPixKey && isSelf) {
    formPixKey.addEventListener("submit", (e) => {
      e.preventDefault();
      const rawVal = document.getElementById("input-pix-key")?.value.trim() || "";
      const feedback = document.getElementById("pix-feedback");
      handlePixFormSubmit(rawVal, feedback, address, activeTab, onReload);
    });
  }

  const btnClearPix = document.getElementById("btn-clear-pix");
  if (btnClearPix && isSelf) {
    btnClearPix.addEventListener("click", () => {
      invalidateProfileCache();
      localAccount.clearPixKey();
      share.showToast("Chave Pix removida.");
      if (onReload) onReload(address, activeTab);
    });
  }
}

/**
 * Associa eventos de formulário e remoção de handle GitHub.
 *
 * @param {string} address Endereço alvo.
 * @param {string} activeTab Aba ativa.
 * @param {boolean} isSelf Se é a própria conta.
 * @param {(addr?: string, tab?: string) => void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindGithubButtons(address, activeTab, isSelf, onReload) {
  const formGithub = document.getElementById("form-github-handle");
  if (formGithub && isSelf) {
    formGithub.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("input-github-handle")?.value.trim() || "";
      invalidateProfileCache();
      social.setLocalGithubHandle(val);
      share.showToast(val ? "Perfil do GitHub salvo!" : "GitHub removido.");
      if (onReload) onReload(address, activeTab);
    });
  }

  const btnClearGithub = document.getElementById("btn-clear-github");
  if (btnClearGithub && isSelf) {
    btnClearGithub.addEventListener("click", () => {
      invalidateProfileCache();
      social.setLocalGithubHandle("");
      share.showToast("GitHub removido.");
      if (onReload) onReload(address, activeTab);
    });
  }
}

function bindReadmeToggle(btnToggleReadme, formReadme, readmeView) {
  btnToggleReadme.addEventListener("click", () => {
    const isHidden = formReadme.style.display === "none";
    formReadme.style.display = isHidden ? "block" : "none";
    if (readmeView) readmeView.style.display = isHidden ? "none" : "block";
  });
}

/**
 * Associa eventos de edição e salvamento do README.md de perfil.
 *
 * @param {string} address Endereço alvo.
 * @param {string} activeTab Aba ativa.
 * @param {boolean} isSelf Se é a própria conta.
 * @param {(addr?: string, tab?: string) => void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindReadmeButtons(address, activeTab, isSelf, onReload) {
  const btnToggleReadme = document.getElementById("btn-toggle-edit-readme");
  const formReadme = document.getElementById("form-edit-readme");
  const readmeView = document.getElementById("readme-view");
  if (btnToggleReadme && formReadme) {
    bindReadmeToggle(btnToggleReadme, formReadme, readmeView);
  }

  const btnCancelReadme = document.getElementById("btn-cancel-readme");
  if (btnCancelReadme && formReadme) {
    btnCancelReadme.addEventListener("click", () => {
      formReadme.style.display = "none";
      if (readmeView) readmeView.style.display = "block";
    });
  }

  if (formReadme && isSelf) {
    formReadme.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("input-profile-readme")?.value || "";
      invalidateProfileCache();
      social.setLocalReadme(val);
      share.showToast("README.md atualizado!");
      if (onReload) onReload(address, activeTab);
    });
  }
}

function bindQrShareButtons(address) {
  document.querySelectorAll("[data-qr-share='connect'], #btn-qr-connect-link").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.dataset.qrId || address;
      openQrUrlSheet(share.connectShareUrl(targetId));
    });
  });
}

/**
 * Associa botões de compartilhamento, cópia de rota e links de convite.
 *
 * @param {string} address Endereço alvo.
 * @returns {void}
 */
export function bindSharingAndClipboardButtons(address) {
  const btnCopyRoute = document.getElementById("btn-copy-author-route");
  if (btnCopyRoute) {
    btnCopyRoute.addEventListener("click", (e) => {
      const routeToCopy = e.currentTarget.dataset.route || address;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(routeToCopy);
        share.showToast("ID de rota copiado!");
      }
    });
  }

  const btnCopyDmLink = document.getElementById("btn-copy-my-dm-link");
  if (btnCopyDmLink) {
    btnCopyDmLink.addEventListener("click", () => {
      const link = `${window.location.origin}${window.location.pathname}#/dm/${encodeURIComponent(address)}`;
      navigator.clipboard.writeText(link);
      share.showToast("Link copiado para a área de transferência!");
    });
  }

  document.getElementById("btn-copy-connect-link")?.addEventListener("click", () => {
    void share.shareConnect({ routeId: address, displayName: localAccount.getDisplayName(), invite: true });
  });

  bindQrShareButtons(address);
}

function bindDisplayNameForm(address, onReload) {
  document.getElementById("form-display-name")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("input-display-name")?.value.trim();
    invalidateProfileCache();
    localAccount.setDisplayName(name);
    share.showToast("Nome local atualizado!");
    broadcastActiveIdentityChanges();
    if (onReload) onReload(address);
  });
}

/**
 * Associa formulário de nome de exibição, alternador de malha e modal de OAuth.
 *
 * @param {string} address Endereço alvo.
 * @param {string} activeTab Aba ativa.
 * @param {(addr?: string, tab?: string) => void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindDisplayNameAndOAuthButtons(address, activeTab, onReload) {
  bindDisplayNameForm(address, onReload);
  document.getElementById("profile-mesh-discoverable")?.addEventListener("change", (e) => {
    localAccount.setMeshDiscoverable(Boolean(e.target.checked));
    void meshProfile.syncMeshProfileCard().then(() => {
      void centralMemory.syncWithCentralMemory();
      share.showToast(e.target.checked ? "Cartão publicado na malha." : "Cartão revogado na malha.");
      if (onReload) onReload(address, activeTab);
    });
  });
  document.getElementById("btn-open-oauth-modal")?.addEventListener("click", () => {
    openOAuthEnrichModal({
      mode: "import",
      onComplete: () => {
        broadcastActiveIdentityChanges();
        if (onReload) onReload(address, activeTab);
      },
    });
  });
  document.getElementById("btn-clear-oauth-enrich")?.addEventListener("click", () => {
    localAccount.clearProfileEnrichment();
    share.showToast("Nome/foto importados removidos.");
    broadcastActiveIdentityChanges();
    if (onReload) onReload(address, activeTab);
  });
}

function bindBlockToggle(btnToggleBlock, address, activeTab, onReload) {
  btnToggleBlock.addEventListener("click", () => {
    const route = btnToggleBlock.dataset.route || address;
    if (mod.isUserBlocked(route)) {
      mod.unblockUser(route);
      share.showToast("Autor desbloqueado.");
    } else {
      mod.blockUser(route);
      share.showToast("Autor bloqueado (posts ocultados e fofocas descartadas).");
    }
    if (onReload) onReload(address, activeTab);
  });
}

function bindMuteToggle(btnToggleMute, address, activeTab, onReload) {
  btnToggleMute.addEventListener("click", () => {
    const route = btnToggleMute.dataset.route || address;
    if (mod.isUserMuted(route)) {
      mod.unmuteUser(route);
      share.showToast("Autor desilenciado.");
    } else {
      mod.muteUser(route);
      share.showToast("Autor silenciado no feed.");
    }
    if (onReload) onReload(address, activeTab);
  });
}

/**
 * Associa botões de bloquear e silenciar autor.
 *
 * @param {string} address Endereço alvo.
 * @param {string} activeTab Aba ativa.
 * @param {boolean} isSelf Se é a própria conta.
 * @param {(addr?: string, tab?: string) => void} [onReload] Callback de recarga.
 * @returns {void}
 */
export function bindBlockAndMuteButtons(address, activeTab, isSelf, onReload) {
  if (isSelf) return;
  const btnToggleBlock = document.getElementById("btn-toggle-block");
  if (btnToggleBlock) bindBlockToggle(btnToggleBlock, address, activeTab, onReload);
  const btnToggleMute = document.getElementById("btn-toggle-mute");
  if (btnToggleMute) bindMuteToggle(btnToggleMute, address, activeTab, onReload);
}

/**
 * Associa exportação de passaporte cívico de Voxels.
 *
 * @param {string} address Endereço alvo.
 * @param {string} activeTab Aba ativa.
 * @param {boolean} isSelf Se é a própria conta.
 * @returns {void}
 */
export function bindVoxelButtons(address, activeTab, isSelf) {
  if (activeTab !== "voxels" || !isSelf) return;
  const btn = document.getElementById("btn-export-voxel-passport");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const receipts = voxels.loadVoxelReceipts(address);
      const out = await voxels.exportSignedVoxelPassport(address, receipts, [], localAccount.signPayload);
      const blob = new Blob([JSON.stringify(out.signedPassport, null, 2)], { type: "application/json" });
      share.downloadBlob(blob, out.filename);
      share.showToast("Passaporte Cívico exportado com sucesso! Guarde seu arquivo.");
    } catch (err) {
      share.showToast(`Erro ao exportar passaporte: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });
}
