/**
 * @file Cobertura de `app/profile-screen-lookups.js` (busca de handle e Pix) e `app/profile-screen-data.js`
 * (carga e cache dos dados do perfil), com a rede indisponível e o armazenamento local real.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl } from "./helpers/cov-t3-dom.mjs";

const lookups = await import("../client/js/app/profile-screen-lookups.js");
const data = await import("../client/js/app/profile-screen-data.js");
const handles = await import("../client/js/handles.js");
const localAccount = await import("../client/js/identity/index.js");
const social = await import("../client/js/social.js");
const welcome = await import("../client/js/vox-welcome-profile.js");

const realFetch = globalThis.fetch;

function offlineShell() {
  globalThis.fetch = async () => { throw new Error("sem rede"); };
  globalThis.location = { hash: "#/" };
  const main = makeEl();
  installDom({ ids: { "app-root": makeEl(), "app-main": main } });
  return main;
}

test("showHandleLookup: handle inválido mostra o erro e não navega", async () => {
  const main = offlineShell();
  try {
    await lookups.showHandleLookup("a");
    assert.match(main.innerHTML, /class="error">Handle inválido: /);
    assert.equal(location.hash, "#/");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("showHandleLookup: handle conhecido no cache redireciona para o perfil do dono", async () => {
  const main = offlineShell();
  try {
    handles.cacheHandleMapping("ana-cov-t3", "vx_dona_t3");
    await lookups.showHandleLookup("@Ana-Cov-T3");
    assert.equal(location.hash, "#/u/vx_dona_t3");
    assert.ok(main);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("showHandleLookup: handle desconhecido mostra 'não encontrado' e o formato vox-xxx volta ao início", async () => {
  const main = offlineShell();
  try {
    await lookups.showHandleLookup("ninguem-cov-t3");
    assert.match(main.innerHTML, /Nenhum endereço encontrado para o perfil/);
    assert.match(main.innerHTML, /@ninguem-cov-t3/);
    assert.match(main.innerHTML, /Voltar ao início/);
    location.hash = "#/outra";
    await lookups.showHandleLookup("vox-abc123");
    assert.equal(location.hash, "#/");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("showPixLookup: a própria chave aponta para a conta local; chave desconhecida cai no vazio", async () => {
  const main = offlineShell();
  try {
    await localAccount.ensureLocalAccount();
    const me = await localAccount.getRouteId();
    localAccount.setPixKey({ normalized: "cov.t3@exemplo.br", type: "email", masked: "co***3@exemplo.br" });
    await lookups.showPixLookup("COV.T3@exemplo.br ");
    assert.match(main.innerHTML, /Conta Localizada/);
    assert.match(main.innerHTML, new RegExp(`href="#/dm/${me}"`));
    await lookups.showPixLookup("outra@pessoa.br");
    assert.match(main.innerHTML, /Chave Pix não vinculada/);
    assert.match(main.innerHTML, /outra@pessoa\.br/);
    localAccount.clearPixKey();
    await lookups.showPixLookup(undefined);
    assert.match(main.innerHTML, /Chave Pix não vinculada/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("loadProfileData: perfil próprio traz os dados locais e a segunda chamada vem do cache", async () => {
  globalThis.fetch = async () => { throw new Error("sem rede"); };
  try {
    data.invalidateProfileCache();
    await localAccount.ensureLocalAccount();
    const me = await localAccount.getRouteId();
    localAccount.setDisplayName("Dona Cov T3");
    social.setLocalReadme("readme cov t3");
    social.setLocalGithubHandle("cov-t3");
    const first = await data.loadProfileData(me, true, me, "about");
    assert.equal(first.address, me);
    assert.equal(first.isCurrentWallet, true);
    assert.equal(first.displayName, "Dona Cov T3");
    assert.equal(first.readme, "readme cov t3");
    assert.equal(first.githubHandle, "cov-t3");
    assert.equal(first.activeTab, "about");
    assert.equal(first.hasWallet, false);
    assert.equal(first.balance, "0.000");
    assert.deepEqual(first.posts, []);
    assert.ok(first.dmPub, "a conta própria expõe a chave pública de DM");

    const second = await data.loadProfileData(me, true, me, "saved");
    assert.equal(second, first, "mesmo objeto do cache");
    assert.equal(second.activeTab, "saved");

    data.invalidateProfileCache();
    const third = await data.loadProfileData(me, true, me);
    assert.notEqual(third, first);
    assert.equal(third.activeTab, "posts");
    social.setLocalReadme("");
    social.setLocalGithubHandle("");
  } finally {
    globalThis.fetch = realFetch;
    data.invalidateProfileCache();
  }
});

test("loadProfileData: conta oficial de boas-vindas usa nome Vox, handle vox e a comunidade demo", async () => {
  globalThis.fetch = async () => { throw new Error("sem rede"); };
  try {
    data.invalidateProfileCache();
    const out = await data.loadProfileData(welcome.WELCOME_ROUTE_ID, false, "vx_outra_t3");
    assert.equal(out.displayName, "Vox");
    assert.equal(out.handle, "vox");
    assert.equal(out.isCurrentWallet, false);
    assert.equal(out.dmPub, null);
    assert.equal(out.memberships.some((m) => m.communityId === "demo-aprenda-vox"), true);
  } finally {
    globalThis.fetch = realFetch;
    data.invalidateProfileCache();
  }
});

test("loadProfileData: perfil alheio sem dados fica com campos vazios e sem Pix", async () => {
  globalThis.fetch = async () => { throw new Error("sem rede"); };
  try {
    data.invalidateProfileCache();
    const out = await data.loadProfileData("vx_desconhecida_t3", false, "vx_eu_t3", "posts");
    assert.equal(out.displayName, "vx_desconhec", "sem nome, mostra o id curto");
    assert.equal(out.readme, "");
    assert.equal(out.pixKey, "");
    assert.equal(out.pixKeyMasked, "");
    assert.equal(out.oauthProvider, "");
    assert.equal(out.isConflict, false);
    assert.deepEqual(out.claimants, []);
    assert.deepEqual(out.starredPosts, []);
  } finally {
    globalThis.fetch = realFetch;
    data.invalidateProfileCache();
  }
});
