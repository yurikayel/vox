/** @file Profile, handle lookup, wallet, pix lookup. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import { openQrUrlSheet } from "../qr-url.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as cryptoDm from "../crypto-dm.js";
import * as handles from "../handles.js";
import * as localAccount from "../local-account.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as postOwnership from "../post-ownership.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { getCachedBskyPosts } from "../bsky-feed.js";
import { openOAuthEnrichModal } from "./onboarding.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { syncIdentity } from "./screens-network.js";
import { KIND_WRAPPED, peekBackupKind } from "../account-backup-wrap.js";

function collectByIds(posts, ids) {
  const set = new Set(ids);
  const out = [];
  const seen = new Set();
  for (const p of posts || []) {
    if (!p?.id || !set.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

let activeProfileCache = null;

export function invalidateProfileCache() {
  activeProfileCache = null;
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

async function loadProfileMemberships(targetAddress) {
  const memberships = await gql.fetchUserMemberships(targetAddress);
  const localMems = await cacheNode.getLocalPosts({ type: "membership" });
  for (const m of localMems) {
    if (m.author === targetAddress && !memberships.some((x) => x.communityId === m.communityId)) {
      memberships.push({ id: m.id, communityId: m.communityId });
    }
  }
  return memberships;
}

async function loadProfileWalletAndDm(isSelf) {
  let dmPub = null;
  if (isSelf) {
    dmPub = await cryptoDm.getPublicJwk();
  }
  let balance = "0.000";
  if (wallet.hasWallet() && isSelf) {
    try {
      balance = await wallet.getBalance(await wallet.getAddress());
    } catch {
      balance = "0.000";
    }
  }
  return { dmPub, balance };
}

async function fetchHandleWithConflict(targetAddress) {
  const handle = await gql.fetchHandleForAddress(targetAddress);
  if (!handle) return { handle: null, conflictInfo: null };
  const hRes = await gql.fetchHandle(handle);
  const conflictInfo = hRes && hRes.isConflict ? hRes : null;
  return { handle, conflictInfo };
}

function resolveIdentityFields(targetAddress, isSelf, resolved, mockProf) {
  if (welcomeProfile.isWelcomeRouteId(targetAddress)) {
    return {
      displayName: resolved.name || "Vox",
      handleOverride: "vox",
      profileBio: resolved.bio || "",
    };
  }
  if (mockProf) {
    return {
      displayName: mockProf.name || resolved.name || "",
      handleOverride: null,
      profileBio: mockProf.bio || resolved.bio || "",
    };
  }
  const selfName = isSelf ? localAccount.getDisplayName() : "";
  return {
    displayName: resolved.name || selfName,
    handleOverride: null,
    profileBio: resolved.bio || "",
  };
}

async function loadProfileIdentity(targetAddress, isSelf) {
  const { handle: fetchedHandle, conflictInfo } = await fetchHandleWithConflict(targetAddress);
  const mockProf = mock.getMockProfile(targetAddress);
  const resolved = await profileDirectory.resolveProfile(targetAddress);
  const { displayName, handleOverride, profileBio } = resolveIdentityFields(targetAddress, isSelf, resolved, mockProf);
  const handle = handleOverride || fetchedHandle;
  const pixKey = isSelf ? (localAccount.getPixKey() || "") : (mockProf?.pixKey || "");
  const pixKeyMasked = pixKey ? pixKeyHelper.maskForDisplay(pixKey) : "";
  return { handle, conflictInfo, mockProf, displayName, profileBio, pixKey, pixKeyMasked };
}

async function loadProfilePosts(targetAddress, isSelf, user, mockProf) {
  const localPosts = await cacheNode.getLocalPosts({ type: "topic" });
  let authorPosts = localPosts.filter((p) => (p.author || p.owner) === targetAddress);
  if (isSelf) authorPosts = postOwnership.mapOwnLocalFlags(authorPosts, user);
  if (!authorPosts.length && mockProf) {
    authorPosts = mock.MOCK_DEMO_TOPICS.filter((t) => t.author === targetAddress);
  }
  const allAvailable = [...localPosts, ...mock.MOCK_DEMO_TOPICS, ...getCachedBskyPosts()];
  const starredPosts = collectByIds(allAvailable, social.getStarredPostIds());
  const savedPosts = collectByIds(allAvailable, social.getSavedPostIds());
  return { authorPosts, allAvailable, starredPosts, savedPosts };
}

function resolveProfileSocialFields(isSelf, targetAddress, mockProf) {
  if (isSelf) {
    const readme = social.getLocalReadme();
    const enrich = localAccount.getProfileEnrichment();
    return {
      githubHandle: social.getLocalGithubHandle(),
      readme,
      finalReadme: readme,
      pinnedPostId: social.getPinnedPostId(targetAddress),
      oauthProvider: enrich ? enrich.oauthProvider || "" : "",
    };
  }
  const readme = mockProf ? mockProf.readme || "" : "";
  return {
    githubHandle: mockProf ? mockProf.githubHandle || "" : "",
    readme,
    finalReadme: readme,
    pinnedPostId: mockProf ? mockProf.pinnedPostId || "" : "",
    oauthProvider: "",
  };
}

function buildProfileDataObject({
  targetAddress, isSelf, ident, postsData, balance, memberships, dmPub, activeTab,
}) {
  const soc = resolveProfileSocialFields(isSelf, targetAddress, ident.mockProf);
  return {
    address: targetAddress,
    isCurrentWallet: isSelf,
    handle: ident.handle || "",
    isConflict: Boolean(ident.conflictInfo?.isConflict),
    claimants: ident.conflictInfo?.claimants || [],
    displayName: ident.displayName,
    profileBio: ident.profileBio,
    stats: ident.mockProf?.stats || null,
    posts: postsData.authorPosts,
    authorPostList: postsData.authorPosts,
    allAvailablePosts: postsData.allAvailable,
    starredPosts: postsData.starredPosts,
    savedPosts: postsData.savedPosts,
    hasWallet: wallet.hasWallet(),
    balance,
    pixKey: ident.pixKey,
    pixKeyMasked: ident.pixKeyMasked,
    ...soc,
    isBlocked: mod.isUserBlocked(targetAddress),
    isMuted: mod.isUserMuted(targetAddress),
    meshDiscoverable: localAccount.getMeshDiscoverable(),
    memberships, dmPub, activeTab,
  };
}

async function loadProfileData(targetAddress, isSelf, user, activeTab = "posts") {
  if (activeProfileCache && activeProfileCache.address === targetAddress) {
    const all = activeProfileCache.allAvailablePosts || [];
    activeProfileCache.starredPosts = collectByIds(all, social.getStarredPostIds());
    activeProfileCache.savedPosts = collectByIds(all, social.getSavedPostIds());
    activeProfileCache.activeTab = activeTab;
    return activeProfileCache;
  }

  const memberships = await loadProfileMemberships(targetAddress);
  const { dmPub, balance } = await loadProfileWalletAndDm(isSelf);
  const ident = await loadProfileIdentity(targetAddress, isSelf);
  if (ident.mockProf && !memberships.some((x) => x.communityId === "demo-aprenda-vox")) {
    memberships.push({ id: `mem_${targetAddress}`, communityId: "demo-aprenda-vox" });
  }
  const postsData = await loadProfilePosts(targetAddress, isSelf, user, ident.mockProf);

  const data = buildProfileDataObject({
    targetAddress, isSelf, ident, postsData, balance, memberships, dmPub, activeTab,
  });
  activeProfileCache = data;
  return data;
}

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
  render.renderProfile(main, targetAddress, pData.memberships, isSelf, JSON.stringify(pData.dmPub), pData);

  bindProfileButtons(user, targetAddress, isSelf, pData.dmPub, activeTab);
}

function readSovereigntyPassphrase() {
  return document.getElementById("input-sovereignty-passphrase")?.value || "";
}

function downloadSovereigntyFile(jsonStr, routeId) {
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vox-soberania-${routeId || "identity"}.voxid`;
  a.click();
  URL.revokeObjectURL(url);
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
      const jsonStr = await localAccount.exportAccountBundle(readSovereigntyPassphrase());
      downloadSovereigntyFile(jsonStr, JSON.parse(jsonStr).routeId);
      share.showToast("Arquivo de soberania exportado — guarde offline.");
    } catch (err) {
      share.showToast(`Erro ao exportar backup: ${err.message}`, "error");
    }
  });
}

async function restoreSovereigntyFile(file, activeTab) {
  const text = await file.text();
  const secret = await resolveImportPassphrase(text, readSovereigntyPassphrase());
  const ok = await localAccount.importAccountBundle(text, secret);
  if (!ok) {
    share.showToast("Falha ao validar chaves do backup.", "error");
    return;
  }
  share.showToast("Identidade restaurada com sucesso!");
  showProfile(null, activeTab);
}

function bindSovereigntyImport(activeTab) {
  const input = document.getElementById("file-import-account");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await restoreSovereigntyFile(file, activeTab);
    } catch (err) {
      share.showToast(`Erro ao importar: ${err.message}`, "error");
    }
  });
}

function bindSovereigntyBackup(isSelf, activeTab) {
  if (!isSelf) return;
  bindSovereigntyExport();
  bindSovereigntyImport(activeTab);
}

function clearPassphraseField() {
  const el = document.getElementById("input-sovereignty-passphrase");
  if (el) el.value = "";
}

async function runLocalWipe(activeTab) {
  if (!localAccount.confirmLocalWipe()) return;
  clearPassphraseField();
  localAccount.wipeLocalAccount();
  share.showToast("Chaves deste navegador apagadas.");
  await showProfile(null, activeTab);
}

function bindLocalWipe(isSelf, activeTab) {
  const btn = document.getElementById("btn-wipe-local-account");
  if (!isSelf || !btn) return;
  btn.addEventListener("click", () => {
    void runLocalWipe(activeTab);
  });
}

function handlePixFormSubmit(rawVal, feedback, address, activeTab) {
  if (!rawVal) {
    invalidateProfileCache();
    localAccount.clearPixKey();
    share.showToast("Chave Pix removida do perfil.");
    showProfile(address, activeTab);
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
  showProfile(address, activeTab);
}

function bindPixButtons(address, activeTab, isSelf) {
  const formPixKey = document.getElementById("form-pix-key");
  if (formPixKey && isSelf) {
    formPixKey.addEventListener("submit", (e) => {
      e.preventDefault();
      const rawVal = document.getElementById("input-pix-key")?.value.trim() || "";
      const feedback = document.getElementById("pix-feedback");
      handlePixFormSubmit(rawVal, feedback, address, activeTab);
    });
  }

  const btnClearPix = document.getElementById("btn-clear-pix");
  if (btnClearPix && isSelf) {
    btnClearPix.addEventListener("click", () => {
      invalidateProfileCache();
      localAccount.clearPixKey();
      share.showToast("Chave Pix removida.");
      showProfile(address, activeTab);
    });
  }
}

function bindGithubButtons(address, activeTab, isSelf) {
  const formGithub = document.getElementById("form-github-handle");
  if (formGithub && isSelf) {
    formGithub.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("input-github-handle")?.value.trim() || "";
      invalidateProfileCache();
      social.setLocalGithubHandle(val);
      share.showToast(val ? "Perfil do GitHub salvo!" : "GitHub removido.");
      showProfile(address, activeTab);
    });
  }

  const btnClearGithub = document.getElementById("btn-clear-github");
  if (btnClearGithub && isSelf) {
    btnClearGithub.addEventListener("click", () => {
      invalidateProfileCache();
      social.setLocalGithubHandle("");
      share.showToast("GitHub removido.");
      showProfile(address, activeTab);
    });
  }
}

function bindReadmeButtons(address, activeTab, isSelf) {
  const btnToggleReadme = document.getElementById("btn-toggle-edit-readme");
  const formReadme = document.getElementById("form-edit-readme");
  const readmeView = document.getElementById("readme-view");
  if (btnToggleReadme && formReadme) {
    btnToggleReadme.addEventListener("click", () => {
      const isHidden = formReadme.style.display === "none";
      formReadme.style.display = isHidden ? "block" : "none";
      if (readmeView) readmeView.style.display = isHidden ? "none" : "block";
    });
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
      showProfile(address, activeTab);
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

function bindSharingAndClipboardButtons(address) {
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
    void share.shareConnect({ routeId: address, displayName: localAccount.getDisplayName() });
  });

  bindQrShareButtons(address);
}

function bindDisplayNameAndOAuthButtons(address, activeTab) {
  const formDisplayName = document.getElementById("form-display-name");
  if (formDisplayName) {
    formDisplayName.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("input-display-name")?.value.trim();
      invalidateProfileCache();
      localAccount.setDisplayName(name);
      share.showToast("Nome local atualizado!");
      void meshProfile.syncMeshProfileCard();
      showProfile(address);
    });
  }

  document.getElementById("profile-mesh-discoverable")?.addEventListener("change", (e) => {
    localAccount.setMeshDiscoverable(Boolean(e.target.checked));
    void meshProfile.syncMeshProfileCard().then(() => {
      share.showToast(e.target.checked ? "Cartão publicado na malha." : "Cartão revogado na malha.");
      showProfile(address, activeTab);
    });
  });

  document.getElementById("btn-open-oauth-modal")?.addEventListener("click", () => {
    openOAuthEnrichModal({ onComplete: () => showProfile(address, activeTab) });
  });

  document.getElementById("btn-clear-oauth-enrich")?.addEventListener("click", () => {
    localAccount.clearProfileEnrichment();
    share.showToast("Nome/foto importados removidos.");
    void meshProfile.syncMeshProfileCard();
    showProfile(address, activeTab);
  });
}

function bindCreateVaultAccount(isSelf) {
  const formCreateVault = document.getElementById("form-create-vault-account");
  if (!formCreateVault || !isSelf) return;
  formCreateVault.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("input-new-account-name")?.value.trim() || "";
    if (!name) return;
    try {
      const newAcc = await localAccount.createAdditionalAccount({ displayName: name });
      profileDirectory.setProfileCard(newAcc.routeId, { name, updatedAt: Date.now() });
      share.showToast(`Nova conta "${name}" criada e ativada!`);
      await showProfile(newAcc.routeId, "about");
    } catch (err) {
      share.showToast(`Erro ao criar conta: ${err.message}`, "error");
    }
  });
}

function bindRemoveVaultAccount(address) {
  document.querySelectorAll(".btn-remove-vault-account").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const targetRoute = btn.dataset.route;
      if (!targetRoute) return;
      if (confirm("Remover esta conta do cofre local deste aparelho?")) {
        localAccount.removeVaultAccount(targetRoute);
        share.showToast("Conta removida do cofre.");
        showProfile(address, "about");
      }
    });
  });
}

function bindSwitchAndRemoveVaultAccounts(address) {
  document.querySelectorAll(".btn-switch-vault-account").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const targetRoute = btn.dataset.route;
      if (!targetRoute) return;
      try {
        const ok = await localAccount.switchActiveAccount(targetRoute);
        if (ok) {
          share.showToast("Identidade alternada com sucesso!");
          await showProfile(targetRoute, "about");
        } else {
          share.showToast("Falha ao alternar conta.", "error");
        }
      } catch (err) {
        share.showToast(`Erro ao alternar: ${err.message}`, "error");
      }
    });
  });

  bindRemoveVaultAccount(address);
}

function bindVaultAccountButtons(address, isSelf) {
  bindCreateVaultAccount(isSelf);
  bindSwitchAndRemoveVaultAccounts(address);
}

function bindWalletGenerateAndDisconnect(address) {
  const btnGenWallet = document.getElementById("btn-generate-wallet");
  if (btnGenWallet) {
    btnGenWallet.addEventListener("click", async () => {
      btnGenWallet.disabled = true;
      btnGenWallet.textContent = "Gerando carteira…";
      try {
        await wallet.generateNewWallet();
        await syncIdentity();
        share.showToast("Carteira Arweave gerada com sucesso!");
        showProfile(address);
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btnGenWallet.disabled = false;
        btnGenWallet.textContent = "⚡ Gerar Carteira Arweave";
      }
    });
  }

  const btnDiscWallet = document.getElementById("btn-disconnect-wallet");
  if (btnDiscWallet) {
    btnDiscWallet.addEventListener("click", () => {
      if (confirm("Desconectar carteira Arweave deste navegador?")) {
        wallet.removeWallet();
        share.showToast("Carteira desconectada.");
        showProfile(address);
      }
    });
  }
}

function bindWalletAndDmButtons(address, isSelf, dmPub, user) {
  bindWalletGenerateAndDisconnect(address);

  const btnCopy = document.getElementById("btn-copy-dmpub");
  if (btnCopy && dmPub) {
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(dmPub));
      share.showToast("Chave pública Dm-Pub copiada!");
    });
  }

  bindPublishDmPubButton(isSelf, dmPub);
  bindClaimHandleButton(isSelf, user);
}

function bindPublishDmPubButton(isSelf, dmPub) {
  const btnPub = document.getElementById("btn-publish-dmpub");
  if (!btnPub || !isSelf || !dmPub) return;
  btnPub.addEventListener("click", async () => {
    if (!wallet.hasWallet()) {
      share.showToast("Conecte uma carteira Arweave para anunciar on-chain.", "error");
      return;
    }
    btnPub.disabled = true;
    btnPub.textContent = "Anunciando on-chain…";
    try {
      const pubStr = JSON.stringify(dmPub);
      const tags = upload.buildTags("profile-key", { "Dm-Pub": pubStr });
      await upload.postData({ type: "profile-key", dmPub: pubStr }, tags);
      share.showToast("Chave pública anunciada com sucesso!");
      btnPub.textContent = "✓ Anunciada";
    } catch (err) {
      share.showToast(`Erro ao anunciar: ${err.message}`, "error");
      btnPub.disabled = false;
      btnPub.textContent = "🌐 Publicar Chave on-chain";
    }
  });
}

async function executeClaimHandle(slug, user) {
  const tags = upload.buildTags("handle", { Handle: slug, "Owner-Addr": user });
  await upload.postData({ handle: slug, owner: user }, tags);
  handles.cacheHandleMapping(slug, user);
  share.showToast(`Handle @${slug} gravado com sucesso!`);
  showProfile(user);
}

function bindClaimHandleButton(isSelf, user) {
  const formClaim = document.getElementById("form-claim-handle");
  if (!formClaim || !isSelf) return;
  formClaim.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!wallet.hasWallet()) {
      share.showToast("Conecte uma carteira Arweave para reivindicar handle on-chain.", "error");
      return;
    }
    const raw = document.getElementById("input-handle-slug")?.value.trim();
    const check = handles.validateSlug(raw);
    if (!check.valid) {
      share.showToast(check.error, "error");
      return;
    }
    const btn = document.getElementById("btn-submit-handle");
    btn.disabled = true;
    btn.textContent = "Gravando handle…";
    try {
      await executeClaimHandle(check.slug, user);
    } catch (err) {
      share.showToast(`Erro ao gravar handle: ${err.message}`, "error");
      btn.disabled = false;
      btn.textContent = "Salvar @handle";
    }
  });
}

function bindBlockAndMuteButtons(address, activeTab, isSelf) {
  const btnToggleBlock = document.getElementById("btn-toggle-block");
  if (btnToggleBlock && !isSelf) {
    btnToggleBlock.addEventListener("click", () => {
      const route = btnToggleBlock.dataset.route || address;
      if (mod.isUserBlocked(route)) {
        mod.unblockUser(route);
        share.showToast("Autor desbloqueado.");
      } else {
        mod.blockUser(route);
        share.showToast("Autor bloqueado (posts ocultados e fofocas descartadas).");
      }
      showProfile(address, activeTab);
    });
  }

  const btnToggleMute = document.getElementById("btn-toggle-mute");
  if (btnToggleMute && !isSelf) {
    btnToggleMute.addEventListener("click", () => {
      const route = btnToggleMute.dataset.route || address;
      if (mod.isUserMuted(route)) {
        mod.unmuteUser(route);
        share.showToast("Autor desilenciado.");
      } else {
        mod.muteUser(route);
        share.showToast("Autor silenciado no feed.");
      }
      showProfile(address, activeTab);
    });
  }
}

export function bindProfileButtons(user, address, isSelf, dmPub, activeTab = "posts") {
  bindPixButtons(address, activeTab, isSelf);
  bindGithubButtons(address, activeTab, isSelf);
  bindReadmeButtons(address, activeTab, isSelf);
  bindSharingAndClipboardButtons(address);
  bindDisplayNameAndOAuthButtons(address, activeTab);
  bindVaultAccountButtons(address, isSelf);
  bindWalletAndDmButtons(address, isSelf, dmPub, user);
  bindSovereigntyBackup(isSelf, activeTab);
  bindLocalWipe(isSelf, activeTab);
  bindBlockAndMuteButtons(address, activeTab, isSelf);
}

function renderHandleLookupResult(main, slug, result) {
  if (!result || !result.primaryOwner) {
    if (/^vox-[a-z0-9]+$/i.test(slug)) {
      location.hash = "#/";
      return;
    }
    main.innerHTML = "";
    render.renderProfileGridNotFound(main, {
      handle: slug,
      bodyHtml: `<div class="empty"><p>Nenhum endereço encontrado para o perfil <code>@${render.escapeHtml(slug)}</code>.</p></div>`,
      actionsHtml: `<a class="btn btn-outline" href="#/">Voltar ao início</a>`,
    });
    return;
  }
  if (result.isConflict) {
    main.innerHTML = "";
    render.renderHandleConflict(main, slug, result.claimants);
    return;
  }
  location.hash = `#/u/${encodeURIComponent(result.primaryOwner)}`;
}

export async function showHandleLookup(rawSlug) {
  const user = await getActiveUser();
  const slug = handles.normalizeSlug(rawSlug);
  const main = render.renderShell(makeShellProps(user, "profile", `@${slug || "handle"}`));
  render.renderLoading(main, `Buscando perfil de @${slug}…`);

  const validation = handles.validateSlug(slug);
  if (!validation.valid) {
    main.innerHTML = "";
    render.renderError(main, `Handle inválido: ${validation.error}`);
    return;
  }

  const result = await gql.fetchHandle(slug);
  renderHandleLookupResult(main, slug, result);
}

function bindWalletGenerateAction() {
  const btnGen = document.getElementById("btn-generate-wallet");
  if (!btnGen) return;
  btnGen.addEventListener("click", async () => {
    btnGen.disabled = true;
    btnGen.textContent = "Gerando par de chaves Arweave…";
    try {
      await wallet.generateNewWallet();
      await syncIdentity();
      share.showToast("Carteira criada com sucesso!");
      showWallet();
    } catch (err) {
      share.showToast(`Erro ao gerar: ${err.message}`, "error");
      btnGen.disabled = false;
      btnGen.textContent = "⚡ Gerar Nova Carteira";
    }
  });
}

function bindWalletImportAndDisconnect() {
  const formImport = document.getElementById("form-import-wallet");
  if (formImport) {
    formImport.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("wallet-jwk-input")?.value.trim();
      try {
        const jwk = JSON.parse(input);
        wallet.saveJwk(jwk);
        await syncIdentity();
        share.showToast("Carteira importada e salva localmente!");
        showWallet();
      } catch {
        share.showToast("JSON JWK inválido. Verifique o formato.", "error");
      }
    });
  }

  const btnDisc = document.getElementById("btn-disconnect-wallet");
  if (btnDisc) {
    btnDisc.addEventListener("click", () => {
      if (confirm("Remover a carteira deste navegador? Certifique-se de ter backup.")) {
        wallet.removeWallet();
        share.showToast("Carteira removida do navegador.");
        showWallet();
      }
    });
  }
}

export async function showWallet() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Carteira"));

  let balance = "0.000";
  if (user) {
    try {
      balance = await wallet.getBalance(user);
    } catch {
      balance = "Indisponível";
    }
  }

  render.renderWallet(main, { address: user, balance, hasWallet: wallet.hasWallet() });
  bindWalletGenerateAction();
  bindWalletImportAndDisconnect();
}

function resolveProfileByPixKey(cleanQuery, myPix, myRouteId) {
  if (myPix && (myPix.toLowerCase() === cleanQuery.toLowerCase() || pixKeyHelper.normalizePixKey(cleanQuery).normalized === myPix)) {
    return {
      routeId: myRouteId,
      name: localAccount.getDisplayName() || "Você",
      handle: "",
      pixKey: myPix,
      pixKeyMasked: pixKeyHelper.maskForDisplay(myPix),
    };
  }
  const mockFound = mock.findMockByPixKey(cleanQuery);
  if (mockFound) {
    return {
      routeId: mockFound.routeId,
      name: mockFound.name,
      handle: mockFound.handle,
      pixKey: mockFound.pixKey,
      pixKeyMasked: pixKeyHelper.maskForDisplay(mockFound.pixKey),
    };
  }
  return null;
}

export async function showPixLookup(query) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Consulta Pix"));
  render.renderLoading(main);

  const cleanQuery = String(query || "").trim();
  const myPix = localAccount.getPixKey();
  const myRouteId = await localAccount.getRouteId();
  const foundProfile = resolveProfileByPixKey(cleanQuery, myPix, myRouteId);

  main.innerHTML = "";
  render.renderPixLookup(main, query, foundProfile);
}
