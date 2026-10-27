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
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as oauthProfile from "../oauth-profile.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";
import { syncIdentity } from "./screens-network.js";
import { KIND_WRAPPED, peekBackupKind } from "../account-backup-wrap.js";

export async function showProfile(address, activeTab = "posts") {
  const user = await getActiveUser();
  const targetAddress = address || user;
  const isSelf = targetAddress === user || targetAddress === (await localAccount.getRouteId());
  const main = render.renderShell(makeShellProps(user, "profile", "Perfil"));
  render.renderLoading(main);

  const memberships = await gql.fetchUserMemberships(targetAddress);
  const localMems = await cacheNode.getLocalPosts({ type: "membership" });
  for (const m of localMems) {
    if (m.author === targetAddress && !memberships.some((x) => x.communityId === m.communityId)) {
      memberships.push({ id: m.id, communityId: m.communityId });
    }
  }

  const handle = await gql.fetchHandleForAddress(targetAddress);
  let conflictInfo = null;
  if (handle) {
    const hRes = await gql.fetchHandle(handle);
    if (hRes?.isConflict) conflictInfo = hRes;
  }

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

  const mockProf = mock.getMockProfile(targetAddress);
  const resolved = await profileDirectory.resolveProfile(targetAddress);
  let displayName = resolved.name || (isSelf ? localAccount.getDisplayName() : "");
  let profileBio = resolved.bio || "";
  const oauthProvider = isSelf ? localAccount.getProfileEnrichment()?.oauthProvider || "" : "";
  let pixKey = "";
  if (isSelf) {
    pixKey = localAccount.getPixKey() || "";
  } else if (mockProf?.pixKey) {
    pixKey = mockProf.pixKey;
  }
  const pixKeyMasked = pixKey ? pixKeyHelper.maskForDisplay(pixKey) : "";

  if (welcomeProfile.isWelcomeRouteId(targetAddress)) {
    displayName = resolved.name;
    profileBio = resolved.bio || profileBio;
  } else if (mockProf) {
    displayName = mockProf.name || displayName;
    profileBio = mockProf.bio || profileBio;
    if (!memberships.some((x) => x.communityId === "demo-aprenda-vox")) {
      memberships.push({ id: `mem_${targetAddress}`, communityId: "demo-aprenda-vox" });
    }
  }

  // Busca posts deste autor
  const localPosts = await cacheNode.getLocalPosts({ type: "topic" });
  let authorPosts = localPosts.filter((p) => (p.author || p.owner) === targetAddress);
  if (isSelf) authorPosts = postOwnership.mapOwnLocalFlags(authorPosts, user);
  if (!authorPosts.length && mockProf) {
    authorPosts = mock.MOCK_DEMO_TOPICS.filter((t) => t.author === targetAddress);
  }

  // Busca posts favoritados com estrela ⭐
  const starredSet = new Set(social.getStarredPostIds());
  const allAvailablePosts = [...localPosts, ...mock.MOCK_DEMO_TOPICS];
  const seenStarred = new Set();
  const starredPosts = [];
  for (const p of allAvailablePosts) {
    if (starredSet.has(p.id) && !seenStarred.has(p.id)) {
      seenStarred.add(p.id);
      starredPosts.push(p);
    }
  }

  const githubHandle = isSelf ? social.getLocalGithubHandle() : (mockProf?.githubHandle || "");
  const readme = isSelf ? social.getLocalReadme() : (mockProf?.readme || "");
  const pinnedPostId = isSelf ? social.getPinnedPostId(targetAddress) : (mockProf?.pinnedPostId || "");

  const isBlocked = mod.isUserBlocked(targetAddress);
  const isMuted = mod.isUserMuted(targetAddress);

  main.innerHTML = "";
  render.renderProfile(main, targetAddress, memberships, isSelf, JSON.stringify(dmPub), {
    handle: handle || "",
    isConflict: Boolean(conflictInfo?.isConflict),
    claimants: conflictInfo?.claimants || [],
    displayName,
    profileBio,
    stats: mockProf?.stats || null,
    posts: authorPosts,
    starredPosts,
    hasWallet: wallet.hasWallet(),
    balance,
    pixKey,
    pixKeyMasked,
    githubHandle,
    readme,
    activeTab,
    pinnedPostId,
    oauthProvider,
    isBlocked,
    isMuted,
    meshDiscoverable: localAccount.getMeshDiscoverable(),
  });

  bindProfileButtons(user, targetAddress, isSelf, dmPub, activeTab);
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

export function bindProfileButtons(user, address, isSelf, dmPub, activeTab = "posts") {
  const formPixKey = document.getElementById("form-pix-key");
  if (formPixKey && isSelf) {
    formPixKey.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("input-pix-key");
      const rawVal = input?.value.trim() || "";
      const feedback = document.getElementById("pix-feedback");
      if (!rawVal) {
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
      localAccount.setPixKey(validation.normalized);
      share.showToast("Chave Pix salva no seu perfil local!");
      showProfile(address, activeTab);
    });
  }

  const btnClearPix = document.getElementById("btn-clear-pix");
  if (btnClearPix && isSelf) {
    btnClearPix.addEventListener("click", () => {
      localAccount.clearPixKey();
      share.showToast("Chave Pix removida.");
      showProfile(address, activeTab);
    });
  }

  const formGithub = document.getElementById("form-github-handle");
  if (formGithub && isSelf) {
    formGithub.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("input-github-handle")?.value.trim() || "";
      social.setLocalGithubHandle(val);
      share.showToast(val ? "Perfil do GitHub salvo!" : "GitHub removido.");
      showProfile(address, activeTab);
    });
  }

  const btnClearGithub = document.getElementById("btn-clear-github");
  if (btnClearGithub && isSelf) {
    btnClearGithub.addEventListener("click", () => {
      social.setLocalGithubHandle("");
      share.showToast("GitHub removido.");
      showProfile(address, activeTab);
    });
  }

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
      social.setLocalReadme(val);
      share.showToast("README.md atualizado!");
      showProfile(address, activeTab);
    });
  }

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

  const formDisplayName = document.getElementById("form-display-name");
  if (formDisplayName) {
    formDisplayName.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("input-display-name")?.value.trim();
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

  document.getElementById("btn-clear-oauth-enrich")?.addEventListener("click", () => {
    localAccount.clearProfileEnrichment();
    share.showToast("Nome/foto importados removidos.");
    void meshProfile.syncMeshProfileCard();
    showProfile(address, activeTab);
  });

  document.getElementById("btn-copy-connect-link")?.addEventListener("click", () => {
    void share.shareConnect({ routeId: address, displayName: localAccount.getDisplayName() });
  });

  document.getElementById("btn-qr-connect-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openQrUrlSheet(share.connectShareUrl(address));
  });

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

  const btnCopy = document.getElementById("btn-copy-dmpub");
  if (btnCopy && dmPub) {
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(dmPub));
      share.showToast("Chave pública Dm-Pub copiada!");
    });
  }

  const btnPub = document.getElementById("btn-publish-dmpub");
  if (btnPub && isSelf && dmPub) {
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

  const formClaim = document.getElementById("form-claim-handle");
  if (formClaim && isSelf) {
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
        const tags = upload.buildTags("handle", {
          Handle: check.slug,
          "Owner-Addr": user,
        });
        await upload.postData({ handle: check.slug, owner: user }, tags);
        handles.cacheHandleMapping(check.slug, user);
        share.showToast(`Handle @${check.slug} gravado com sucesso!`);
        showProfile(user);
      } catch (err) {
        share.showToast(`Erro ao gravar handle: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Salvar @handle";
      }
    });
  }

  bindSovereigntyBackup(isSelf, activeTab);
  bindLocalWipe(isSelf, activeTab);

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
  if (!result || !result.primaryOwner) {
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

  render.renderWallet(main, {
    address: user,
    balance,
    hasWallet: wallet.hasWallet(),
  });

  // Evento Gerar Carteira
  const btnGen = document.getElementById("btn-generate-wallet");
  if (btnGen) {
    btnGen.addEventListener("click", async () => {
      btnGen.disabled = true;
      btnGen.textContent = "Gerando par de chaves Arweave…";
      try {
        const { address } = await wallet.generateNewWallet();
        await syncIdentity();
        share.showToast(`Carteira criada com sucesso!`);
        showWallet();
      } catch (err) {
        share.showToast(`Erro ao gerar: ${err.message}`, "error");
        btnGen.disabled = false;
        btnGen.textContent = "⚡ Gerar Nova Carteira";
      }
    });
  }

  // Evento Importar Carteira
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
      } catch (err) {
        share.showToast("JSON JWK inválido. Verifique o formato.", "error");
      }
    });
  }

  // Evento Desconectar Carteira
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

export async function showPixLookup(query) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Consulta Pix"));
  render.renderLoading(main);

  let foundProfile = null;
  const cleanQuery = String(query || "").trim();
  const myPix = localAccount.getPixKey();
  const myRouteId = await localAccount.getRouteId();

  if (myPix && (myPix.toLowerCase() === cleanQuery.toLowerCase() || pixKeyHelper.normalizePixKey(cleanQuery).normalized === myPix)) {
    foundProfile = {
      routeId: myRouteId,
      name: localAccount.getDisplayName() || "Você",
      handle: "",
      pixKey: myPix,
      pixKeyMasked: pixKeyHelper.maskForDisplay(myPix),
    };
  } else {
    const mockFound = mock.findMockByPixKey(cleanQuery);
    if (mockFound) {
      foundProfile = {
        routeId: mockFound.routeId,
        name: mockFound.name,
        handle: mockFound.handle,
        pixKey: mockFound.pixKey,
        pixKeyMasked: pixKeyHelper.maskForDisplay(mockFound.pixKey),
      };
    }
  }

  main.innerHTML = "";
  render.renderPixLookup(main, query, foundProfile);
}
