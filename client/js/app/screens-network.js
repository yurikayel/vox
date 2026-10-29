/** @file Network settings, steward wizard, and linked social accounts UI handlers. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as posseDispatch from "../posse-dispatch.js";
import * as meshProfile from "../mesh-profile.js";
import * as contributionAttestation from "../contribution-attestation.js";
import * as linkedAccounts from "../linked-accounts.js";
import { escapeHtml } from "../render/util.js";
import { openOAuthEnrichModal } from "./onboarding.js";
import { getActiveUser, makeShellProps } from "./context.js";

function readNetworkFormValues() {
  const paused = document.getElementById("net-pause")?.checked || false;
  return {
    enabled: !paused,
    maxMb: Number(document.getElementById("net-max-mb")?.value) || 25,
    dailyCapMb: Number(document.getElementById("net-daily-cap")?.value) || 50,
    wifiOnly: document.getElementById("net-wifi")?.checked || false,
    commOnly: document.getElementById("net-comm-only")?.checked || false,
    backgroundRelay: document.getElementById("net-bg-relay")?.checked || false,
    webrtcEnabled: document.getElementById("net-webrtc")?.checked !== false,
    meshDiscoverable: document.getElementById("net-mesh-discoverable")?.checked || false,
    customSignalingUrl: document.getElementById("net-signaling-url")?.value.trim() || "",
    customRelayHttpUrl: document.getElementById("net-relay-http-url")?.value.trim() || "",
    customRelayBuddyHttpUrl: document.getElementById("net-relay-buddy-http-url")?.value.trim() || "",
    turnUrls: document.getElementById("net-turn-url")?.value.trim() || "",
    turnUser: document.getElementById("net-turn-user")?.value.trim() || "",
    turnPass: document.getElementById("net-turn-pass")?.value || "",
    webhookText: document.getElementById("net-posse-webhooks")?.value || "",
  };
}

export function bindNetworkSettingsForm() {
  const form = document.getElementById("form-network-settings");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = readNetworkFormValues();
    localStorage.setItem("vox-custom-signaling-url", v.customSignalingUrl);
    inbox.saveRelayHttpUrl(v.customRelayHttpUrl);
    inbox.saveRelayBuddyHttpUrl(v.customRelayBuddyHttpUrl);
    peers.saveCustomTurnConfig({ urls: v.turnUrls, username: v.turnUser, credential: v.turnPass });
    peers.savePeerSettings({
      enabled: v.enabled,
      maxMb: v.maxMb,
      wifiOnly: v.wifiOnly,
      commOnly: v.commOnly,
      backgroundRelay: v.backgroundRelay,
      dailyCapMb: v.dailyCapMb,
      webrtcEnabled: v.webrtcEnabled,
    });
    localAccount.setMeshDiscoverable(v.meshDiscoverable);
    void meshProfile.syncMeshProfileCard();
    cacheNode.enforceMaxCacheSize(v.maxMb);
    posseDispatch.savePosseWebhooks(posseDispatch.parseWebhookLines(v.webhookText));
    share.showToast(v.enabled ? "Preferências salvas: nó leve ativo!" : "Preferências salvas: nó pausado.");
    showNetworkSettings();
  });
}

function bindModerationListButtons() {
  document.querySelectorAll(".btn-unblock-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const route = e.currentTarget.dataset.route;
      if (route) {
        mod.unblockUser(route);
        share.showToast("Autor desbloqueado.");
        showNetworkSettings();
      }
    });
  });

  document.querySelectorAll(".btn-unmute-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const route = e.currentTarget.dataset.route;
      if (route) {
        mod.unmuteUser(route);
        share.showToast("Autor desilenciado.");
        showNetworkSettings();
      }
    });
  });
}

function bindModerationExportImport() {
  document.getElementById("btn-export-moderation")?.addEventListener("click", () => {
    const bundle = mod.exportModerationBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vox-moderacao.json";
    a.click();
    URL.revokeObjectURL(url);
    share.showToast("Regras de moderação exportadas!");
  });

  const fileImportMod = document.getElementById("file-import-moderation");
  fileImportMod?.addEventListener("change", async () => {
    const file = fileImportMod.files?.[0];
    if (!file) return;
    try {
      const ok = mod.importModerationBundle(await file.text());
      share.showToast(ok ? "Regras de moderação importadas com sucesso!" : "Arquivo de moderação inválido.", ok ? "info" : "error");
      if (ok) showNetworkSettings();
    } catch (err) {
      share.showToast(`Erro ao importar moderação: ${err.message}`, "error");
    }
  });
}

function bindContributionAttestationButton() {
  const btnAttestation = document.getElementById("btn-export-contribution-attestation");
  if (!btnAttestation) return;
  btnAttestation.addEventListener("click", async () => {
    btnAttestation.disabled = true;
    try {
      const out = await contributionAttestation.buildSignedContributionAttestation();
      if (!out.ok) {
        share.showToast(`Aguarde ${Math.ceil((out.retryAfterMs || 0) / 1000)}s para exportar de novo.`, "error");
        return;
      }
      const signed = out.signed;
      const blob = new Blob([JSON.stringify(signed, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = contributionAttestation.attestationDownloadFilename(signed.author, signed.ts);
      a.click();
      URL.revokeObjectURL(url);
      share.showToast("Comprovante baixado — guarde offline; nada foi enviado à rede.");
    } catch (err) {
      share.showToast(`Erro ao gerar comprovante: ${err.message}`, "error");
    } finally {
      btnAttestation.disabled = false;
    }
  });
}

function bindRelayAndNotifButtons() {
  const btnCheckRelay = document.getElementById("btn-check-relay");
  btnCheckRelay?.addEventListener("click", async () => {
    btnCheckRelay.disabled = true;
    btnCheckRelay.textContent = "Verificando…";
    const status = await peers.checkDesktopRelay();
    btnCheckRelay.disabled = false;
    btnCheckRelay.textContent = "Verificar Relay Desktop";
    share.showToast(
      status.online ? `Relay desktop online! ${status.data?.cachedCount || 0} itens em disco.` : `Relay HTTP não detectado em ${inbox.getRelayHttpUrl()}.`,
      status.online ? "info" : "error",
    );
    showNetworkSettings();
  });

  document.getElementById("btn-request-notif")?.addEventListener("click", async () => {
    const perm = await peers.requestNotificationPermission();
    share.showToast(perm === "granted" ? "Notificações de status permitidas!" : "Permissão de notificação não concedida.", perm === "granted" ? "info" : "error");
    showNetworkSettings();
  });
}

export function bindNetworkSettingsButtons() {
  document.getElementById("btn-clear-cache")?.addEventListener("click", async () => {
    if (confirm("Limpar todo o cache local de transações no navegador?")) {
      await cacheNode.clearCache();
      share.showToast("Cache local esvaziado.");
      showNetworkSettings();
    }
  });

  const btnResetDemo = document.getElementById("btn-reset-demo");
  btnResetDemo?.addEventListener("click", async () => {
    btnResetDemo.disabled = true;
    btnResetDemo.textContent = "Restaurando…";
    await demoSeed.resetDemoSeed();
    share.showToast("Tour de demonstração restaurado com sucesso!");
    showNetworkSettings();
  });

  bindRelayAndNotifButtons();
  bindModerationListButtons();
  bindModerationExportImport();
  bindContributionAttestationButton();
}

export async function showNetworkSettings() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Sua rede"));

  render.renderNetworkSettings(main, {
    settings: peers.getPeerSettings(),
    metrics: peers.getPeerMetrics(),
    cacheStats: await cacheNode.getCacheStats(),
    relayStatus: await peers.checkDesktopRelay(),
    dailyUsage: peers.getDailyUsage(),
    notifPermission: "Notification" in window ? Notification.permission : "unsupported",
    rtcStatus: peers.getRtcStatus(),
    customSignalingUrl: localStorage.getItem("vox-custom-signaling-url") || "",
    customRelayHttpUrl: localStorage.getItem(inbox.RELAY_HTTP_STORAGE_KEY) || "",
    customRelayBuddyHttpUrl: localStorage.getItem(inbox.RELAY_BUDDY_HTTP_STORAGE_KEY) || "",
    customTurn: peers.getCustomTurnConfig(),
    relayHttpUrl: inbox.getRelayHttpUrl(),
    gatewayHealth: gatewayTelemetry.getGatewayHealthSummary(),
    blockedUsers: mod.getBlockedUsers(),
    mutedUsers: mod.getMutedUsers(),
    meshDiscoverable: localAccount.getMeshDiscoverable(),
    posseWebhooks: posseDispatch.loadPosseWebhooks(),
  });

  bindNetworkSettingsForm();
  bindNetworkSettingsButtons();
}

function bindStewardTestButtons() {
  document.getElementById("sw-test-mirror")?.addEventListener("click", async () => {
    const draft = stewardWizard.loadDraft();
    const out = document.getElementById("sw-mirror-result");
    if (out) out.textContent = "Enviando…";
    const result = await communityMirror.testMirrorForSteward(draft.communityId, [], draft.relayHttpUrl || inbox.getRelayHttpUrl());
    if (out) out.textContent = result ? "Espelho OK — relay aceitou o índice." : "Falha — veja toast ou código acima.";
    if (result) showStewardWizard();
  });

  document.getElementById("sw-verify-relay")?.addEventListener("click", async () => {
    const url = document.getElementById("sw-relay-http")?.value.trim();
    const out = document.getElementById("sw-verify-result");
    if (out) out.textContent = "Verificando…";
    const r = await stewardWizard.verifyRelayHttp(url);
    if (out) out.textContent = r.ok ? `OK · ${stewardWizard.formatRelayHealthSummary(r.data)}` : `Falha: ${r.reason}`;
  });
}

export function bindStewardWizardForm() {
  const form = document.getElementById("form-steward-wizard");
  if (!form) return;
  const step = stewardWizard.loadStep();

  document.getElementById("sw-prev")?.addEventListener("click", () => {
    stewardWizard.saveDraft(stewardWizard.readFormStep(step));
    stewardWizard.saveStep(step - 1);
    showStewardWizard();
  });

  bindStewardTestButtons();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = stewardWizard.readFormStep(step);
    if (step === 1 && !data.pledge) return share.showToast("Marque o compromisso para continuar.", "error");
    stewardWizard.saveDraft(data);
    if (step === 5) {
      const draft = stewardWizard.loadDraft();
      if (draft.signalingUrl) localStorage.setItem("vox-custom-signaling-url", draft.signalingUrl);
      if (draft.relayHttpUrl) inbox.saveRelayHttpUrl(draft.relayHttpUrl);
      share.showToast("Wizard concluído — URLs salvas em Preferências de rede.");
      location.hash = "#/settings/network";
      return;
    }
    stewardWizard.saveStep(step + 1);
    showStewardWizard();
  });
}

export async function showStewardWizard() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Assistente steward"));
  const step = stewardWizard.loadStep();
  const draft = stewardWizard.loadDraft();
  const mirrorLast =
    communityMirror.getMirrorStatusForCommunity(draft.communityId) ||
    communityMirror.loadMirrorTelemetry().lastError;
  render.renderStewardWizard(main, { draft, step, mirrorLast });
  bindStewardWizardForm();
}

export async function syncIdentity() {
  const user = await getActiveUser();
  if (user) {
    const dmPub = await cryptoDm.getPublicJwk();
    peers.announceIdentity(user, dmPub);
  }
}

export async function showLinkedAccounts() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Redes Vinculadas"));
  render.renderLinkedAccountsPage(main);
  bindLinkedAccountsUi(() => showLinkedAccounts());
}

function bindLinkedAccountFormsAndButtons(onRefresh) {
  document.querySelectorAll(".btn-one-click-connect").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const netId = btn.dataset.netId;
      if (!netId) return;
      const box = btn.closest(".network-connect-box") || btn.closest(".linked-network-card");
      const handleInput = box?.querySelector(".input-net-handle");
      const handle = handleInput?.value?.trim() || "";
      const res = linkedAccounts.connectWithOneClick(netId, handle);
      share.showToast(`Conectando ao ${netId}... Rede aberta no navegador! 🔗`);
      if (onRefresh) onRefresh();
      linkedAccounts.testLinkedAccount(netId).catch(() => {});
    });
  });

  document.querySelectorAll(".btn-save-handle-quick").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const netId = btn.dataset.netId;
      if (!netId) return;
      const box = btn.closest(".network-connect-box") || btn.closest(".linked-network-card");
      const handle = box?.querySelector(".input-net-handle")?.value?.trim() || "";
      if (!handle) {
        share.showToast("Informe o @handle para vincular.", "warning");
        return;
      }
      linkedAccounts.saveLinkedAccount(netId, { handle, enabled: true });
      share.showToast(`Conta @${handle.replace(/^@/, "")} vinculada com sucesso! 🔗`);
      if (onRefresh) onRefresh();
    });
  });

  document.querySelectorAll(".form-link-network").forEach((form) => {
    if (form.dataset.wired) return;
    form.dataset.wired = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const netId = form.dataset.netId;
      const box = form.closest(".network-connect-box") || form.closest(".linked-network-card");
      const handle = box?.querySelector(".input-net-handle")?.value?.trim() || form.querySelector(".input-net-handle")?.value?.trim() || linkedAccounts.getSuggestedHandle(netId) || netId;
      const webhook = form.querySelector(".input-net-webhook")?.value?.trim() || "";
      const appPassword = form.querySelector(".input-net-app-password")?.value?.trim() || "";
      linkedAccounts.saveLinkedAccount(netId, { handle, webhook, appPassword, enabled: true });
      share.showToast(`Credenciais de @${handle.replace(/^@/, "")} salvas com sucesso! 🔗`);
      if (onRefresh) onRefresh();
    });
  });

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
  fb.style.background = res.ok ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)";
  fb.style.color = res.ok ? "#16a34a" : "#dc2626";
  fb.style.border = `1px solid ${res.ok ? "#16a34a" : "#dc2626"}`;
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
        share.showToast(res.message, res.ok ? "info" : "error");
      } catch (err) {
        share.showToast(`Erro ao testar: ${err?.message}`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "🧪 Testar se conectou";
      }
    });
  });
}

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
    openOAuthEnrichModal({ onComplete: () => onRefresh && onRefresh() });
  });

  bindLinkedAccountFormsAndButtons(onRefresh);
  bindLinkedAccountCheckboxes();
  bindLinkedAccountTestButtons();
}
