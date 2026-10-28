/** @file Network settings and steward wizard. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as handles from "../handles.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as listingUi from "../listing-ui.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as brcode from "../brcode.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as posseDispatch from "../posse-dispatch.js";
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as oauthProfile from "../oauth-profile.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import * as contributionAttestation from "../contribution-attestation.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";

export function bindNetworkSettingsForm() {
  const form = document.getElementById("form-network-settings");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const paused = document.getElementById("net-pause")?.checked || false;
    const enabled = !paused;
    const maxMb = Number(document.getElementById("net-max-mb")?.value) || 25;
    const dailyCapMb = Number(document.getElementById("net-daily-cap")?.value) || 50;
    const wifiOnly = document.getElementById("net-wifi")?.checked || false;
    const commOnly = document.getElementById("net-comm-only")?.checked || false;
    const backgroundRelay = document.getElementById("net-bg-relay")?.checked || false;
    const webrtcEnabled = document.getElementById("net-webrtc")?.checked !== false;
    const meshDiscoverable = document.getElementById("net-mesh-discoverable")?.checked || false;
    const customSignalingUrl = document.getElementById("net-signaling-url")?.value.trim() || "";
    const customRelayHttpUrl = document.getElementById("net-relay-http-url")?.value.trim() || "";
    const customRelayBuddyHttpUrl = document.getElementById("net-relay-buddy-http-url")?.value.trim() || "";
    const turnUrls = document.getElementById("net-turn-url")?.value.trim() || "";
    const turnUser = document.getElementById("net-turn-user")?.value.trim() || "";
    const turnPass = document.getElementById("net-turn-pass")?.value || "";

    localStorage.setItem("vox-custom-signaling-url", customSignalingUrl);
    inbox.saveRelayHttpUrl(customRelayHttpUrl);
    inbox.saveRelayBuddyHttpUrl(customRelayBuddyHttpUrl);
    peers.saveCustomTurnConfig({ urls: turnUrls, username: turnUser, credential: turnPass });

    peers.savePeerSettings({
      enabled,
      maxMb,
      wifiOnly,
      commOnly,
      backgroundRelay,
      dailyCapMb,
      webrtcEnabled,
    });
    localAccount.setMeshDiscoverable(meshDiscoverable);
    void meshProfile.syncMeshProfileCard();
    cacheNode.enforceMaxCacheSize(maxMb);
    const webhookText = document.getElementById("net-posse-webhooks")?.value || "";
    posseDispatch.savePosseWebhooks(posseDispatch.parseWebhookLines(webhookText));
    share.showToast(enabled ? "Preferências salvas: nó leve ativo!" : "Preferências salvas: nó pausado.");
    showNetworkSettings();
  });
}

export function bindNetworkSettingsButtons() {
  const btnClear = document.getElementById("btn-clear-cache");
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      if (confirm("Limpar todo o cache local de transações no navegador?")) {
        await cacheNode.clearCache();
        share.showToast("Cache local esvaziado.");
        showNetworkSettings();
      }
    });
  }

  const btnCheckRelay = document.getElementById("btn-check-relay");
  if (btnCheckRelay) {
    btnCheckRelay.addEventListener("click", async () => {
      btnCheckRelay.disabled = true;
      btnCheckRelay.textContent = "Verificando…";
      const status = await peers.checkDesktopRelay();
      btnCheckRelay.disabled = false;
      btnCheckRelay.textContent = "Verificar Relay Desktop";
      if (status.online) {
        share.showToast(`Relay desktop online! ${status.data?.cachedCount || 0} itens em disco.`);
      } else {
        share.showToast(`Relay HTTP não detectado em ${inbox.getRelayHttpUrl()}.`, "error");
      }
      showNetworkSettings();
    });
  }

  const btnReqNotif = document.getElementById("btn-request-notif");
  if (btnReqNotif) {
    btnReqNotif.addEventListener("click", async () => {
      const perm = await peers.requestNotificationPermission();
      if (perm === "granted") {
        share.showToast("Notificações de status permitidas!");
      } else {
        share.showToast("Permissão de notificação não concedida.", "error");
      }
      showNetworkSettings();
    });
  }

  const btnResetDemo = document.getElementById("btn-reset-demo");
  if (btnResetDemo) {
    btnResetDemo.addEventListener("click", async () => {
      btnResetDemo.disabled = true;
      btnResetDemo.textContent = "Restaurando…";
      await demoSeed.resetDemoSeed();
      share.showToast("Tour de demonstração restaurado com sucesso!");
      showNetworkSettings();
    });
  }

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

  const btnExportMod = document.getElementById("btn-export-moderation");
  if (btnExportMod) {
    btnExportMod.addEventListener("click", () => {
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
  }

  const btnAttestation = document.getElementById("btn-export-contribution-attestation");
  if (btnAttestation) {
    btnAttestation.addEventListener("click", async () => {
      btnAttestation.disabled = true;
      try {
        const out = await contributionAttestation.buildSignedContributionAttestation();
        if (!out.ok) {
          const sec = Math.ceil((out.retryAfterMs || 0) / 1000);
          share.showToast(`Aguarde ${sec}s para exportar de novo.`, "error");
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

  const fileImportMod = document.getElementById("file-import-moderation");
  if (fileImportMod) {
    fileImportMod.addEventListener("change", async () => {
      const file = fileImportMod.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const ok = mod.importModerationBundle(text);
        if (ok) {
          share.showToast("Regras de moderação importadas com sucesso!");
          showNetworkSettings();
        } else {
          share.showToast("Arquivo de moderação inválido.", "error");
        }
      } catch (err) {
        share.showToast(`Erro ao importar moderação: ${err.message}`, "error");
      }
    });
  }
}

export async function showNetworkSettings() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Sua rede"));

  const settings = peers.getPeerSettings();
  const metrics = peers.getPeerMetrics();
  const cacheStats = await cacheNode.getCacheStats();
  const relayStatus = await peers.checkDesktopRelay();
  const dailyUsage = peers.getDailyUsage();
  const notifPermission = "Notification" in window ? Notification.permission : "unsupported";
  const rtcStatus = peers.getRtcStatus();
  const customSignalingUrl = localStorage.getItem("vox-custom-signaling-url") || "";
  const customRelayHttpUrl = localStorage.getItem(inbox.RELAY_HTTP_STORAGE_KEY) || "";
  const customRelayBuddyHttpUrl = localStorage.getItem(inbox.RELAY_BUDDY_HTTP_STORAGE_KEY) || "";
  const relayHttpUrl = inbox.getRelayHttpUrl();
  const customTurn = peers.getCustomTurnConfig();

  render.renderNetworkSettings(main, {
    settings,
    metrics,
    cacheStats,
    relayStatus,
    dailyUsage,
    notifPermission,
    rtcStatus,
    customSignalingUrl,
    customRelayHttpUrl,
    customRelayBuddyHttpUrl,
    customTurn,
    relayHttpUrl,
    gatewayHealth: gatewayTelemetry.getGatewayHealthSummary(),
    blockedUsers: mod.getBlockedUsers(),
    mutedUsers: mod.getMutedUsers(),
    meshDiscoverable: localAccount.getMeshDiscoverable(),
    posseWebhooks: posseDispatch.loadPosseWebhooks(),
  });

  bindNetworkSettingsForm();
  bindNetworkSettingsButtons();
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

  document.getElementById("sw-test-mirror")?.addEventListener("click", async () => {
    const draft = stewardWizard.loadDraft();
    const out = document.getElementById("sw-mirror-result");
    if (out) out.textContent = "Enviando…";
    const relayUrl = draft.relayHttpUrl || inbox.getRelayHttpUrl();
    const result = await communityMirror.testMirrorForSteward(draft.communityId, [], relayUrl);
    if (out) {
      out.textContent = result
        ? "Espelho OK — relay aceitou o índice."
        : "Falha — veja toast ou código acima.";
    }
    if (result) showStewardWizard();
  });

  document.getElementById("sw-verify-relay")?.addEventListener("click", async () => {
    const url = document.getElementById("sw-relay-http")?.value.trim();
    const out = document.getElementById("sw-verify-result");
    if (out) out.textContent = "Verificando…";
    const r = await stewardWizard.verifyRelayHttp(url);
    if (out) {
      out.textContent = r.ok
        ? `OK · ${stewardWizard.formatRelayHealthSummary(r.data)}`
        : `Falha: ${r.reason}`;
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = stewardWizard.readFormStep(step);
    if (step === 1 && !data.pledge) {
      share.showToast("Marque o compromisso para continuar.", "error");
      return;
    }
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

export function bindLinkedAccountsUi(onRefresh) {
  const chkMaster = document.getElementById("chk-auto-replicate-master");
  if (chkMaster && !chkMaster.dataset.wired) {
    chkMaster.dataset.wired = "1";
    chkMaster.addEventListener("change", () => {
      import("../linked-accounts.js").then((mod) => {
        mod.setAutoReplicationEnabled(chkMaster.checked);
        share.showToast(chkMaster.checked ? "Auto-replicação ativada! ⚡" : "Auto-replicação desativada.");
      });
    });
  }

  const btnGeneral = document.getElementById("btn-save-general-webhook");
  if (btnGeneral && !btnGeneral.dataset.wired) {
    btnGeneral.dataset.wired = "1";
    btnGeneral.addEventListener("click", () => {
      const val = document.getElementById("input-general-webhook")?.value?.trim();
      import("../linked-accounts.js").then((mod) => {
        mod.setGeneralWebhookUrl(val);
        share.showToast(val ? "Webhook unificado salvo!" : "Webhook removido.");
      });
    });
  }

  document.querySelectorAll(".form-link-network").forEach((form) => {
    if (form.dataset.wired) return;
    form.dataset.wired = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const netId = form.dataset.netId;
      const handleInput = form.querySelector(".input-net-handle");
      const webhookInput = form.querySelector(".input-net-webhook");
      const handle = handleInput?.value?.trim();
      const webhook = webhookInput?.value?.trim() || "";
      if (!handle) return;
      import("../linked-accounts.js").then((mod) => {
        mod.saveLinkedAccount(netId, { handle, webhook, enabled: true });
        share.showToast(`Conta @${handle.replace(/^@/, "")} vinculada com sucesso! 🔗`);
        if (onRefresh) onRefresh();
      });
    });
  });

  document.querySelectorAll(".btn-unlink-network").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const netId = btn.dataset.netId;
      if (!netId) return;
      import("../linked-accounts.js").then((mod) => {
        mod.removeLinkedAccount(netId);
        share.showToast("Rede desvinculada.");
        if (onRefresh) onRefresh();
      });
    });
  });

  document.querySelectorAll(".chk-network-replicate").forEach((chk) => {
    if (chk.dataset.wired) return;
    chk.dataset.wired = "1";
    chk.addEventListener("change", () => {
      const netId = chk.dataset.netId;
      if (!netId) return;
      import("../linked-accounts.js").then((mod) => {
        const accounts = mod.loadLinkedAccounts();
        if (accounts[netId]) {
          mod.saveLinkedAccount(netId, { ...accounts[netId], enabled: chk.checked });
          share.showToast(chk.checked ? "Replicação ativada para este canal." : "Replicação pausada para este canal.");
        }
      });
    });
  });
}
