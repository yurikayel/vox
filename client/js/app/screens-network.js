/** @file Network settings, steward wizard, and linked social accounts UI handlers. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as socialLogin from "../social-login.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as mock from "../mock.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as posseDispatch from "../posse-dispatch.js";
import * as meshProfile from "../mesh-profile.js";
import * as contributionAttestation from "../contribution-attestation.js";
import * as linkedAccounts from "../linked-accounts.js";
import * as voxels from "../voxels.js";
import * as webrtcPeer from "../webrtc-peer.js";
import { applySupporterMode, normalizeStorageCommitment } from "../supporter-mode.js";
import { escapeHtml } from "../render/util.js";
import { openOAuthEnrichModal } from "./onboarding.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { bindInboxBackupSection, renderInboxBackupSection } from "./inbox-backup-ui.js";

function getChecked(id, defaultValue = false) {
  const el = document.getElementById(id);
  return el ? el.checked : defaultValue;
}

function getValue(id, defaultValue = "") {
  const el = document.getElementById(id);
  return el ? el.value.trim() : defaultValue;
}

function getNumberValue(id, defaultValue = 0) {
  const el = document.getElementById(id);
  const n = el ? Number(el.value) : defaultValue;
  return Number.isNaN(n) || n <= 0 ? defaultValue : n;
}

function readNetworkFormValues() {
  const paused = getChecked("net-pause");
  return {
    enabled: !paused,
    maxMb: getNumberValue("net-max-mb", 100),
    dailyCapMb: getNumberValue("net-daily-cap", 200),
    wifiOnly: getChecked("net-wifi"),
    cellularCapMb: peers.clampCellularCapMb(getNumberValue("net-cellular-cap", 5)),
    commOnly: getChecked("net-comm-only"),
    backgroundRelay: getChecked("net-bg-relay"),
    webrtcEnabled: getChecked("net-webrtc", true),
    turnOnly: getChecked("net-turn-only"),
    meshDiscoverable: getChecked("net-mesh-discoverable"),
    customSignalingUrl: getValue("net-signaling-url"),
    customRelayHttpUrl: getValue("net-relay-http-url"),
    customRelayBuddyHttpUrl: getValue("net-relay-buddy-http-url"),
    turnUrls: getValue("net-turn-url"),
    turnUser: getValue("net-turn-user"),
    turnPass: getValue("net-turn-pass"),
    webhookText: getValue("net-posse-webhooks"),
  };
}

/**
 * Liga o botão do modo Apoiador: alterna o modo, ajusta disco e banda (`applySupporterMode`), corta o
 * cache ao novo disco e redesenha a tela.
 *
 * @returns {void}
 */
export function bindSupporterToggle() {
  document.getElementById("btn-supporter-toggle")?.addEventListener("click", (e) => {
    const turnOn = e.currentTarget.dataset.on !== "1";
    const next = applySupporterMode(peers.getPeerSettings(), turnOn);
    peers.savePeerSettings(next);
    cacheNode.enforceMaxCacheSize(next.maxMb);
    share.showToast(turnOn ? "Obrigado! Você agora é apoiador da rede (só no Wi-Fi)." : "De volta ao nó leve.");
    showNetworkSettings();
  });
}

/** Grava as preferências do nó com disco e banda ajustados ao modo (leve ou apoiador). */
function savePeerFormValues(v) {
  const saved = normalizeStorageCommitment({
    ...peers.getPeerSettings(),
    enabled: v.enabled,
    maxMb: v.maxMb,
    wifiOnly: v.wifiOnly,
    cellularCapMb: v.cellularCapMb,
    commOnly: v.commOnly,
    backgroundRelay: v.backgroundRelay,
    dailyCapMb: v.dailyCapMb,
    webrtcEnabled: v.webrtcEnabled,
  });
  peers.savePeerSettings(saved);
  return saved;
}

/**
 * Liga o formulário de rede: grava sinalização, relays, TURN, preferências do nó (com disco e banda
 * ajustados ao modo por `normalizeStorageCommitment`), visibilidade na malha e webhooks POSSE.
 *
 * @returns {void}
 */
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
    const saved = savePeerFormValues(v);
    webrtcPeer.setTurnOnly(v.turnOnly);
    localAccount.setMeshDiscoverable(v.meshDiscoverable);
    void meshProfile.syncMeshProfileCard();
    cacheNode.enforceMaxCacheSize(saved.maxMb);
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
    if (status.online) {
      void voxels.triggerLocalNodeBoostReward({
        checkRelayFn: async () => status,
        toastFn: share.showToast,
      });
    }
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
    const turnOn = !mock.isDemoMode();
    mock.setDemoMode(turnOn);
    if (!turnOn) await demoSeed.resetDemoSeed();
    share.showToast(turnOn ? "Modo demonstração ligado: perfis de exemplo são fictícios." : "Modo demonstração desligado.");
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
    settings: { ...peers.getPeerSettings(), turnOnly: webrtcPeer.isTurnOnly() },
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
    demoMode: mock.isDemoMode(),
  });
  main.querySelector(".network-card")?.insertAdjacentHTML("afterend", renderInboxBackupSection());
  bindInboxBackupSection(() => void showNetworkSettings());

  bindNetworkSettingsForm();
  bindSupporterToggle();
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
    const enrich = localAccount.getProfileEnrichment() || {};
    const displayName = localAccount.getDisplayName() || enrich.displayName || "";
    const avatarUrl = enrich.avatarUrl && enrich.avatarUrl.length <= 512 ? enrich.avatarUrl : "";
    peers.announceIdentity(user, { ...dmPub, displayName, avatarUrl });
  }
}

export async function showLinkedAccounts() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Redes Vinculadas"));
  render.renderLinkedAccountsPage(main);
  bindLinkedAccountsUi(() => showLinkedAccounts());
  void revealSocialLoginButtons();
  const cb = socialLogin.takePendingCallback();
  if (cb) void finishSocialLogin(() => socialLogin.completeSocialLogin(cb));
}

let loginAvailability = { bsky: true };

/** Disponibilidade de login por rede; nas que têm login, oferece "ou digitar @usuário" como alternativa. */
async function revealSocialLoginButtons() {
  loginAvailability = await socialLogin.availableLoginProviders().catch(() => ({ bsky: true }));
  document.querySelectorAll(".btn-link-manual").forEach((alt) => { alt.hidden = !loginAvailability[alt.dataset.netId]; });
}

function openManualLink(netId) {
  const panel = document.querySelector(`.link-manual[data-net-id="${netId}"]`);
  if (!panel) return;
  panel.hidden = false;
  panel.querySelector(".input-net-handle")?.focus();
}

function saveLoginResult(r) {
  linkedAccounts.saveLinkedAccount(r.netId, {
    handle: r.handle || "", did: r.did || "", accountId: r.id || "", displayName: r.name || "",
    enabled: true, verified: true, via: "oauth",
  });
  linkedAccounts.setAutoReplicationEnabled(true);
}

async function finishSocialLogin(run) {
  try {
    const r = await run();
    if (!r) return;
    saveLoginResult(r);
    share.showToast(`Conectado: ${r.handle ? `@${r.handle}` : r.name || r.netId} ✅`);
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
      void finishSocialLogin(() => socialLogin.startSocialLogin(netId)).finally(() => { btn.disabled = false; });
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
      if (linkedAccounts.confirmLinkedAccount(btn.dataset.netId)) share.showToast("Conta confirmada por você.");
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
