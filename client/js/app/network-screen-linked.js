/** @file Linked social accounts, OAuth logins, and replication setup handlers. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as socialLogin from "../social-login.js";
import * as linkedAccounts from "../linked-accounts.js";
import { escapeHtml } from "../render/util.js";
import { getActiveUser, makeShellProps } from "./context.js";

let loginAvailability = { bsky: true };

/** Disponibilidade de login por rede; nas que têm login, oferece "ou digitar @usuário" como alternativa. */
async function revealSocialLoginButtons() {
  loginAvailability = await socialLogin.availableLoginProviders().catch(() => ({ bsky: true }));
  document.querySelectorAll(".btn-link-manual").forEach((alt) => {
    alt.hidden = !loginAvailability[alt.dataset.netId];
  });
}

function openManualLink(netId) {
  const panel = document.querySelector(`.link-manual[data-net-id="${netId}"]`);
  if (!panel) return;
  panel.hidden = false;
  panel.querySelector(".input-net-handle")?.focus();
}

function saveLoginResult(r) {
  linkedAccounts.saveLinkedAccount(r.netId, {
    handle: r.handle || "",
    did: r.did || "",
    accountId: r.id || "",
    displayName: r.name || "",
    enabled: true,
    verified: true,
    via: "oauth",
  });
  linkedAccounts.setAutoReplicationEnabled(true);
}

async function finishSocialLogin(run) {
  try {
    const r = await run();
    if (!r) return;
    saveLoginResult(r);
    share.showToast(`🔗🟢 ${r.handle ? `@${r.handle}` : r.name || r.netId}`);
    showLinkedAccounts();
  } catch (err) {
    share.showToast(err?.message || "Não foi possível conectar.", "error");
  }
}

/** Um botão "Conectar" por rede: login quando disponível; senão abre o campo do @usuário. */
function bindSocialLoginButtons() {
  document.querySelectorAll(".btn-link-connect").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const netId = btn.dataset.netId;
      if (!loginAvailability[netId]) return openManualLink(netId);
      btn.disabled = true;
      void finishSocialLogin(() => socialLogin.startSocialLogin(netId)).finally(() => {
        btn.disabled = false;
      });
    });
  });
  document.querySelectorAll(".btn-link-manual").forEach((alt) => {
    if (alt.dataset.wired) return;
    alt.dataset.wired = "1";
    alt.addEventListener("click", () => openManualLink(alt.dataset.netId));
  });
}

function resolveNetworkFormHandle(box, form, netId) {
  const boxHandle = box?.querySelector(".input-net-handle")?.value?.trim();
  if (boxHandle) return boxHandle;
  const formHandle = form?.querySelector(".input-net-handle")?.value?.trim();
  if (formHandle) return formHandle;
  return linkedAccounts.getSuggestedHandle(netId);
}

function bindOneClickConnectButtons(onRefresh) {
  document.querySelectorAll(".btn-one-click-connect").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const netId = btn.dataset.netId;
      if (!netId) return;
      const box = btn.closest(".network-connect-box") || btn.closest(".linked-network-card");
      const input = box?.querySelector(".input-net-handle");
      const res = linkedAccounts.connectWithOneClick(netId, input?.value || "");
      if (!res.ok) {
        share.showToast(res.error, "error");
        input?.focus();
        return;
      }
      linkedAccounts.setAutoReplicationEnabled(true);
      share.showToast(`@${res.handle} vinculado. Confira o perfil que abrimos e toque em “É minha conta”.`);
      if (onRefresh) onRefresh();
    });
  });
}

function bindSaveHandleQuickButtons(onRefresh) {
  document.querySelectorAll(".btn-save-handle-quick").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const netId = btn.dataset.netId;
      if (!netId) return;
      const box = btn.closest(".network-connect-box") || btn.closest(".linked-network-card");
      const v = linkedAccounts.validateHandle(netId, box?.querySelector(".input-net-handle")?.value || "");
      if (!v.ok) {
        share.showToast(v.error, "warning");
        return;
      }
      linkedAccounts.saveLinkedAccount(netId, { handle: v.handle, enabled: true, verified: false });
      linkedAccounts.setAutoReplicationEnabled(true);
      share.showToast(`@${v.handle} vinculado (não verificado).`);
      if (onRefresh) onRefresh();
    });
  });
}

function bindFormLinkNetwork(onRefresh) {
  document.querySelectorAll(".form-link-network").forEach((form) => {
    if (form.dataset.wired) return;
    form.dataset.wired = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const netId = form.dataset.netId;
      const box = form.closest(".network-connect-box") || form.closest(".linked-network-card");
      const v = linkedAccounts.validateHandle(netId, resolveNetworkFormHandle(box, form, netId));
      if (!v.ok) {
        share.showToast(v.error, "warning");
        return;
      }
      const handle = v.handle;
      const webhook = form.querySelector(".input-net-webhook")?.value?.trim() || "";
      const appPassword = form.querySelector(".input-net-app-password")?.value?.trim() || "";
      linkedAccounts.saveLinkedAccount(netId, { handle, webhook, appPassword, enabled: true });
      linkedAccounts.setAutoReplicationEnabled(true);
      share.showToast(`Credenciais de @${handle.replace(/^@/, "")} salvas com sucesso! 🔗`);
      if (onRefresh) onRefresh();
    });
  });
}

