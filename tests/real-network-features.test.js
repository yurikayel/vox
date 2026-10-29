import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

function createContainer() {
  return { innerHTML: "" };
}

const mockElements = new Map();
globalThis.document = {
  getElementById: (id) => mockElements.get(id) || { id, innerHTML: "", appendChild() {} },
  createElement: (tag) => ({ tagName: tag, innerHTML: "" }),
};

const localAccount = await import("../client/js/local-account.js");
const profileDirectory = await import("../client/js/profile-directory.js");
const inlineComposer = await import("../client/js/inline-composer.js");
const renderFeed = await import("../client/js/render/feed.js");
const renderProfile = await import("../client/js/render/profile.js");
const renderCommunity = await import("../client/js/render/community.js");

test("multi-account - cofre permite listar, criar e alternar contas adicionais", async () => {
  const primary = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Conta Primária");
  const initialVault = await localAccount.listVaultAccounts();
  assert.ok(initialVault.length >= 1);
  assert.equal(initialVault.some((a) => a.routeId === primary.routeId), true);

  const secondary = await localAccount.createAdditionalAccount({ displayName: "Conta Secundária" });
  assert.notEqual(secondary.routeId, primary.routeId);
  assert.equal(localAccount.getCachedRouteIdSync(), secondary.routeId);
  assert.equal(localAccount.getDisplayName(), "Conta Secundária");

  const vaultAfterCreate = localAccount.listVaultAccountsSync();
  assert.equal(vaultAfterCreate.length >= 2, true);
  assert.equal(vaultAfterCreate.some((a) => a.routeId === secondary.routeId), true);

  const switched = await localAccount.switchActiveAccount(primary.routeId);
  assert.equal(switched, true);
  assert.equal(localAccount.getCachedRouteIdSync(), primary.routeId);
  assert.equal(localAccount.getDisplayName(), "Conta Primária");

  const removeActiveAttempt = localAccount.removeVaultAccount(primary.routeId);
  assert.equal(removeActiveAttempt, false);

  const removedSecondary = localAccount.removeVaultAccount(secondary.routeId);
  assert.equal(removedSecondary, true);
  const vaultFinal = localAccount.listVaultAccountsSync();
  assert.equal(vaultFinal.some((a) => a.routeId === secondary.routeId), false);
});

test("inline-composer - datalist de comunidades agrega sugestões cívicas e locais", async () => {
  const datalist = { innerHTML: "" };
  mockElements.set("inline-comm-list", datalist);

  await inlineComposer.populateCommunityDatalist();
  assert.ok(datalist.innerHTML.includes('value="geral"'));
  assert.ok(datalist.innerHTML.includes('value="politica"'));
  assert.ok(datalist.innerHTML.includes('value="livre"'));
});

test("feed - renderPostItem estiliza áudio Lo-Fi 48k e vídeo Lo-Fi 360p", () => {
  const audioPost = {
    id: "top_recado_1",
    author: "vx_autor_recado",
    body: "Recado de voz cívico",
    audio: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ8=",
    ts: Date.now(),
  };

  const videoPost = {
    id: "top_video_lofi_1",
    author: "vx_autor_vid",
    body: "Clipe Lo-Fi",
    video: "data:video/mp4;base64,AAAA",
    ts: Date.now(),
  };

  const audioHtml = renderFeed.renderPostItem(audioPost);
  assert.ok(audioHtml.includes("post-media-audio-card"));
  assert.ok(audioHtml.includes("Lo-Fi 48k Opus"));

  const videoHtml = renderFeed.renderPostItem(videoPost);
  assert.ok(videoHtml.includes("post-media-video-container"));
  assert.ok(videoHtml.includes("Lo-Fi 360p"));
});

test("profile - renderiza abas e links de amizades e alternador de contas", () => {
  const container = createContainer();
  renderProfile.renderProfile(container, "vx_test_user", [], true, null, {
    displayName: "Alice",
    posts: [],
    starredPosts: [],
    savedPosts: [],
    activeTab: "about",
  });

  assert.ok(container.innerHTML.includes("profile-vault-accounts"));
  assert.ok(container.innerHTML.includes("Alternador de Contas Locais"));
  assert.ok(container.innerHTML.includes("Amizades"));

  const netContainer = createContainer();
  renderProfile.renderProfile(netContainer, "vx_test_user", [], true, null, {
    displayName: "Alice",
    activeTab: "following",
  });
  assert.ok(netContainer.innerHTML.includes("profile-grid-network"));
  assert.ok(netContainer.innerHTML.includes("Acompanhados / Amizades"));
});

test("community - botão de exportar gênesis presente na barra de ferramentas", () => {
  const main = createContainer();
  renderCommunity.renderCommunity(main, "geral", [], { title: "Geral" });
  assert.ok(main.innerHTML.includes("btn-export-comm-genesis"));
  assert.ok(main.innerHTML.includes("Gênesis"));
});

test("profile-directory - resolve nomes e avatares de contas do cofre", async () => {
  const acc = await localAccount.createAdditionalAccount({ displayName: "Clarice Lispector" });
  profileDirectory.setProfileCard(acc.routeId, { name: "Clarice Lispector", avatarUrl: "https://avatar.test/clarice.png" });

  const resolvedName = profileDirectory.getAuthorDisplaySync(acc.routeId);
  assert.equal(resolvedName, "Clarice Lispector");

  const resolvedAvatar = profileDirectory.getAuthorAvatarSync(acc.routeId);
  assert.equal(resolvedAvatar, "https://avatar.test/clarice.png");

  localAccount.wipeLocalAccount();
});
