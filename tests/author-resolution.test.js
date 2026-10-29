import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const localAccount = await import("../client/js/local-account.js");
const profileDirectory = await import("../client/js/profile-directory.js");
const util = await import("../client/js/render/util.js");
const feed = await import("../client/js/render/feed.js");
const screensCompose = await import("../client/js/app/screens-compose.js");
const cacheNode = await import("../client/js/cache-node.js");

test("author-resolution - resolve display name da conta ativa sem exibir rota vx_* crua", async () => {
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Militante Soberano");

  // Sem override e sem isOwnLocalPost explícito: deve detectar rota própria pelo cache
  const labelsAuto = util.resolvePostAuthorLabels(acc.routeId);
  assert.equal(labelsAuto.authorDisplay, "Militante Soberano");
  assert.equal(labelsAuto.primary, "Militante Soberano");

  // Se override vier com rota bruta 'vx_...', deve ignorar e resolver o nome real
  const labelsIgnoredRaw = util.resolvePostAuthorLabels(acc.routeId, { authorDisplay: acc.routeId });
  assert.equal(labelsIgnoredRaw.authorDisplay, "Militante Soberano");

  localAccount.wipeLocalAccount();
});

test("author-resolution - resolve display name de cartão de perfil P2P e contas do cofre", async () => {
  const remoteRoute = "vx_remotePeer7777";
  profileDirectory.setProfileCard(remoteRoute, {
    name: "Lúcia Democrata",
    handle: "lucia_democracia",
  });

  const labelsRemote = util.resolvePostAuthorLabels(remoteRoute);
  assert.equal(labelsRemote.authorDisplay, "Lúcia Democrata");
  assert.equal(labelsRemote.authorHandle, "lucia_democracia");

  // Conta do cofre
  const vaultAcc = await localAccount.createAdditionalAccount({ displayName: "Bento Cidadão" });
  const labelsVault = util.resolvePostAuthorLabels(vaultAcc.routeId);
  assert.equal(labelsVault.authorDisplay, "Bento Cidadão");

  localAccount.wipeLocalAccount();
  profileDirectory.removeProfileCard(remoteRoute);
});

test("author-resolution - renderInlineReplyItem renderiza nome do autor em vez de vx_*", async () => {
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Yuri Antigravity");

  const reply = {
    id: "rep_test_disp_1",
    author: acc.routeId,
    body: "Vox! 📢 Comentário de teste real",
    ts: Date.now(),
  };

  const html = feed.renderInlineReplyItem(reply);
  assert.ok(html.includes("Yuri Antigravity"));
  assert.ok(!html.includes(`>${acc.routeId.slice(0, 9)}<`));

  localAccount.wipeLocalAccount();
});

test("author-resolution - persistLocalReply embute authorDisplay e loadInlineReplies enriquece", async () => {
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Ana Livre");

  const signed = await screensCompose.persistLocalReply("top_bem_vindo", "geral", "Comentário assinado real");
  assert.equal(signed.authorDisplay, "Ana Livre");
  assert.equal(signed.author, acc.routeId);

  const loaded = await screensCompose.loadInlineReplies("top_bem_vindo");
  const myReply = loaded.find((r) => r.id === signed.id);
  assert.ok(myReply);
  assert.equal(myReply.isOwnLocalPost, true);
  assert.equal(myReply.authorDisplay, "Ana Livre");

  localAccount.wipeLocalAccount();
});

test("profile - cabeçalho exibe display name como título principal h1 e handle secundário", async () => {
  const renderProfile = await import("../client/js/render/profile.js");
  const main = { innerHTML: "" };
  renderProfile.renderProfile(main, "vx_test_user_777", [], true, "", {
    displayName: "Yuri Kayel",
    handle: "yuri_vox",
  });
  assert.ok(main.innerHTML.includes('<h1 class="profile-grid-name">Yuri Kayel</h1>'));
  assert.ok(main.innerHTML.includes('<p class="profile-grid-handle meta">@yuri_vox</p>'));
});


test("author-resolution - nao trunca nomes como The Intercept para The Inte", () => {
  const labels = util.resolvePostAuthorLabels("The Intercept", {
    authorDisplay: "The Intercept",
    authorHandle: "@theintercept.com",
  });
  assert.equal(labels.primary, "The Intercept");
  assert.equal(labels.authorDisplay, "The Intercept");
  assert.equal(labels.authorHandle, "theintercept.com");
  assert.equal(labels.secondaryHandle, "theintercept.com");
});
