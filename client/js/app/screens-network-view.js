/**
 * @file Implementação sob demanda (PM-01) das telas de rede: configurações, steward e contas vinculadas.
 *
 * Carregada por `screens-network.js` via `import()`; reúne os submódulos especializados
 * (Onda 3 do Hardening v3.2) e o backup HTML offline, fora do grafo estático de boot e do precache.
 *
 * @module app/screens-network-view
 * @see client/js/app/network-screen-settings.js
 * @see client/js/app/network-screen-moderation.js
 * @see client/js/app/network-screen-steward.js
 * @see client/js/app/network-screen-linked.js
 */

import * as ownPosts from "../own-posts.js";
import * as share from "../share.js";
import { buildStandaloneHtmlBackup } from "../export-html-backup.js";
import { showNetworkSettings as showBaseNetworkSettings } from "./network-screen-settings.js";

/**
 * Gera e dispara o download local do backup HTML standalone offline (zero upload/rede).
 *
 * @param {HTMLElement} btn Botão acionado.
 * @param {{ exportOwnPosts?: Function, downloadBlob?: Function, showToast?: Function, now?: Function }} [deps]
 * @returns {Promise<{ downloaded: boolean, name?: string, count: number }>}
 */
export async function exportHtmlBackupNow(btn, deps = {}) {
  const exportFn = deps.exportOwnPosts || ownPosts.exportOwnPosts;
  const downloadFn = deps.downloadBlob || share.downloadBlob;
  const toastFn = deps.showToast || share.showToast;
  const nowFn = deps.now || Date.now;
  if (btn) btn.disabled = true;
  try {
    const file = await exportFn();
    if (!file?.count) {
      toastFn("Você ainda não tem posts neste aparelho.");
      return { downloaded: false, count: 0 };
    }
    const { name, html, stats } = buildStandaloneHtmlBackup(file.text, nowFn());
    downloadFn(new Blob([html], { type: "text/html;charset=utf-8" }), name);
    toastFn(`Backup HTML offline salvo (${stats.postCount} post(s)): ${name}.`);
    return { downloaded: true, name, count: stats.postCount };
  } catch (err) {
    toastFn(`Não foi possível gerar o backup HTML: ${err.message}`, "error");
    return { downloaded: false, count: 0 };
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Liga o botão "Baixar backup HTML (offline)" na tela de rede.
 *
 * @param {{ exportOwnPosts?: Function, downloadBlob?: Function, showToast?: Function, now?: Function }} [deps]
 * @returns {boolean} `true` se o botão foi encontrado e ligado.
 */
export function bindHtmlBackupButton(deps = {}) {
  const btn = document.getElementById("btn-export-html-backup");
  if (!btn) return false;
  btn.addEventListener("click", () => void exportHtmlBackupNow(btn, deps));
  return true;
}

/**
 * Monta configurações de rede e liga o botão de backup HTML offline.
 *
 * @returns {Promise<void>}
 */
export async function showNetworkSettings() {
  await showBaseNetworkSettings();
  bindHtmlBackupButton();
}

export { showStewardWizard } from "./network-screen-steward.js";
export { showLinkedAccounts } from "./network-screen-linked.js";
