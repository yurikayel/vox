import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as oauth from "../client/js/oauth-profile.js";
import * as localAccount from "../client/js/local-account.js";
import { restoreOrBindGoogleIdentity, computeVaultLookupKey } from "../client/js/oauth-vault.js";

test("oauth-profile - skip marks step complete", () => {
  localStorage.clear();
  oauth.__resetOAuthConfigForTests();
  assert.equal(oauth.hasCompletedOAuthStep(), false);
  oauth.skipOAuthEnrichment();
  assert.equal(oauth.hasSkippedOAuth(), true);
  assert.equal(oauth.hasCompletedOAuthStep(), true);
});

test("oauth-profile - enrichment counts as completed", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  localAccount.setProfileEnrichment({ displayName: "Test", oauthProvider: "google" });
  assert.equal(oauth.hasCompletedOAuthStep(), true);
});

test("oauth-profile - signInWithGithub enriches profile from github api", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.github.com/users/devbrasil")) {
      return {
        ok: true,
        json: async () => ({
          login: "devbrasil",
          name: "Dev Brasil",
          avatar_url: "https://github.com/devbrasil.png",
          bio: "FOSS e Soberania Digital",
        }),
      };
    }
    return { ok: false };
  };

  try {
    const res = await oauth.signInWithGithub("devbrasil");
    assert.equal(res.ok, true);
    assert.equal(res.profile.displayName, "Dev Brasil");
    assert.equal(res.profile.avatarUrl, "https://github.com/devbrasil.png");
    assert.equal(res.profile.handle, "devbrasil");

    const enrichment = localAccount.getProfileEnrichment();
    assert.equal(enrichment.displayName, "Dev Brasil");
    assert.equal(enrichment.oauthProvider, "github");
    assert.equal(localStorage.getItem("vox-profile-github"), "devbrasil");
    assert.equal(oauth.hasCompletedOAuthStep(), true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-profile - applyGoogleCredential switches to existing account if already in vault", async () => {
  const origFetch = globalThis.fetch;
  const mockVault = new Map();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/memory/vault/")) {
      const key = String(url).split("/memory/vault/")[1];
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        mockVault.set(key, body.record);
        return { ok: true, json: async () => ({ status: "saved" }) };
      }
      if (mockVault.has(key)) {
        return { ok: true, json: async () => ({ status: "ok", record: mockVault.get(key) }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    }
    return origFetch(url, opts);
  };

  try {
    localAccount.wipeLocalAccount();
    const acc1 = await localAccount.ensureLocalAccount();

    const fakePayload1 = {
      sub: "google_user_999",
      email: "yuri@example.com",
      name: "Yuri Kayel",
      picture: "https://lh3.googleusercontent.com/a/ACg8oc_test=s96-c",
    };
    const b64Payload1 = Buffer.from(JSON.stringify(fakePayload1)).toString("base64");
    const fakeToken1 = `eyJhbGciOiJSUzI1NiJ9.${b64Payload1}.fake_signature`;

    // 1. Aplica na conta 1
    let res1;
    await new Promise((resolve) => oauth.applyGoogleCredential(fakeToken1, (r) => { res1 = r; resolve(); }));
    assert.equal(res1.ok, true);
    assert.equal(res1.profile.displayName, "Yuri Kayel");

    // 2. Cria uma conta 2 descartável no cofre
    const acc2 = await localAccount.createAdditionalAccount();
    assert.notEqual(acc2.routeId, acc1.routeId);
    assert.equal(localAccount.getCachedRouteIdSync(), acc2.routeId);

    // 3. Tenta enriquecer a conta 2 com a MESMA conta Google
    let res2;
    await new Promise((resolve) => oauth.applyGoogleCredential(fakeToken1, (r) => { res2 = r; resolve(); }));
    assert.equal(res2.ok, true);
    assert.equal(res2.switched, true);
    // Conta ativa foi alternada de volta para acc1!
    assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
    // A conta descartável acc2 foi removida do cofre para não deixar órfão
    const vault = localAccount.listVaultAccountsSync();
    assert.equal(vault.some((v) => v.routeId === acc2.routeId), false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-vault - restoreOrBindGoogleIdentity restores canonical routeId after localStorage wipe", async () => {
  const origFetch = globalThis.fetch;
  const mockVault = new Map();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/memory/vault/")) {
      const key = String(url).split("/memory/vault/")[1];
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        mockVault.set(key, body.record);
        return { ok: true, json: async () => ({ status: "saved" }) };
      }
      if (mockVault.has(key)) {
        return { ok: true, json: async () => ({ status: "ok", record: mockVault.get(key) }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    }
    return origFetch(url, opts);
  };

  try {
    localAccount.wipeLocalAccount();
    const acc1 = await localAccount.ensureLocalAccount();
    const sub = "google_user_test_restore_42";

    // 1. Primeiro vínculo
    const res1 = await restoreOrBindGoogleIdentity({
      sub,
      email: "yuri@test.com",
      name: "Yuri Kayel",
      picture: "https://lh3.googleusercontent.com/a/ACg8oc_restore=s96-c",
    });
    assert.equal(res1.routeId, acc1.routeId);
    assert.equal(res1.restored, false);

    // Guarda o vault backup gerado
    const lookupKey = await computeVaultLookupKey(sub, "google");
    const vaultCipher = localStorage.getItem("vox-oauth-vault-v1:" + lookupKey);
    assert.ok(vaultCipher);

    // 2. Simula desconexão / wipe de chaves deste navegador
    localAccount.wipeLocalAccount();
    assert.equal(localStorage.getItem("vox-local-account-v1"), null);

    // Mantém o backup cifrado (simulado no localStorage/remote)
    localStorage.setItem("vox-oauth-vault-v1:" + lookupKey, vaultCipher);

    // 3. Usuário conecta novamente com a mesma conta Google
    const res2 = await restoreOrBindGoogleIdentity({
      sub,
      email: "yuri@test.com",
      name: "Yuri Kayel",
      picture: "https://lh3.googleusercontent.com/a/ACg8oc_restore=s96-c",
    });

    // RESTAUROU A MESMA IDENTIDADE ORIGINAL!
    assert.equal(res2.restored, true);
    assert.equal(res2.routeId, acc1.routeId);
    assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
  } finally {
    globalThis.fetch = origFetch;
  }
});