function bindUnlinkNetworkButtons(onRefresh) {
  document.querySelectorAll(".btn-unlink-network").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (!btn.dataset.netId) return;
      linkedAccounts.removeLinkedAccount(btn.dataset.netId);
      share.showToast("Rede desvinculada.");
      if (onRefresh) onRefresh();
    });
  });
}

function bindConfirmNetworkButtons(onRefresh) {
  document.querySelectorAll(".btn-confirm-network").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (linkedAccounts.confirmLinkedAccount(btn.dataset.netId)) {
        share.showToast("Conta confirmada por você.");
      }
      if (onRefresh) onRefresh();
    });
  });
}

function bindLinkedAccountFormsAndButtons(onRefresh) {
  bindSocialLoginButtons();
  bindConfirmNetworkButtons(onRefresh);
  bindOneClickConnectButtons(onRefresh);
  bindSaveHandleQuickButtons(onRefresh);
  bindFormLinkNetwork(onRefresh);
  bindUnlinkNetworkButtons(onRefresh);
}

function bindLinkedAccountCheckboxes() {
  document.querySelectorAll(".chk-network-replicate").forEach((chk) => {
    if (chk.dataset.wired) return;
    chk.dataset.wired = "1";
    chk.addEventListener("change", () => {
      const netId = chk.dataset.netId;
      const accounts = linkedAccounts.loadLinkedAccounts();
      if (netId && accounts[netId]) {
        linkedAccounts.saveLinkedAccount(netId, { ...accounts[netId], enabled: chk.checked });
        share.showToast(chk.checked ? "Replicação ativada para este canal." : "Replicação pausada para este canal.");
      }
    });
  });
}

function displayTestFeedback(netId, res) {
  const fb = document.getElementById(`test-feedback-${netId}`);
  if (!fb) return;
  fb.style.display = "block";
  const tone = res.ok ? "#16a34a" : res.state === "unverified" ? "#b07a00" : "#dc2626";
  fb.style.background = res.ok ? "rgba(22,163,74,0.12)" : res.state === "unverified" ? "rgba(231,194,107,0.12)" : "rgba(220,38,38,0.12)";
  fb.style.color = tone;
  fb.style.border = `1px solid ${tone}`;
  const link = res.profileUrl
    ? ` <a href="${res.profileUrl}" target="_blank" rel="noopener noreferrer" style="font-weight:bold; text-decoration:underline; color:inherit; margin-left:4px;">Ver perfil ↗</a>`
    : "";
  fb.innerHTML = `<span>${escapeHtml(res.message)}</span>${link}`;
}

function bindLinkedAccountTestButtons() {
  document.querySelectorAll(".btn-test-network").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const netId = btn.dataset.netId;
      if (!netId) return;
      btn.disabled = true;
      btn.textContent = "⏳ Testando…";
      try {
        const res = await linkedAccounts.testLinkedAccount(netId);
        displayTestFeedback(netId, res);
        share.showToast(res.ok ? res.message : res.state === "unverified" ? "Não verificado — confira o perfil." : res.message, res.ok || res.state === "unverified" ? "info" : "error");
      } catch (err) {
        share.showToast(`Erro ao testar: ${err?.message}`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "🧪 Testar se conectou";
      }
    });
  });
}

/**
 * Monta contas vinculadas OAuth.
 *
 * @returns {Promise<void>}
 */
export async function showLinkedAccounts() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Redes Vinculadas"));
  render.renderLinkedAccountsPage(main);
  bindLinkedAccountsUi(() => showLinkedAccounts());
  void revealSocialLoginButtons();
  const cb = socialLogin.takePendingCallback();
  if (cb) void finishSocialLogin(() => socialLogin.completeSocialLogin(cb));
}

/**
 * Liga ações das contas vinculadas.
 *
 * @param {Function} [onRefresh] Callback opcional para atualizar tela após alterações.
 * @returns {void}
 */
export function bindLinkedAccountsUi(onRefresh) {
  const chkMaster = document.getElementById("chk-auto-replicate-master");
  if (chkMaster && !chkMaster.dataset.wired) {
    chkMaster.dataset.wired = "1";
    chkMaster.addEventListener("change", () => {
      linkedAccounts.setAutoReplicationEnabled(chkMaster.checked);
      share.showToast(chkMaster.checked ? "Auto-replicação ativada! ⚡" : "Auto-replicação desativada.");
    });
  }

  const btnGeneral = document.getElementById("btn-save-general-webhook");
  if (btnGeneral && !btnGeneral.dataset.wired) {
    btnGeneral.dataset.wired = "1";
    btnGeneral.addEventListener("click", () => {
      const val = document.getElementById("input-general-webhook")?.value?.trim();
      linkedAccounts.setGeneralWebhookUrl(val);
      share.showToast(val ? "Webhook unificado salvo!" : "Webhook removido.");
    });
  }

  document.getElementById("btn-open-oauth-from-linked")?.addEventListener("click", () => {
    void import("./onboarding.js").then(({ openOAuthEnrichModal }) => {
      openOAuthEnrichModal({ mode: "import", onComplete: () => onRefresh && onRefresh() });
    });
  });

  bindLinkedAccountFormsAndButtons(onRefresh);
  bindLinkedAccountCheckboxes();
  bindLinkedAccountTestButtons();
}
