/**
 * @file Cobertura de `app/screens-profile.js`: montagem do perfil (primeira vez e troca de aba no
 * layout existente), ligação dos botões e fachadas de carteira, handle e Pix.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl, waitFor, withToasts } from "./helpers/cov-t3-dom.mjs";

const screens = await import("../client/js/app/screens-profile.js");
const localAccount = await import("../client/js/identity/index.js");
const social = await import("../client/js/social.js");

const realFetch = globalThis.fetch;

function offline() {
  globalThis.fetch = async () => { throw new Error("sem rede"); };
  globalThis.location = { hash: "#/", origin: "https://vox.test", pathname: "/" };
}

test("showProfile: primeira montagem renderiza o layout do próprio perfil na aba pedida", async () => {
  offline();
  try {
    await localAccount.ensureLocalAccount();
    const me = await localAccount.getRouteId();
    const main = makeEl();
    installDom({ ids: { "app-root": makeEl(), "app-main": main } });
    await screens.showProfile(undefined, "about");
    assert.match(main.innerHTML, new RegExp(`data-profile-address="${me}"`));
    assert.match(main.innerHTML, /id="profile-tab-content"/);
    assert.match(main.innerHTML, /ID de rede: <code>/);
  } finally {
    globalThis.fetch = realFetch;
    screens.invalidateProfileCache();
  }
});

test("showProfile: com o layout já montado só troca o conteúdo da aba e o indicador ativo", async () => {
  offline();
  try {
    await localAccount.ensureLocalAccount();
    const me = await localAccount.getRouteId();
    screens.invalidateProfileCache();
    const slot = makeEl();
    const tabPosts = makeEl({ dataset: { tab: "posts" } });
    const tabAbout = makeEl({ dataset: { tab: "about" } });
    tabPosts.classList.add("active");
    const nav = makeEl();
    nav.querySelectorAll = () => [tabPosts, tabAbout];
    const layout = makeEl();
    layout.querySelector = (sel) => (sel === "#profile-tab-content" ? slot : sel === ".profile-grid-tabs" ? nav : null);
    const { document } = installDom({ ids: { "app-root": makeEl(), "app-main": makeEl() } });
    document.querySelector = (sel) => (sel === `.profile-grid-layout[data-profile-address="${me}"]` ? layout : null);

    await screens.showProfile(me, "starred");
    assert.equal(tabAbout.classList.contains("active"), true, "legado starred acende Sobre");
    assert.equal(tabPosts.classList.contains("active"), false);
    assert.match(slot.innerHTML, /profile-grid-about/);

    await screens.showProfile(me, "followers");
    assert.equal(tabPosts.classList.contains("active"), false);
    assert.match(slot.innerHTML, /Seguidores/);
    await screens.showProfile(me);
    assert.equal(tabPosts.classList.contains("active"), true);
  } finally {
    globalThis.fetch = realFetch;
    screens.invalidateProfileCache();
  }
});

test("bindProfileButtons: salvar o README recarrega o perfil na mesma aba", async () => {
  await withToasts(async () => {
    offline();
    try {
      await localAccount.ensureLocalAccount();
      const me = await localAccount.getRouteId();
      screens.invalidateProfileCache();
      const form = makeEl();
      const main = makeEl();
      installDom({
        ids: {
          "app-root": makeEl(), "app-main": main, "form-edit-readme": form,
          "input-profile-readme": makeEl({ value: "readme pelo botão" }),
        },
      });
      screens.bindProfileButtons(me, me, true, null, "about");
      await form.fire("submit");
      assert.equal(social.getLocalReadme(), "readme pelo botão");
      await waitFor(() => /readme pelo botão/.test(main.innerHTML));
      assert.match(main.innerHTML, /readme pelo botão/);
    } finally {
      social.setLocalReadme("");
      globalThis.fetch = realFetch;
      screens.invalidateProfileCache();
    }
  });
});

test("bindProfileButtons: salvar identidade invalida o cache e recarrega", async () => {
  await withToasts(async () => {
    offline();
    try {
      await localAccount.ensureLocalAccount();
      const me = await localAccount.getRouteId();
      const form = makeEl();
      const main = makeEl();
      installDom({
        ids: {
          "app-root": makeEl(), "app-main": main, "form-identity-meta": form,
          "input-profile-pronouns": makeEl({ value: "elu/delu" }),
        },
      });
      screens.bindProfileButtons(me, me, true, null, "about");
      await form.fire("submit");
      await waitFor(() => /elu\/delu/.test(main.innerHTML));
      assert.match(main.innerHTML, /elu\/delu/);
    } finally {
      globalThis.fetch = realFetch;
      screens.invalidateProfileCache();
    }
  });
});

test("fachadas: handle desconhecido, Pix e carteira repassam para as telas certas", async () => {
  offline();
  try {
    const main = makeEl();
    installDom({ ids: { "app-root": makeEl(), "app-main": main } });
    await screens.showHandleLookup("ninguem-fachada-t3");
    assert.match(main.innerHTML, /Nenhum endereço encontrado/);
    await screens.showPixLookup("nao-existe@x.co");
    assert.match(main.innerHTML, /Chave Pix não vinculada/);
    await screens.showWallet();
    assert.match(main.innerHTML, /Carteira Soberana/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
