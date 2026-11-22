/**
 * @file Fachada de telas de perfil, busca de handle, carteira Arweave e consulta Pix.
 * @module app/screens-profile
 */

import * as render from "../render.js";
import * as localAccount from "../identity/index.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { bindIdentityMetaForm } from "./profile-identity-meta-ui.js";
import { invalidateProfileCache as clearProfileCache, loadProfileData } from "./profile-screen-data.js";
import {
  broadcastActiveIdentityChanges,
  bindPixButtons,
  bindGithubButtons,
  bindReadmeButtons,
  bindSharingAndClipboardButtons,
  bindDisplayNameAndOAuthButtons,
  bindBlockAndMuteButtons,
  bindVoxelButtons,
} from "./profile-screen-settings.js";
import {
  bindVaultAccountButtons,
  bindSovereigntyBackup,
  bindLocalWipe,
} from "./profile-screen-account.js";
import {
  showWallet as renderWalletScreen,
  bindWalletAndDmButtons,
} from "./profile-screen-wallet.js";
import {
  showHandleLookup as renderHandleLookup,
  showPixLookup as renderPixLookup,
} from "./profile-screen-lookups.js";

/**
 * Invalida cache de perfil no aparelho.
 *
 * @returns {void}
 */
export function invalidateProfileCache() {
  clearProfileCache();
}

function updateProfileTabIndicator(existingLayout, activeTab) {
  const nav = existingLayout.querySelector(".profile-grid-tabs");
  if (!nav) return;
  const target = (activeTab === "followers")
    ? "following"
    : (activeTab === "starred" || activeTab === "communities")
      ? "about"
      : (activeTab || "posts");
  nav.querySelectorAll(".profile-grid-tab").forEach((tabEl) => {
    tabEl.classList.toggle("active", tabEl.dataset.tab === target);
  });
}

/**
 * Monta página de perfil.
 *
 * @param {string} address Endereço ou rota do perfil a exibir.
 * @param {string} [activeTab="posts"] Identificador da aba ativa.
 * @returns {Promise<void>}
 */
export async function showProfile(address, activeTab = "posts") {
  const user = await getActiveUser();
  const targetAddress = address || user;
  const isSelf = targetAddress === user || targetAddress === (await localAccount.getRouteId());

  const existingLayout = document.querySelector(`.profile-grid-layout[data-profile-address="${targetAddress}"]`);
  const slot = existingLayout?.querySelector("#profile-tab-content");

  if (existingLayout && slot) {
    updateProfileTabIndicator(existingLayout, activeTab);
    const pData = await loadProfileData(targetAddress, isSelf, user, activeTab);
    slot.innerHTML = render.renderProfileTabContent(activeTab, pData);
    bindProfileButtons(user, targetAddress, isSelf, pData.dmPub, activeTab);
    return;
  }

  const main = render.renderShell(makeShellProps(user, "profile", "Perfil"));
  render.renderLoading(main);

  const pData = await loadProfileData(targetAddress, isSelf, user, activeTab);

  main.innerHTML = "";
  render.renderProfile(main, targetAddress, pData.memberships, isSelf, pData);

  bindProfileButtons(user, targetAddress, isSelf, pData.dmPub, activeTab);
}

/**
 * Liga botões da página de perfil.
 *
 * @param {string} user Endereço da identidade ativa.
 * @param {string} address Endereço do perfil visualizado.
 * @param {boolean} isSelf Indica se é a própria conta do usuário.
 * @param {unknown} dmPub Chave JWK pública para DM.
 * @param {string} [activeTab="posts"] Aba ativa.
 * @returns {void}
 */
export function bindProfileButtons(user, address, isSelf, dmPub, activeTab = "posts") {
  const refresh = (addr, tab) => {
    void showProfile(addr || address, tab || activeTab);
  };
  bindPixButtons(address, activeTab, isSelf, refresh);
  bindGithubButtons(address, activeTab, isSelf, refresh);
  bindReadmeButtons(address, activeTab, isSelf, refresh);
  bindSharingAndClipboardButtons(address);
  bindDisplayNameAndOAuthButtons(address, activeTab, refresh);
  bindIdentityMetaForm({
    address,
    activeTab,
    isSelf,
    onAfterSave: (addr, tab) => {
      invalidateProfileCache();
      broadcastActiveIdentityChanges();
      showProfile(addr, tab);
    },
  });
  bindVaultAccountButtons(address, isSelf, refresh);
  bindWalletAndDmButtons(address, isSelf, dmPub, user, refresh);
  bindSovereigntyBackup(isSelf, activeTab, refresh);
  bindLocalWipe(isSelf, activeTab, refresh);
  bindBlockAndMuteButtons(address, activeTab, isSelf, refresh);
  bindVoxelButtons(address, activeTab, isSelf);
}

/**
 * Busca perfil por handle.
 *
 * @param {unknown} rawSlug Slug ou handle a ser consultado.
 * @returns {Promise<void>}
 */
export async function showHandleLookup(rawSlug) {
  await renderHandleLookup(rawSlug);
}

/**
 * Monta tela da carteira.
 *
 * @returns {Promise<void>}
 */
export async function showWallet() {
  await renderWalletScreen();
}

/**
 * Consulta chave Pix no perfil.
 *
 * @param {unknown} query Chave Pix a ser consultada.
 * @returns {Promise<void>}
 */
export async function showPixLookup(query) {
  await renderPixLookup(query);
}
