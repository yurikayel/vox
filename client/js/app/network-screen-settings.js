/** @file Network settings, form bindings, supporter mode toggle, and node telemetry display. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as localAccount from "../identity/index.js";
import * as demoSeed from "../demo-seed.js";
import * as mock from "../mock.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import * as posseDispatch from "../posse-dispatch.js";
import * as meshProfile from "../mesh-profile.js";
import * as voxels from "../voxels.js";
import * as webrtcPeer from "../webrtc-peer.js";
import { applySupporterMode, normalizeStorageCommitment } from "../supporter-mode.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { bindInboxBackupSection, renderInboxBackupSection } from "./inbox-backup-ui.js";
import { bindOwnPostsSection, renderOwnPostsSection } from "./own-posts-ui.js";
import {
  bindModerationListButtons,
  bindModerationExportImport,
  bindContributionAttestationButton,
} from "./network-screen-moderation.js";

/**
 * Lê uma caixa de seleção pelo identificador do elemento.
 *
 * @param {string} id Identificador do elemento.
 * @param {boolean} [defaultValue=false] Valor se o elemento não existe.
 * @returns {boolean}
 */
function getChecked(id, defaultValue = false) {
  const el = document.getElementById(id);
  return el ? el.checked : defaultValue;
}

/**
 * Lê o texto aparado de um campo pelo identificador do elemento.
 *
 * @param {string} id Identificador do elemento.
 * @param {string} [defaultValue=""] Valor se o elemento não existe.
 * @returns {string}
 */
function getValue(id, defaultValue = "") {
  const el = document.getElementById(id);
  return el ? el.value.trim() : defaultValue;
}

/**
 * Lê um campo numérico; valor inválido ou não positivo volta ao padrão.
 *
 * @param {string} id Identificador do elemento.
 * @param {number} [defaultValue=0] Valor padrão.
 * @returns {number}
 */
function getNumberValue(id, defaultValue = 0) {
  const el = document.getElementById(id);
  const n = el ? Number(el.value) : defaultValue;
  return Number.isNaN(n) || n <= 0 ? defaultValue : n;
}

/**
 * Lê os ajustes de rede do formulário.
 *
 * @returns {object}
 */
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

/**
 * Liga os botões de verificar o relay local e de notificações.
 */
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

/**
 * Liga botões da tela de rede.
 *
 * @returns {void}
 */
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
  bindModerationListButtons(showNetworkSettings);
  bindModerationExportImport(showNetworkSettings);
  bindContributionAttestationButton();
  document.getElementById("btn-network-share-connect")?.addEventListener("click", (e) => {
    const id = e.currentTarget.dataset.route || "";
    if (!id) return;
    void share.shareConnect({ routeId: id, displayName: localAccount.getDisplayName(), invite: true });
  });
}

/**
 * Reúne os dados que a tela de ajustes de rede exibe.
 *
 * @param {string} user Rota de quem vê.
 * @returns {Promise<object>}
 */
async function buildNetworkSettingsProps(user) {
  return {
    routeId: user,
    inviteLink: user ? share.inviteShareUrl(user) : "",
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
  };
}

/**
 * Monta configurações de rede.
 *
 * @returns {Promise<void>}
 */
export async function showNetworkSettings() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Sua rede"));

  render.renderNetworkSettings(main, await buildNetworkSettingsProps(user));
  main.querySelector(".network-card")?.insertAdjacentHTML("afterend", renderInboxBackupSection() + renderOwnPostsSection());
  bindInboxBackupSection(() => void showNetworkSettings());
  bindOwnPostsSection();

  bindNetworkSettingsForm();
  bindSupporterToggle();
  bindNetworkSettingsButtons();
}
